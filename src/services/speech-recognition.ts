import type { Result } from '../../shared/ipc'
import { ASR_SAMPLE_RATE, RECORDING_MAX_MS, RECORDING_MIN_MS } from '../../shared/voice'
import { encodeWav, peakLevel } from '../../shared/wav'

export type RecognitionErrorKind =
  'permission' | 'no-device' | 'device-busy' | 'unsupported' | 'too-short' | 'silent' | 'service'

export class RecognitionError extends Error {
  constructor(
    readonly kind: RecognitionErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'RecognitionError'
  }
}

/** Below this peak the recording is treated as silence. */
const SILENCE_PEAK = 0.02

function microphoneError(error: unknown): RecognitionError {
  const name = (error as DOMException | undefined)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new RecognitionError(
      'permission',
      '无法使用麦克风：权限被拒绝。请在 Windows 设置 → 隐私和安全性 → 麦克风 中允许桌面应用访问麦克风。'
    )
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new RecognitionError('no-device', '没有找到麦克风，请连接麦克风后再试。')
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return new RecognitionError('device-busy', '麦克风无法使用，可能正被其他程序占用。')
  }
  return new RecognitionError('unsupported', '无法打开麦克风。')
}

export interface RecordingResult {
  wav: Uint8Array
  durationMs: number
  peak: number
}

export interface RecorderOptions {
  /** Input level in [0, 1], about ten times a second. */
  onLevel?(level: number): void
  /** Called when the maximum length is reached; the caller should then call `stop()`. */
  onLimit?(): void
  maxMs?: number
}

/** Records from the default microphone and converts the result to 16 kHz mono WAV. */
export class MicrophoneRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private context: AudioContext | null = null
  private levelTimer: ReturnType<typeof setInterval> | null = null
  private limitTimer: ReturnType<typeof setTimeout> | null = null
  private startedAt = 0

  get active(): boolean {
    return this.recorder !== null
  }

  async start(options: RecorderOptions = {}): Promise<void> {
    if (this.active) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new RecognitionError('unsupported', '当前环境不支持录音。')
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
    } catch (error) {
      throw microphoneError(error)
    }

    this.chunks = []
    const recorder = new MediaRecorder(this.stream)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    recorder.start()
    this.recorder = recorder
    this.startedAt = performance.now()
    this.watchLevel(this.stream, options.onLevel)
    this.limitTimer = setTimeout(() => options.onLimit?.(), options.maxMs ?? RECORDING_MAX_MS)
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder
    if (!recorder) throw new RecognitionError('too-short', '没有正在进行的录音。')
    const durationMs = performance.now() - this.startedAt
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
    recorder.stop()
    await stopped
    const blob = new Blob(this.chunks, { type: recorder.mimeType })
    this.release()

    if (durationMs < RECORDING_MIN_MS) throw new RecognitionError('too-short', '录音太短了。')
    const samples = await decodeToMono(blob)
    const peak = peakLevel(samples)
    if (peak < SILENCE_PEAK) {
      throw new RecognitionError('silent', '没有检测到声音，请检查麦克风是否静音或音量过低。')
    }
    return { wav: encodeWav(samples, ASR_SAMPLE_RATE), durationMs, peak }
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    this.release()
  }

  private watchLevel(stream: MediaStream, onLevel?: (level: number) => void): void {
    if (!onLevel) return
    this.context = new AudioContext()
    const analyser = this.context.createAnalyser()
    analyser.fftSize = 1024
    this.context.createMediaStreamSource(stream).connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)
    this.levelTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer)
      let sum = 0
      for (const s of buffer) sum += s * s
      // RMS of speech sits around 0.02–0.2; scale it so normal speech fills most of the meter.
      onLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 5))
    }, 100)
  }

  private release(): void {
    if (this.levelTimer) clearInterval(this.levelTimer)
    if (this.limitTimer) clearTimeout(this.limitTimer)
    this.levelTimer = null
    this.limitTimer = null
    void this.context?.close()
    this.context = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.recorder = null
    this.chunks = []
  }
}

async function decodeToMono(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer())
  } catch {
    throw new RecognitionError('service', '录音无法解码。')
  } finally {
    void context.close()
  }
  const length = Math.max(1, Math.ceil(decoded.duration * ASR_SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, length, ASR_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return (await offline.startRendering()).getChannelData(0)
}

/** Spec interface: recognition providers are swappable and the UI never sees a vendor SDK. */
export interface SpeechRecognitionProvider {
  start(): Promise<void>
  stop(): Promise<void>
  cancel(): void
  /** Not emitted by batch services such as the OpenAI-compatible transcription endpoint. */
  onPartialResult?: (text: string) => void
  onFinalResult?: (text: string) => void
  onError?: (error: RecognitionError) => void
}

/** Records locally, then sends the WAV to the main process, which calls the configured service. */
export class RecordingRecognizer implements SpeechRecognitionProvider {
  onFinalResult?: (text: string) => void
  onError?: (error: RecognitionError) => void
  private readonly recorder = new MicrophoneRecorder()

  constructor(
    private readonly transcribe: (wav: Uint8Array) => Promise<Result<string>>,
    private readonly options: RecorderOptions = {}
  ) {}

  get recording(): boolean {
    return this.recorder.active
  }

  async start(): Promise<void> {
    try {
      await this.recorder.start(this.options)
    } catch (error) {
      this.onError?.(asRecognitionError(error))
    }
  }

  async stop(): Promise<void> {
    try {
      const { wav } = await this.recorder.stop()
      const result = await this.transcribe(wav)
      if (result.ok) this.onFinalResult?.(result.data)
      else this.onError?.(new RecognitionError('service', result.error))
    } catch (error) {
      this.onError?.(asRecognitionError(error))
    }
  }

  cancel(): void {
    this.recorder.cancel()
  }
}

function asRecognitionError(error: unknown): RecognitionError {
  if (error instanceof RecognitionError) return error
  console.error('[voice] recording failed', error)
  return new RecognitionError('service', '录音失败。')
}
