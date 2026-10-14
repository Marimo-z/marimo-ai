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

  get playing(): boolean {
    return this.finish !== null
  }

  async play(voice: PetVoice, text: string, onEnd: SpeechEndListener): Promise<void> {
    this.stop()
    let settled = false
    this.finish = (outcome, message) => {
      if (settled) return
      settled = true
      this.finish = null
      this.cleanup?.()
      this.cleanup = null
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

  stop(): void {
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
    audio.onended = () => finish('ended')
    audio.onerror = () => finish('error', '音频无法播放')
    this.cleanup = () => {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      URL.revokeObjectURL(url)
    }
    await audio.play()
  }
}
