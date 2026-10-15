import { describe, expect, it } from 'vitest'
import { parseConfig } from '../electron/main/services/config-schema'
import { PET_CHAT_DOCK_HEIGHT, petWindowSize } from '../shared/pet'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { gateVoiceInput, nextUtteranceClock } from '../shared/voice-input'

describe('gateVoiceInput', () => {
  it('lets the microphone start when nothing is being read', () => {
    expect(gateVoiceInput(false, false)).toBe('start')
    expect(gateVoiceInput(true, false)).toBe('start')
  })

  it('blocks the microphone while speaking unless interrupt is enabled', () => {
    expect(gateVoiceInput(false, true)).toBe('blocked')
    expect(gateVoiceInput(true, true)).toBe('barge-in')
  })
})

describe('interruptSpeech setting', () => {
  it('defaults to off and round-trips through the config schema', () => {
    expect(DEFAULT_SETTINGS.voice.interruptSpeech).toBe(false)
    expect(parseConfig({}).voice.interruptSpeech).toBe(false)
    expect(parseConfig({ voice: { interruptSpeech: true } }).voice.interruptSpeech).toBe(true)
    expect(parseConfig({ voice: { interruptSpeech: 'yes' } }).voice.interruptSpeech).toBe(false)
  })
})

describe('continuous voice endpoint', () => {
  it('sends only after speech and a 2.5s pause', () => {
    let clock = { speechMs: 0, silenceMs: 0 }
    clock = nextUtteranceClock(clock, 0.01, 3000)
    expect(clock.send).toBe(false)
    clock = nextUtteranceClock(clock, 0.4, 200)
    expect(clock.send).toBe(false)
    clock = nextUtteranceClock(clock, 0.01, 2400)
    expect(clock.send).toBe(false)
    clock = nextUtteranceClock(clock, 0.01, 100)
    expect(clock.send).toBe(true)
  })

  it('restarts the pause when the person keeps talking', () => {
    let clock = nextUtteranceClock({ speechMs: 0, silenceMs: 0 }, 0.5, 400)
    clock = nextUtteranceClock(clock, 0, 2000)
    clock = nextUtteranceClock(clock, 0.5, 100)
    expect(clock.silenceMs).toBe(0)
    expect(clock.send).toBe(false)
  })
})

describe('petWindowSize', () => {
  it('grows downward by the chat dock and leaves the base size unchanged', () => {
    expect(petWindowSize(1)).toEqual(petWindowSize(1, false))
    expect(petWindowSize(1, true).height).toBe(petWindowSize(1).height + PET_CHAT_DOCK_HEIGHT)
    expect(petWindowSize(1, true).width).toBe(petWindowSize(1).width)
  })
})
