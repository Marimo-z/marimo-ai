import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelStore } from '../electron/main/services/local-voice/model-store'
import type { LocalModelStatus } from '../shared/voice'

const sha = (data: string): string => createHash('sha256').update(data).digest('hex')

const FILES: Record<string, string> = {
  'model.int8.onnx': 'onnx-model-bytes',
  'tokens.txt': 'a 1\nb 2\n',
  'test_wavs/zh.wav': 'not downloaded'
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'marimo-models-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

interface ServerOptions {
  tree?: unknown
  body?(path: string): string
  ignoreRange?: boolean
}

/** A fake Hugging Face host: the tree API plus `resolve/main/<path>` downloads with Range. */
function fakeHub(options: ServerOptions = {}) {
  const ranges: string[] = []
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/models/')) {
      const tree =
        options.tree ??
        Object.entries(FILES).map(([path, data]) => ({
          type: 'file',
          path,
          size: data.length,
          lfs: path.endsWith('.onnx') ? { oid: sha(data) } : undefined
        }))
      return Response.json(tree)
    }
    const path = decodeURIComponent(url.split('/resolve/main/')[1] ?? '')
    const data = options.body?.(path) ?? FILES[path]
    if (data === undefined) return new Response('', { status: 404 })
    const range = new Headers(init?.headers).get('Range')
    if (range && !options.ignoreRange) {
      ranges.push(range)
      const start = Number(/bytes=(\d+)-/.exec(range)?.[1])
      return new Response(data.slice(start), { status: 206 })
    }
    return new Response(data)
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, ranges, calls: fetchImpl }
}

function store(fetchImpl: typeof fetch) {
  const events: LocalModelStatus[][] = []
  const models = new ModelStore(root, (s) => events.push(s), { fetchImpl, retryDelayMs: 0 })
  return { models, events, status: () => models.list().find((m) => m.id === 'sensevoice')! }
}

