import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs'
import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import {
  LOCAL_MODEL_IDS,
  type LocalModelId,
  type LocalModelStatus,
  type ModelSource
} from '../../../../shared/voice'
import { MODEL_HOSTS, MODEL_SPECS } from './catalog'

const treeSchema = z.array(
  z.object({
    type: z.string(),
    path: z.string(),
    size: z.number().int().nonnegative(),
    lfs: z.object({ oid: z.string().regex(/^[0-9a-f]{64}$/) }).optional()
  })
)

interface RemoteFile {
  path: string
  size: number
  sha256?: string
}

const CONCURRENCY = 4
const RETRIES = 3
const REQUEST_TIMEOUT_MS = 60_000
const PROGRESS_INTERVAL_MS = 250

export class ModelDownloadError extends Error {}

/** Relative path inside the model folder; rejects anything that could escape it. */
function safeRelative(path: string): string | null {
  if (!path || path.includes('\\') || isAbsolute(path)) return null
  const parts = path.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
  return path
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

/**
 * Local sherpa-onnx models under `root/<id>`. Downloads go to `root/<id>.download` (resumable)
 * and are moved into place only after every file has been verified.
 */
export class ModelStore {
  private readonly statuses = new Map<LocalModelId, LocalModelStatus>()
  private readonly controllers = new Map<LocalModelId, AbortController>()
  private lastEmit = 0

  private readonly fetchImpl: typeof fetch
  private readonly retryDelayMs: number

  constructor(
    private readonly root: string,
    private readonly onChange: (statuses: LocalModelStatus[]) => void,
    options: { fetchImpl?: typeof fetch; retryDelayMs?: number } = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.retryDelayMs = options.retryDelayMs ?? 1000
    for (const id of LOCAL_MODEL_IDS) this.statuses.set(id, this.diskStatus(id))
  }

  dir(id: LocalModelId): string {
    return join(this.root, id)
  }

  isReady(id: LocalModelId): boolean {
    return this.statuses.get(id)?.state === 'ready'
  }

  list(): LocalModelStatus[] {
    return LOCAL_MODEL_IDS.map((id) => ({ ...this.statuses.get(id)! }))
  }

  /** Starts a download; resolves when it finishes, fails or is cancelled. */
  async download(id: LocalModelId, source: ModelSource): Promise<void> {
    if (this.controllers.has(id) || this.isReady(id)) return
    const controller = new AbortController()
    this.controllers.set(id, controller)
    const staging = join(this.root, `${id}.download`)
    this.set(id, { state: 'downloading', receivedBytes: 0, totalBytes: 0, error: null })
    try {
      const files = await this.listFiles(id, source, controller.signal)
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
      let received = 0
      const progress = (bytes: number): void => {
        received += bytes
        this.set(id, { receivedBytes: received, totalBytes }, false)
      }
      this.set(id, { totalBytes })

      const queue = [...files]
      const worker = async (): Promise<void> => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          await this.downloadFile(source, id, file, staging, progress, controller.signal)
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))

      await rm(this.dir(id), { recursive: true, force: true })
      await rename(staging, this.dir(id))
      this.set(id, this.diskStatus(id))
    } catch (error) {
      const cancelled = controller.signal.aborted
      if (!cancelled) console.warn(`[models] download of ${id} failed:`, (error as Error).message)
      this.set(id, {
        state: cancelled ? 'missing' : 'error',
        error: cancelled ? null : describe(error)
      })
    } finally {
      this.controllers.delete(id)
    }
  }

  /** Keeps the partial files so the next download resumes. */
  cancel(id: LocalModelId): void {
    this.controllers.get(id)?.abort()
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
  }

  /**
   * Copies a model the user downloaded manually. Accepts the model folder itself or a folder that
   * contains it (e.g. the extracted release archive).
   */
  async importFolder(
    id: LocalModelId,
    folder: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.controllers.has(id)) return { ok: false, error: '正在下载，请先取消下载' }
    const source = await this.findModelFolder(id, folder)
    if (!source) {
      const names = MODEL_SPECS[id].required.join('、')
      return { ok: false, error: `所选文件夹中没有找到完整的模型文件（需要：${names}）` }
    }
    const staging = join(this.root, `${id}.import`)
    try {
      await rm(staging, { recursive: true, force: true })
      await cp(source, staging, { recursive: true })
      await rm(this.dir(id), { recursive: true, force: true })
      await rename(staging, this.dir(id))
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      return { ok: false, error: `复制模型失败：${(error as Error).message}` }
    }
    this.set(id, this.diskStatus(id))
    return { ok: true }
  }

  async remove(id: LocalModelId): Promise<void> {
    this.cancel(id)
    await rm(this.dir(id), { recursive: true, force: true })
    await rm(join(this.root, `${id}.download`), { recursive: true, force: true })
    this.set(id, this.diskStatus(id))
  }

  private diskStatus(id: LocalModelId): LocalModelStatus {
    const ready = hasRequiredFiles(this.dir(id), id)
    return { id, state: ready ? 'ready' : 'missing', receivedBytes: 0, totalBytes: 0, error: null }
  }

  private async findModelFolder(id: LocalModelId, folder: string): Promise<string | null> {
    if (hasRequiredFiles(folder, id)) return folder
    try {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const child = join(folder, entry.name)
        if (entry.isDirectory() && hasRequiredFiles(child, id)) return child
      }
    } catch {
      // unreadable folder: treated as "not found"
    }
    return null
  }

  private async listFiles(
    id: LocalModelId,
    source: ModelSource,
    signal: AbortSignal
  ): Promise<RemoteFile[]> {
    const spec = MODEL_SPECS[id]
    const files: RemoteFile[] = []
    let url: string | null =
      `${MODEL_HOSTS[source]}/api/models/${spec.repo}/tree/main?recursive=true&limit=1000`
    while (url) {
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      })
      if (!response.ok) throw new ModelDownloadError(`获取文件列表失败（HTTP ${response.status}）`)
      const parsed = treeSchema.safeParse(await response.json())
      if (!parsed.success) throw new ModelDownloadError('文件列表格式不正确')
      for (const entry of parsed.data) {
        const path = safeRelative(entry.path)
        if (!path) throw new ModelDownloadError('文件列表包含不安全的路径')
        if (entry.type !== 'file' || !spec.include(path)) continue
        files.push({ path, size: entry.size, sha256: entry.lfs?.oid })
      }
      url = nextPage(response.headers.get('Link'))
    }
    const missing = spec.required.filter((p) => !files.some((f) => f.path === p))
    if (missing.length > 0) throw new ModelDownloadError(`仓库中缺少文件：${missing.join('、')}`)
    return files
  }

  private async downloadFile(
    source: ModelSource,
    id: LocalModelId,
    file: RemoteFile,
    staging: string,
    progress: (bytes: number) => void,
    signal: AbortSignal
  ): Promise<void> {
    const target = resolve(staging, file.path)
    if (relative(staging, target).startsWith('..')) throw new ModelDownloadError('不安全的路径')
    await mkdir(dirname(target), { recursive: true })
    if (existsSync(target) && statSync(target).size === file.size) {
      progress(file.size)
      return
    }

    const part = `${target}.part`
    const url = `${MODEL_HOSTS[source]}/${MODEL_SPECS[id].repo}/resolve/main/${file.path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
    let counted = 0
    for (let attempt = 1; ; attempt++) {
      const offset = existsSync(part) ? (await stat(part)).size : 0
      progress(offset - counted)
      counted = offset
      try {
        if (offset < file.size) {
          const response = await this.fetchImpl(url, {
            headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
            signal
          })
          if (!response.ok || !response.body) {
            throw new ModelDownloadError(`下载 ${file.path} 失败（HTTP ${response.status}）`)
          }
          // A server that ignores Range sends the whole file again.
          const append = offset > 0 && response.status === 206
          if (!append && offset > 0) {
            progress(-counted)
            counted = 0
          }
          const meter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              counted += chunk.length
              progress(chunk.length)
              callback(null, chunk)
            }
          })
          await pipeline(
            Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
            meter,
            createWriteStream(part, { flags: append ? 'a' : 'w' })
          )
        }
        const size = (await stat(part)).size
        if (size !== file.size) throw new ModelDownloadError(`${file.path} 大小不符`)
        if (file.sha256 && (await sha256(part)) !== file.sha256) {
          await rm(part, { force: true })
          progress(-counted)
          counted = 0
          throw new ModelDownloadError(`${file.path} 校验失败`)
        }
        await rename(part, target)
        return
      } catch (error) {
        if (signal.aborted || attempt >= RETRIES) throw error
        await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt))
      }
    }
  }

  private set(id: LocalModelId, patch: Partial<LocalModelStatus>, immediate = true): void {
    this.statuses.set(id, { ...this.statuses.get(id)!, ...patch, id })
    const now = Date.now()
    if (!immediate && now - this.lastEmit < PROGRESS_INTERVAL_MS) return
    this.lastEmit = now
    this.onChange(this.list())
  }
}

function hasRequiredFiles(dir: string, id: LocalModelId): boolean {
  return MODEL_SPECS[id].required.every((file) => {
    try {
      return statSync(join(dir, file)).size > 0
    } catch {
      return false
    }
  })
}

/** Hugging Face paginates the tree API; follow `rel="next"` when present. */
function nextPage(link: string | null): string | null {
  if (!link) return null
  const match = /<([^>]+)>\s*;\s*rel="next"/i.exec(link)
  return match?.[1] ?? null
}

function describe(error: unknown): string {
  if (error instanceof ModelDownloadError) return error.message
  const name = (error as Error | undefined)?.name
  if (name === 'TimeoutError') return '连接超时，请检查网络或换一个下载源'
  return '网络错误，请检查网络或换一个下载源后重试（已下载的部分会保留）'
}
