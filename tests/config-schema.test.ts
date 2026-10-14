import { describe, expect, it } from 'vitest'
import { parseConfig } from '../electron/main/services/config-schema'
import { DEFAULT_PET_SETTINGS } from '../shared/pet'
import { DEFAULT_SETTINGS } from '../shared/settings'

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
      ai: { providerId: 'evil', model: 'x' },
      persona: { traits: 'not-an-array', name: '小蓝' },
      appearance: { theme: 'purple' }
    })
    expect(config.ai.providerId).toBe(DEFAULT_SETTINGS.ai.providerId)
    expect(config.ai.model).toBe('x')
    expect(config.persona.traits).toEqual(DEFAULT_SETTINGS.persona.traits)
    expect(config.persona.name).toBe('小蓝')
    expect(config.appearance.theme).toBe('system')
  })

  it('drops a malformed window position', () => {
    expect(parseConfig({ petWindowPosition: { x: 'a', y: 1 } }).petWindowPosition).toBeNull()
  })

  it('strips unknown keys so secrets cannot be smuggled into the plain config', () => {
    const config = parseConfig({
      apiKey: 'sk-test',
      ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'sk-test' },
      pet: { ...DEFAULT_PET_SETTINGS, apiKey: 'x' }
    })
    expect(JSON.stringify(config)).not.toContain('sk-test')
    expect(JSON.stringify(config)).not.toContain('apiKey')
  })
})
