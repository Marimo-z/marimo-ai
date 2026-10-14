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
import { AIRequestError } from '../ai/errors'
import { isPcmWav, synthesizeSpeech, transcribeAudio } from './cloud'

export interface VoiceServiceDeps {
  getSettings(): AppSettings
  getKey(kind: VoiceKeyKind): string | null
  onPet(command: PetCommand): void
  onState(state: VoiceState): void
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

    const controller = new AbortController()
    this.synthController = controller
    this.setStatus('synthesizing', null)
    try {
      const audio = await synthesizeSpeech(
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
          signal: controller.signal,
          fetchImpl: this.deps.fetchImpl
        }
      )
      if (this.currentId !== id) return fail('已停止')
      this.synthController = null
      this.deps.onPet({
        type: 'say',
        text,
        emotion,
        voice: { engine: 'audio', id, ...audio, volume: voice.volume }
      })
      this.setStatus('speaking', null)
      return { ok: true, data: null }
    } catch (error) {
      // A newer line took over: it owns the pet and the state now.
      if (this.currentId !== id && this.currentId !== 0) return fail('已停止')
      if (this.synthController === controller) this.synthController = null
      const message = error instanceof AIRequestError ? error.message : '语音合成失败'
      if (!(error instanceof AIRequestError)) console.error('[voice] synthesis failed', error)
      const stopped = this.currentId === 0
      this.currentId = 0
      // The reply still has to reach the pet, just without sound.
      this.deps.onPet({ type: 'say', text, emotion })
      if (stopped) return fail('已停止')
      this.setStatus('idle', `语音合成失败：${message}`)
      return fail(message)
    }
  }

  /** Stops synthesis and playback. */
  stop(): void {
    this.currentId = 0
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
      const raw =
        voice.asrProvider === 'mock'
          ? await this.mockTranscribe()
          : await transcribeAudio({ baseUrl: voice.asrBaseUrl, model: voice.asrModel }, wav, {
              apiKey: this.deps.getKey('asr'),
              timeoutMs: ASR_TIMEOUT_MS,
              signal: controller.signal,
              fetchImpl: this.deps.fetchImpl
            })
      const text = raw.trim().slice(0, CHAT_INPUT_MAX)
      return text ? { ok: true, data: text } : fail('没有识别到说话内容，请再试一次')
    } catch (error) {
      if (error instanceof AIRequestError) return fail(`语音识别失败：${error.message}`)
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
