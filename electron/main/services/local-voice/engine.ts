import { fork, type ChildProcess } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { decodeWav } from '../../../../shared/wav'
import { LocalEngineError } from './errors'
import { resolveNodeExecutable } from './node-exec'
import { pcmToBase64, type WorkerRequest, type WorkerResponse } from './protocol'

type Payload = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never

interface Pending {
  resolve(response: WorkerResponse): void
  reject(error: Error): void
}

const REQUEST_TIMEOUT_MS = 120_000
const IDLE_SHUTDOWN_MS = 5 * 60_000

function nodeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const modules = join(process.cwd(), 'node_modules')
  env.NODE_PATH = env.NODE_PATH ? `${modules}${delimiter}${env.NODE_PATH}` : modules
  if (process.platform === 'win32') {
    const native = join(modules, 'sherpa-onnx-win-x64')
    env.PATH = `${native}${delimiter}${env.PATH ?? ''}`
  }
  return env
}

/** Forks a real Node process to run sherpa-onnx (Electron cannot return Kokoro's audio buffers). */
export class LocalVoiceEngine {
  private child: ChildProcess | null = null
  private readonly pending = new Map<number, Pending>()
  private seq = 0
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly workerPath: string) {}

  async transcribe(
    modelDir: string,
    samples: Float32Array,
    sampleRate: number,
    signal: AbortSignal
  ): Promise<string> {
    const response = await this.request(
      { type: 'transcribe', modelDir, pcm: pcmToBase64(samples), sampleRate },
      signal
    )
    if (!('text' in response)) throw new LocalEngineError('本地识别返回了意外的结果')
    return response.text
  }

  async synthesize(
    modelDir: string,
    text: string,
    sid: number,
    speed: number,
    signal: AbortSignal
  ): Promise<{ samples: Float32Array; sampleRate: number }> {
    const response = await this.request({ type: 'synthesize', modelDir, text, sid, speed }, signal)
    if (!('wav' in response)) throw new LocalEngineError('本地合成返回了意外的结果')
    const wav = Uint8Array.from(Buffer.from(response.wav, 'base64'))
    const decoded = decodeWav(wav)
    if (!decoded) throw new LocalEngineError('本地合成返回的音频无法解码')
    return decoded
  }

  stop(): void {
    const child = this.child
    this.child = null
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.failAll('本地语音引擎已停止')
    child?.kill()
  }

  private request(payload: Payload, signal: AbortSignal): Promise<WorkerResponse> {
    if (signal.aborted) return Promise.reject(new LocalEngineError('已取消'))
    const child = this.ensureChild()
    const id = ++this.seq
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null

    return new Promise<WorkerResponse>((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.pending.delete(id)
        this.scheduleIdle()
      }
      const onAbort = (): void => {
        done()
        reject(new LocalEngineError('已取消'))
      }
      const timer = setTimeout(() => {
        done()
        reject(new LocalEngineError('本地语音处理超时'))
      }, REQUEST_TIMEOUT_MS)
      signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve: (response) => {
          done()
          if (response.ok) resolve(response)
          else reject(new LocalEngineError(response.error))
        },
        reject: (error) => {
          done()
          reject(error)
        }
      })
      child.send({ ...payload, id } as WorkerRequest)
    })
  }

  private ensureChild(): ChildProcess {
    if (this.child) return this.child
    let node: string
    try {
      node = resolveNodeExecutable()
    } catch (error) {
      throw new LocalEngineError((error as Error).message)
    }
    const child = fork(this.workerPath, [], {
      execPath: node,
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: nodeEnv(),
      serialization: 'json',
      windowsHide: true
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) console.warn(`[local-voice] ${line.slice(0, 500)}`)
    })
    child.on('message', (response: WorkerResponse) =>
      this.pending.get(response?.id)?.resolve(response)
    )
    child.on('error', (error) => {
      this.failAll(`无法启动本地语音进程：${error.message}`)
    })
    child.on('exit', (code) => {
      if (this.child !== child) return
      this.child = null
      if (code !== 0) console.warn(`[local-voice] worker exited with code ${code}`)
      this.failAll('本地语音引擎意外退出，请重试')
    })
    this.child = child
    return child
  }

  private failAll(message: string): void {
    for (const pending of [...this.pending.values()]) pending.reject(new LocalEngineError(message))
    this.pending.clear()
  }

  private scheduleIdle(): void {
    if (this.pending.size > 0 || !this.child) return
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(), IDLE_SHUTDOWN_MS)
  }
}
