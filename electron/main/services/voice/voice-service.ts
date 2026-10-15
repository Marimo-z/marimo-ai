import { CHAT_INPUT_MAX } from '../../../../shared/chat'
import type { PetCommand, Result } from '../../../../shared/ipc'
import type { PetEmotion } from '../../../../shared/pet'
import type { AppSettings } from '../../../../shared/settings'
import {
  ASR_AUDIO_MAX_BYTES,
  TTS_TEXT_MAX,
  type SpeechOutcome,
  type VoiceKeyKind,
  type VoiceState,
  type VoiceStatus
} from '../../../../shared/voice'
import { speechPieces, splitSpeech } from '../../../../shared/speech-text'
import { decodeWav, encodeWav } from '../../../../shared/wav'
import { AIRequestError } from '../ai/errors'
import { LocalEngineError } from '../local-voice/errors'
import { isPcmWav, synthesizeSpeech, transcribeAudio, type SynthesizedAudio } from './cloud'

/** On-device recognition and synthesis (sherpa-onnx). */
export interface LocalSpeech {
  isReady(kind: 'asr' | 'tts'): boolean
  transcribe(samples: Float32Array, sampleRate: number, signal: AbortSignal): Promise<string>
  synthesize(
    text: string,
    sid: number,
    speed: number,
    signal: AbortSignal
  ): Promise<{ samples: Float32Array; sampleRate: number }>
}

export interface VoiceServiceDeps {
  getSettings(): AppSettings
  getKey(kind: VoiceKeyKind): string | null
  onPet(command: PetCommand): void
  onState(state: VoiceState): void
  local?: LocalSpeech
  fetchImpl?: typeof fetch
  /** Delay of the offline recognizer, shortened in tests. */
  mockDelayMs?: number
}

const TTS_TIMEOUT_MS = 30_000
const ASR_TIMEOUT_MS = 60_000
/** Resets the state if the pet window never reports the end of playback (e.g. it reloaded). */
const PLAYBACK_WATCHDOG_MS = 5 * 60_000
const MOCK_TRANSCRIPT = '你好呀，今天过得怎么样？'

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function toBytes(input: unknown): Uint8Array | null {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return null
}

/** Message of an expected failure that is safe to show; null for unexpected errors. */
function knownMessage(error: unknown): string | null {
  if (error instanceof AIRequestError || error instanceof LocalEngineError) return error.message
  return null
}

/** Speech synthesis and recognition. Keys and network requests stay in the main process. */
export class VoiceService {
  private status: VoiceStatus = 'idle'
  private lastError: string | null = null
  private seq = 0
  /** Id of the line being synthesized or played; 0 after a user stop. */
  private currentId = 0
  private synthController: AbortController | null = null
  private transcribeController: AbortController | null = null
  private watchdog: ReturnType<typeof setTimeout> | null = null
  /** Sentences already handed to the synthesizer for the open streamed line. */
  private queuedSentences = 0
  private synthChain: Promise<void> = Promise.resolve()
  private readyAudio: SynthesizedAudio[] = []
  private playbackArmed = false
  private playbackStarted = false
  private streamError: string | null = null

  constructor(private readonly deps: VoiceServiceDeps) {}

  state(): VoiceState {
    return { status: this.status, lastError: this.lastError }
  }

  /** Shows a reply on the pet, reading it aloud when asked to and the pet is not muted. */
  async present(text: string, emotion: PetEmotion | undefined, speak: boolean): Promise<void> {
    const settings = this.deps.getSettings()
    if (!speak || settings.pet.doNotDisturb || settings.voice.ttsProvider === 'mock') {
      this.deps.onPet({ type: 'say', text, emotion })
      return
    }
    await this.speak(text, emotion)
  }

  /** Interrupts any current line, then speaks `text`. Resolves once playback was handed over. */
  async speak(input: string, emotion?: PetEmotion): Promise<Result<null>> {
    const text = input.trim().slice(0, TTS_TEXT_MAX)
    if (!text) return fail('朗读内容不能为空')
    this.stop()
    const id = ++this.seq
    this.currentId = id
    const voice = this.deps.getSettings().voice

    if (voice.ttsProvider === 'mock') {
      this.deps.onPet({ type: 'say', text, emotion })
      return { ok: true, data: null }
    }

    if (voice.ttsProvider === 'system') {
      this.deps.onPet({
        type: 'say',
        text,
        emotion,
        voice: {
          engine: 'system',
          id,
          voiceName: voice.systemVoice,
          rate: voice.rate,
          pitch: voice.pitch,
          volume: voice.volume
        }
      })
      this.setStatus('speaking', null)
      return { ok: true, data: null }
    }

    this.deps.onPet({ type: 'say', text, emotion })
    return this.speakInSentences(id, text)
  }

