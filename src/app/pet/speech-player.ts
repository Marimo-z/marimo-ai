import type { PetVoice, SpeechOutcome } from '../../../shared/voice'
import { pickSystemVoice } from '../../utils/voice-select'

export type SpeechEndListener = (outcome: SpeechOutcome, message?: string) => void

const VOICES_WAIT_MS = 1500

/** Chromium fills the voice list asynchronously on first use. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = speechSynthesis.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)
  return new Promise((resolve) => {
    const done = (): void => {
      speechSynthesis.removeEventListener('voiceschanged', done)
      clearTimeout(timer)
      resolve(speechSynthesis.getVoices())
    }
    const timer = setTimeout(done, VOICES_WAIT_MS)
    speechSynthesis.addEventListener('voiceschanged', done)
  })
}

/** Plays one line at a time; starting a new one or calling `stop` ends the previous with 'ended'. */
export class SpeechPlayer {
  private finish: ((outcome: SpeechOutcome, message?: string) => void) | null = null
  private cleanup: (() => void) | null = null
  private activeId: number | null = null
  private pendingAudio: Extract<PetVoice, { engine: 'audio' }>[] = []
  private noMore = false
  private waiting = false

  get playing(): boolean {
    return this.finish !== null
  }

  async play(voice: PetVoice, text: string, onEnd: SpeechEndListener): Promise<void> {
    this.stop()
    let settled = false
    this.activeId = voice.id
    this.noMore = false
    this.waiting = false
    this.pendingAudio = []
    this.finish = (outcome, message) => {
      if (settled) return
      settled = true
      this.finish = null
      this.cleanup?.()
      this.cleanup = null
      this.pendingAudio = []
      this.waiting = false
      this.activeId = null
      onEnd(outcome, message)
    }
    const finish = this.finish
    try {
      if (voice.engine === 'system') await this.playSystem(voice, text, finish)
      else await this.playAudio(voice, finish)
    } catch (error) {
      finish('error', error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Adds another clip of the current line. A different id replaces the line.
   * The end listener from the first clip is kept.
   */
  enqueue(voice: PetVoice, text: string, onEnd: SpeechEndListener): void {
    if (this.finish && this.activeId === voice.id && voice.engine === 'audio') {
      if (this.waiting) {
        this.waiting = false
        void this.playAudio(voice, this.finish)
      } else this.pendingAudio.push(voice)
      return
    }
    void this.play(voice, text, onEnd)
  }

  /** The line has no further clips. Ends playback once the queue is empty. */
  complete(id: number): void {
    if (id !== this.activeId || !this.finish) return
    this.noMore = true
    if (this.waiting && this.pendingAudio.length === 0) this.finish('ended')
  }

  stop(): void {
    this.pendingAudio = []
    this.noMore = false
    this.waiting = false
    this.finish?.('ended')
  }

  private async playSystem(
    voice: Extract<PetVoice, { engine: 'system' }>,
    text: string,
    finish: SpeechEndListener
  ): Promise<void> {
    if (typeof speechSynthesis === 'undefined') throw new Error('系统不支持语音合成')
    const selected = pickSystemVoice(await loadVoices(), voice.voiceName)
    if (this.finish !== finish) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = selected?.lang ?? 'zh-CN'
    if (selected) utterance.voice = selected
    utterance.rate = voice.rate
    utterance.pitch = voice.pitch
    utterance.volume = voice.volume
    utterance.onend = () => finish('ended')
    utterance.onerror = (event) => {
      // Interruptions come from our own stop() or a newer line.
      if (event.error === 'interrupted' || event.error === 'canceled') finish('ended')
      else finish('error', `系统语音出错（${event.error}）`)
    }
    this.cleanup = () => {
      utterance.onend = null
      utterance.onerror = null
      speechSynthesis.cancel()
    }
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }

  private async playAudio(
    voice: Extract<PetVoice, { engine: 'audio' }>,
    finish: SpeechEndListener
  ): Promise<void> {
    const url = URL.createObjectURL(new Blob([new Uint8Array(voice.data)], { type: voice.mime }))
    const audio = new Audio(url)
    audio.volume = voice.volume
    audio.onended = () => this.advance(finish)
    audio.onerror = () => finish('error', '音频无法播放')
    this.cleanup = () => {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      URL.revokeObjectURL(url)
    }
    await audio.play()
  }

  private advance(finish: SpeechEndListener): void {
    if (this.finish !== finish) return
    this.cleanup?.()
    this.cleanup = null
    const next = this.pendingAudio.shift()
    if (next) {
      void this.playAudio(next, finish)
      return
    }
    if (this.noMore) finish('ended')
    else this.waiting = true
  }
}
