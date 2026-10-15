/** What a microphone press should do while the pet may be reading aloud. */
export type VoiceInputGate = 'start' | 'barge-in' | 'blocked'

/**
 * `interruptSpeech` defaults to false: a mic press must not cut off the current line.
 * Turning it on allows voice input to stop playback and start recording.
 */
export function gateVoiceInput(interruptSpeech: boolean, speaking: boolean): VoiceInputGate {
  if (!speaking) return 'start'
  return interruptSpeech ? 'barge-in' : 'blocked'
}

/** Quiet stretch that ends one turn of the pet's continuous microphone. */
export const CONTINUOUS_PAUSE_MS = 2500
/** Scaled microphone level (see the recorder) that counts as speech. */
export const CONTINUOUS_SPEECH_LEVEL = 0.16
/** Ignore clicks and breaths shorter than this before a pause can send. */
export const CONTINUOUS_MIN_SPEECH_MS = 200

export interface UtteranceClock {
  speechMs: number
  silenceMs: number
}

/**
 * Advances the continuous-mic clock by one level sample.
 * A turn is ready to send only after real speech followed by `CONTINUOUS_PAUSE_MS` of quiet.
 */
export function nextUtteranceClock(
  clock: UtteranceClock,
  level: number,
  stepMs: number
): UtteranceClock & { send: boolean } {
  if (level >= CONTINUOUS_SPEECH_LEVEL) {
    return { speechMs: clock.speechMs + stepMs, silenceMs: 0, send: false }
  }
  const silenceMs = clock.speechMs >= CONTINUOUS_MIN_SPEECH_MS ? clock.silenceMs + stepMs : 0
  return {
    speechMs: clock.speechMs,
    silenceMs,
    send: clock.speechMs >= CONTINUOUS_MIN_SPEECH_MS && silenceMs >= CONTINUOUS_PAUSE_MS
  }
}
