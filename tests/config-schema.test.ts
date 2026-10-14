import { describe, expect, it } from 'vitest'
import { parseConfig } from '../electron/main/services/config-schema'
import { DEFAULT_PET_SETTINGS } from '../shared/pet'

describe('parseConfig', () => {
  it('returns defaults for empty or invalid input', () => {
    for (const raw of [undefined, null, 'oops', 42, {}]) {
      expect(parseConfig(raw)).toEqual({ pet: DEFAULT_PET_SETTINGS, petWindowPosition: null })
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

  it('drops a malformed window position', () => {
    expect(parseConfig({ petWindowPosition: { x: 'a', y: 1 } }).petWindowPosition).toBeNull()
  })

  it('strips unknown keys so secrets cannot be smuggled into the plain config', () => {
    const config = parseConfig({ apiKey: 'sk-test', pet: { ...DEFAULT_PET_SETTINGS, apiKey: 'x' } })
    expect(JSON.stringify(config)).not.toContain('sk-test')
    expect(JSON.stringify(config)).not.toContain('apiKey')
  })
})
