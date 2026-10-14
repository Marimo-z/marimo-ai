import { utilityProcess, type UtilityProcess } from 'electron'
import { LocalEngineError } from './errors'
import type { WorkerRequest, WorkerResponse } from './protocol'

type Payload = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never

interface Pending {
  resolve(response: WorkerResponse): void
  reject(error: Error): void
}

/** The first request also loads the model, which can take a while on slow disks. */
const REQUEST_TIMEOUT_MS = 120_000
/** Frees the models' memory (a few hundred MB) when voice has not been used for a while. */
const IDLE_SHUTDOWN_MS = 5 * 60_000

/** Client for the local voice worker. Starts it on demand and restarts it after a crash. */
export class LocalVoiceEngine {
  private child: UtilityProcess | null = null
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
      { type: 'transcribe', modelDir, samples, sampleRate },
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
    if (!('samples' in response)) throw new LocalEngineError('本地合成返回了意外的结果')
    return { samples: response.samples, sampleRate: response.sampleRate }
  }

  /** Stops the worker, e.g. before its model files are deleted. */
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
      // Native inference cannot be interrupted; a cancelled result is simply dropped.
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
      child.postMessage({ ...payload, id } as WorkerRequest)
    })
  }

  private ensureChild(): UtilityProcess {
    if (this.child) return this.child
    const child = utilityProcess.fork(this.workerPath, [], {
      serviceName: 'Marimo Local Voice',
      stdio: 'pipe'
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) console.warn(`[local-voice] ${line.slice(0, 500)}`)
    })
    child.on('message', (response: WorkerResponse) =>
      this.pending.get(response?.id)?.resolve(response)
    )
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
