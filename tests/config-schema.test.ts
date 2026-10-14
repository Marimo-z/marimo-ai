import { describe, expect, it } from 'vitest'
import { parseConfig } from '../electron/main/services/config-schema'
import { DEFAULT_PET_SETTINGS } from '../shared/pet'
import { createAIProfile, DEFAULT_SETTINGS, LEGACY_AI_PROFILE_ID } from '../shared/settings'

describe('parseConfig', () => {
  it('returns defaults for empty or invalid input', () => {
    for (const raw of [undefined, null, 'oops', 42, {}]) {
      expect(parseConfig(raw)).toEqual({ ...DEFAULT_SETTINGS, petWindowPosition: null })
    }
  })

  it('keeps valid fields and repairs invalid ones individually', () => {
    const config = parseConfig({
      pet: { followCursor: false, scale: 99, bubbleDurationMs: 'long', clickThrough: true },
      petWindowPosition: { x: 10, y: 20 }
    })
    expect(config.pet).toEqual({
      ...DEFAULT_PET_SETTINGS,
      followCursor: false,
      clickThrough: true
    })
    expect(config.petWindowPosition).toEqual({ x: 10, y: 20 })
  })

  it('upgrades a stage-1 config that only has pet settings', () => {
    const config = parseConfig({ pet: { alwaysOnTop: false }, petWindowPosition: { x: 1, y: 2 } })
    expect(config.pet.alwaysOnTop).toBe(false)
    expect(config.pet.doubleClickAction).toBe('panel')
    expect(config.persona).toEqual(DEFAULT_SETTINGS.persona)
    expect(config.appearance.theme).toBe('system')
  })

  it('repairs invalid enum and array values per section', () => {
    const config = parseConfig({
      persona: { traits: 'not-an-array', name: '小蓝' },
      appearance: { theme: 'purple' }
    })
    expect(config.persona.traits).toEqual(DEFAULT_SETTINGS.persona.traits)
    expect(config.persona.name).toBe('小蓝')
    expect(config.appearance.theme).toBe('system')
  })

  it('migrates the single-profile AI format into a profile list', () => {
    const config = parseConfig({
      ai: { providerId: 'qwen', baseUrl: 'https://example.com/v1', model: 'qwen-max', maxTokens: 1 }
    })
    expect(config.ai.activeProfileId).toBe(LEGACY_AI_PROFILE_ID)
    expect(config.ai.profiles).toEqual([
      {
        ...createAIProfile(LEGACY_AI_PROFILE_ID, 'qwen'),
        baseUrl: 'https://example.com/v1',
        model: 'qwen-max'
      }
    ])
  })

  it('repairs AI profiles one by one', () => {
    const good = createAIProfile('a', 'deepseek', '工作')
    const config = parseConfig({
      ai: {
        activeProfileId: 'b',
        profiles: [
          good,
          { ...good, name: '重复 ID' },
          { id: 'NOT VALID', name: 'x' },
          'garbage',
          { id: 'b', name: '', providerId: 'evil', temperature: 9, model: 'm' }
        ]
      }
    })
    expect(config.ai.profiles.map((p) => p.id)).toEqual(['a', 'b'])
    expect(config.ai.profiles[1]).toEqual({ ...createAIProfile('b', 'custom'), model: 'm' })
    expect(config.ai.activeProfileId).toBe('b')
  })

  it('keeps an empty profile list and clears a dangling active id', () => {
    expect(parseConfig({ ai: { activeProfileId: 'x', profiles: [] } }).ai).toEqual({
      activeProfileId: null,
      profiles: []
    })
  })

  it('drops a malformed window position', () => {
    expect(parseConfig({ petWindowPosition: { x: 'a', y: 1 } }).petWindowPosition).toBeNull()
  })

  it('strips unknown keys so secrets cannot be smuggled into the plain config', () => {
    const config = parseConfig({
      apiKey: 'sk-test',
      ai: {
        ...DEFAULT_SETTINGS.ai,
        apiKey: 'sk-test',
        profiles: [{ ...DEFAULT_SETTINGS.ai.profiles[0], apiKey: 'sk-test' }]
      },
      pet: { ...DEFAULT_PET_SETTINGS, apiKey: 'x' }
    })
    expect(JSON.stringify(config)).not.toContain('sk-test')
    expect(JSON.stringify(config)).not.toContain('apiKey')
  })

  it('moves voice settings from the mock-only format to the real providers', () => {
    const legacy = parseConfig({
      voice: {
        asrProvider: 'mock',
        ttsProvider: 'mock',
        voiceId: 'mock-default',
        rate: 1.4,
        volume: 0.5,
        pitch: 1,
        autoSpeak: true,
        recordMode: 'hold'
      }
    })
    expect(legacy.voice).toEqual({
      ...DEFAULT_SETTINGS.voice,
      rate: 1.4,
      volume: 0.5,
      autoSpeak: true
    })

    const current = parseConfig({ voice: { ...DEFAULT_SETTINGS.voice, ttsProvider: 'mock' } })
    expect(current.voice.ttsProvider).toBe('mock')
  })
})