  /**
   * Starts a line whose text is still arriving. Completed sentences are synthesized
   * immediately, and playback waits until `commitStream` knows the reply should be read.
   */
  beginStream(): void {
    this.stop()
    this.currentId = ++this.seq
    this.queuedSentences = 0
    this.synthChain = Promise.resolve()
    this.readyAudio = []
    this.playbackArmed = false
    this.playbackStarted = false
    this.streamError = null
    const controller = new AbortController()
    this.synthController = controller
  }

  /** `text` is the reply so far, not a delta. */
  noteStream(text: string): void {
    if (this.currentId === 0 || this.playbackArmed) return
    const voice = this.deps.getSettings().voice
    if (voice.ttsProvider !== 'local' && voice.ttsProvider !== 'openai-compatible') return
    const { done } = splitSpeech(text.slice(0, TTS_TEXT_MAX))
    for (const sentence of done.slice(this.queuedSentences)) this.queueSynth(sentence)
    this.queuedSentences = done.length
  }

  /**
   * The reply is final. When `speak` is false, audio synthesized ahead is dropped.
   * Resolves once every sentence has been handed to the pet (playback may still be going).
   */
  async commitStream(text: string, speak: boolean): Promise<Result<null>> {
    const id = this.currentId
    if (!speak || id === 0) {
      this.dropPendingAudio()
      return { ok: true, data: null }
    }
    const voice = this.deps.getSettings().voice
    if (voice.ttsProvider === 'system') {
      this.dropPendingAudio()
      const next = ++this.seq
      this.currentId = next
      this.deps.onPet({
        type: 'speak-more',
        text,
        voice: {
          engine: 'system',
          id: next,
          voiceName: voice.systemVoice,
          rate: voice.rate,
          pitch: voice.pitch,
          volume: voice.volume
        }
      })
      this.deps.onPet({ type: 'speech-end', id: next })
      this.setStatus('speaking', null)
      return { ok: true, data: null }
    }
    if (voice.ttsProvider === 'mock') {
      this.dropPendingAudio()
      return { ok: true, data: null }
    }
    return this.speakInSentences(id, text, this.queuedSentences)
  }

  /** Stops synthesis and playback. */
  stop(): void {
    this.currentId = 0
    this.playbackArmed = false
    this.playbackStarted = false
    this.streamError = null
    this.readyAudio = []
    this.queuedSentences = 0
    this.synthChain = Promise.resolve()
    this.synthController?.abort()
    this.synthController = null
    if (this.status === 'speaking') this.deps.onPet({ type: 'stop-speech' })
    if (this.status !== 'idle') this.setStatus('idle', this.lastError)
  }

  /** Playback report from the pet window. */
  report(id: unknown, outcome: unknown, message?: unknown): void {
    if (typeof id !== 'number' || id !== this.currentId || this.status !== 'speaking') return
    this.currentId = 0
    const detail = typeof message === 'string' && message ? message.slice(0, 200) : '未知错误'
    this.setStatus(
      'idle',
      (outcome as SpeechOutcome) === 'error' ? `语音播放失败：${detail}` : null
    )
  }

  get transcribing(): boolean {
    return this.transcribeController !== null
  }

  async transcribe(input: unknown): Promise<Result<string>> {
    const wav = toBytes(input)
    if (!wav || !isPcmWav(wav)) return fail('录音格式不正确')
    if (wav.byteLength > ASR_AUDIO_MAX_BYTES) return fail('录音太长，请控制在 60 秒以内')
    if (this.transcribing) return fail('上一段录音还在识别中')

    const voice = this.deps.getSettings().voice
    const controller = new AbortController()
    this.transcribeController = controller
    try {
      let raw: string
      if (voice.asrProvider === 'mock') raw = await this.mockTranscribe()
      else if (voice.asrProvider === 'local') {
        const local = this.requireLocal('asr')
        const decoded = decodeWav(wav)
        if (!decoded) return fail('录音格式不正确')
        raw = await local.transcribe(decoded.samples, decoded.sampleRate, controller.signal)
      } else {
        raw = await transcribeAudio({ baseUrl: voice.asrBaseUrl, model: voice.asrModel }, wav, {
          apiKey: this.deps.getKey('asr'),
          timeoutMs: ASR_TIMEOUT_MS,
          signal: controller.signal,
          fetchImpl: this.deps.fetchImpl
        })
      }
      const text = raw.trim().slice(0, CHAT_INPUT_MAX)
      return text ? { ok: true, data: text } : fail('没有识别到说话内容，请再试一次')
    } catch (error) {
      const message = knownMessage(error)
      if (message) return fail(`语音识别失败：${message}`)
      console.error('[voice] transcription failed', error)
      return fail('语音识别失败')
    } finally {
      this.transcribeController = null
    }
  }