describe('ModelStore.download', () => {
  it('downloads only the needed files, verifies them and moves them into place', async () => {
    const hub = fakeHub()
    const { models, status } = store(hub.fetchImpl)
    expect(status().state).toBe('missing')

    await models.download('sensevoice', 'hf-mirror')

    expect(status()).toMatchObject({ state: 'ready', error: null })
    expect(models.isReady('sensevoice')).toBe(true)
    const dir = models.dir('sensevoice')
    expect(readFileSync(join(dir, 'model.int8.onnx'), 'utf8')).toBe(FILES['model.int8.onnx'])
    expect(existsSync(join(dir, 'test_wavs'))).toBe(false)
    expect(existsSync(join(root, 'sensevoice.download'))).toBe(false)
    const urls = hub.calls.mock.calls.map(([u]) => String(u))
    expect(urls[0]).toBe(
      'https://hf-mirror.com/api/models/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tree/main?recursive=true&limit=1000'
    )
  })

  it('resumes a partial file with a Range request', async () => {
    const staging = join(root, 'sensevoice.download')
    mkdirSync(staging, { recursive: true })
    writeFileSync(join(staging, 'model.int8.onnx.part'), FILES['model.int8.onnx'].slice(0, 5))
    const hub = fakeHub()
    const { models, status } = store(hub.fetchImpl)

    await models.download('sensevoice', 'huggingface')

    expect(status().state).toBe('ready')
    expect(hub.ranges).toEqual(['bytes=5-'])
    const model = readFileSync(join(models.dir('sensevoice'), 'model.int8.onnx'), 'utf8')
    expect(model).toBe(FILES['model.int8.onnx'])
  })

  it('starts over when the server ignores Range', async () => {
    const staging = join(root, 'sensevoice.download')
    mkdirSync(staging, { recursive: true })
    writeFileSync(join(staging, 'model.int8.onnx.part'), 'garbage')
    const { models, status } = store(fakeHub({ ignoreRange: true }).fetchImpl)

    await models.download('sensevoice', 'hf-mirror')

    expect(status().state).toBe('ready')
    const model = readFileSync(join(models.dir('sensevoice'), 'model.int8.onnx'), 'utf8')
    expect(model).toBe(FILES['model.int8.onnx'])
  })

  it('rejects a file whose checksum does not match', async () => {
    const hub = fakeHub({ body: (p) => (p === 'model.int8.onnx' ? 'onnx-model-BYTES' : FILES[p]) })
    const { models, status } = store(hub.fetchImpl)

    await models.download('sensevoice', 'hf-mirror')

    expect(status()).toMatchObject({ state: 'error', error: 'model.int8.onnx 校验失败' })
    expect(existsSync(models.dir('sensevoice'))).toBe(false)
  })

  it('refuses paths that would escape the model folder', async () => {
    for (const path of ['../evil.txt', 'a/../../evil.txt', '/abs.txt', 'a\\b.txt']) {
      const tree = [
        { type: 'file', path: 'model.int8.onnx', size: FILES['model.int8.onnx'].length },
        { type: 'file', path: 'tokens.txt', size: FILES['tokens.txt'].length },
        { type: 'file', path, size: 1 }
      ]
      const hub = fakeHub({ tree })
      const { models, status } = store(hub.fetchImpl)
      await models.download('sensevoice', 'hf-mirror')
      expect(status()).toMatchObject({ state: 'error', error: '文件列表包含不安全的路径' })
      expect(hub.calls).toHaveBeenCalledTimes(1)
    }
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
  })

  it('follows the tree API next-page link', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('cursor=page2')) {
        return Response.json([
          {
            type: 'file',
            path: 'tokens.txt',
            size: FILES['tokens.txt'].length
          }
        ])
      }
      return new Response(
        JSON.stringify([
          {
            type: 'file',
            path: 'model.int8.onnx',
            size: FILES['model.int8.onnx'].length,
            lfs: { oid: sha(FILES['model.int8.onnx']) }
          }
        ]),
        {
          headers: {
            'Content-Type': 'application/json',
            Link: '<https://hf-mirror.com/api/models/repo/tree/main?cursor=page2>; rel="next"'
          }
        }
      )
    })
    const body = (path: string): string => FILES[path]
    const wrapped = (async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/resolve/')) {
        const path = decodeURIComponent(url.split('/resolve/main/')[1] ?? '')
        return new Response(body(path))
      }
      return fetchImpl(input)
    }) as typeof fetch
    const { models, status } = store(wrapped)
    await models.download('sensevoice', 'hf-mirror')
    expect(status().state).toBe('ready')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reports a bad file list and missing files', async () => {
    const bad = store(fakeHub({ tree: { error: 'nope' } }).fetchImpl)
    await bad.models.download('sensevoice', 'hf-mirror')
    expect(bad.status()).toMatchObject({ state: 'error', error: '文件列表格式不正确' })

    const tree = [{ type: 'file', path: 'tokens.txt', size: 3 }]
    const partial = store(fakeHub({ tree }).fetchImpl)
    await partial.models.download('sensevoice', 'hf-mirror')
    expect(partial.status().error).toBe('仓库中缺少文件：model.int8.onnx')
  })

  it('cancel keeps the partial download and leaves the model missing', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const hub = fakeHub()
    const slow = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('/resolve/')) {
        await gate
        if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      }
      return hub.fetchImpl(input, init)
    }) as typeof fetch
    const { models, status } = store(slow)

    const pending = models.download('sensevoice', 'hf-mirror')
    await vi.waitFor(() => expect(status().totalBytes).toBeGreaterThan(0))
    expect(status().state).toBe('downloading')
    models.cancel('sensevoice')
    release()
    await pending

    expect(status()).toMatchObject({ state: 'missing', error: null })
    expect(existsSync(join(root, 'sensevoice.download'))).toBe(true)
  })
})

describe('ModelStore.importFolder and remove', () => {
  function writeModel(dir: string): void {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'model.int8.onnx'), 'x')
    writeFileSync(join(dir, 'tokens.txt'), 'y')
  }

  it('accepts the model folder or a folder that contains it', async () => {
    const outer = mkdtempSync(join(tmpdir(), 'marimo-import-'))
    try {
      writeModel(join(outer, 'sherpa-onnx-sense-voice-int8'))
      const { models, status } = store(fakeHub().fetchImpl)
      expect(await models.importFolder('sensevoice', outer)).toEqual({ ok: true })
      expect(status().state).toBe('ready')
      expect(readFileSync(join(models.dir('sensevoice'), 'tokens.txt'), 'utf8')).toBe('y')

      await models.remove('sensevoice')
      expect(status().state).toBe('missing')
      expect(existsSync(models.dir('sensevoice'))).toBe(false)
    } finally {
      rmSync(outer, { recursive: true, force: true })
    }
  })

  it('rejects a folder without the model files', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'marimo-import-'))
    try {
      const { models, status } = store(fakeHub().fetchImpl)
      const result = await models.importFolder('sensevoice', empty)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.error).toContain('model.int8.onnx')
      expect(status().state).toBe('missing')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('treats a model already on disk as ready at startup', () => {
    writeModel(join(root, 'sensevoice'))
    expect(store(fakeHub().fetchImpl).models.isReady('sensevoice')).toBe(true)
  })
})