  dispose(): void {
    this.stop()
    this.transcribeController?.abort()
    if (this.watchdog) clearTimeout(this.watchdog)
  }

  private async speakInSentences(
    id: number,
    text: string,
    alreadyQueued = 0
  ): Promise<Result<null>> {
    if (!this.synthController) this.synthController = new AbortController()
    this.playbackArmed = true
    const pieces = speechPieces(text.slice(0, TTS_TEXT_MAX))
    for (const sentence of pieces.slice(alreadyQueued)) this.queueSynth(sentence)
    this.queuedSentences = pieces.length
    this.flushReady(id)
    await this.synthChain
    if (this.currentId !== id) return fail('已停止')
    if (!this.playbackStarted) {
      const message = this.streamError ?? '语音合成失败'
      this.streamError = null
      this.synthController = null
      this.currentId = 0
      this.setStatus('idle', `语音合成失败：${message}`)
      return fail(message)
    }
    this.synthController = null
    if (this.streamError) this.setStatus('speaking', `语音合成失败：${this.streamError}`)
    this.streamError = null
    this.deps.onPet({ type: 'speech-end', id })
    return { ok: true, data: null }
  }

  private queueSynth(sentence: string): void {
    const id = this.currentId
    const controller = this.synthController
    if (!controller || id === 0) return
    if (this.status !== 'speaking') this.setStatus('synthesizing', null)
    this.synthChain = this.synthChain.then(async () => {
      if (this.currentId !== id || this.streamError || controller.signal.aborted) return
      const voice = this.deps.getSettings().voice
      const audio = await this.synthesizeAudio(voice, sentence, controller.signal)
      if (this.currentId !== id) return
      this.readyAudio.push(audio)
      this.flushReady(id)
    }).catch((error: unknown) => {
      if (this.currentId !== id || controller.signal.aborted) return
      const message = knownMessage(error) ?? '语音合成失败'
      if (!knownMessage(error)) console.error('[voice] synthesis failed', error)
      this.streamError = message
    })
  }

  private flushReady(id: number): void {
    if (!this.playbackArmed || this.currentId !== id) return
    const volume = this.deps.getSettings().voice.volume
    while (this.readyAudio.length > 0) {
      const audio = this.readyAudio.shift()
      if (!audio) break
      this.deps.onPet({
        type: 'speak-more',
        text: '',
        voice: { engine: 'audio', id, ...audio, volume }
      })
      this.playbackStarted = true
      this.setStatus('speaking', null)
    }
  }

  /** Forgets audio prepared for a reply that should not be read aloud. */
  private dropPendingAudio(): void {
    this.playbackArmed = false
    this.readyAudio = []
    this.queuedSentences = 0
    this.synthChain = Promise.resolve()
    this.synthController?.abort()
    this.synthController = null
    if (this.status === 'speaking') return
    this.currentId = 0
    if (this.status !== 'idle') this.setStatus('idle', null)
  }

  private async synthesizeAudio(
    voice: AppSettings['voice'],
    text: string,
    signal: AbortSignal
  ): Promise<SynthesizedAudio> {
    if (voice.ttsProvider === 'local') {
      const audio = await this.requireLocal('tts').synthesize(
        text,
        voice.localVoice,
        voice.rate,
        signal
      )
      return { data: encodeWav(audio.samples, audio.sampleRate), mime: 'audio/wav' }
    }
    return synthesizeSpeech(
      {
        baseUrl: voice.ttsBaseUrl,
        model: voice.ttsModel,
        voice: voice.ttsVoice,
        speed: voice.rate
      },
      text,
      {
        apiKey: this.deps.getKey('tts'),
        timeoutMs: TTS_TIMEOUT_MS,
        signal,
        fetchImpl: this.deps.fetchImpl
      }
    )
  }

  private requireLocal(kind: 'asr' | 'tts'): LocalSpeech {
    const local = this.deps.local
    if (!local || !local.isReady(kind)) {
      const name = kind === 'asr' ? '本地识别模型' : '本地语音模型'
      throw new AIRequestError('invalid-input', `${name}尚未下载，请在“语音设置”中下载或导入`)
    }
    return local
  }

  private mockTranscribe(): Promise<string> {
    return new Promise((resolve) =>
      setTimeout(() => resolve(MOCK_TRANSCRIPT), this.deps.mockDelayMs ?? 500)
    )
  }

  private setStatus(status: VoiceStatus, lastError: string | null): void {
    this.status = status
    this.lastError = lastError
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
    if (status === 'speaking') {
      this.watchdog = setTimeout(() => {
        this.currentId = 0
        this.setStatus('idle', this.lastError)
      }, PLAYBACK_WATCHDOG_MS)
    }
    this.deps.onState(this.state())
  }
}
