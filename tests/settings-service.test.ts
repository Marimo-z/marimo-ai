import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigStore } from '../electron/main/services/config-store'
import {
  SettingsService,
  SettingsValidationError
} from '../electron/main/services/settings-service'
import { DEFAULT_SETTINGS } from '../shared/settings'

describe('SettingsService', () => {
  let dir: string
  let file: string
  let store: ConfigStore
  let service: SettingsService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marimo-test-'))
    file = join(dir, 'config.json')
    store = new ConfigStore(file)
    service = new SettingsService(store)
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('starts from defaults without exposing the window position', () => {
    expect(service.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('applies a valid patch and notifies listeners with previous and next values', () => {
    const listener = vi.fn()
    service.onChange(listener)
    const next = service.update('pet', { scale: 1.2 })
    expect(next.pet.scale).toBe(1.2)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0].pet.scale).toBe(1.2)
    expect(listener.mock.calls[0][1].pet.scale).toBe(1)
  })

  it('rejects an invalid patch without changing anything', () => {
    const listener = vi.fn()
    service.onChange(listener)
    expect(() => service.update('pet', { scale: 5 })).toThrow(SettingsValidationError)
    expect(() => service.update('persona', { name: '   ' })).toThrow(SettingsValidationError)
    expect(service.get()).toEqual(DEFAULT_SETTINGS)
    expect(listener).not.toHaveBeenCalled()
  })

  it('drops unknown fields from patches', () => {
    service.update('ai', { model: 'qwen-plus', apiKey: 'sk-secret' } as never)
    store.flush()
    const saved = readFileSync(file, 'utf-8')
    expect(saved).toContain('qwen-plus')
    expect(saved).not.toContain('sk-secret')
  })

  it('resets one section or everything while keeping the window position', () => {
    store.update((c) => ({ ...c, petWindowPosition: { x: 5, y: 6 } }))
    service.update('pet', { scale: 1.4 })
    service.update('appearance', { theme: 'dark' })

    service.reset('pet')
    expect(service.get().pet.scale).toBe(1)
    expect(service.get().appearance.theme).toBe('dark')

    service.reset()
    expect(service.get()).toEqual(DEFAULT_SETTINGS)
    expect(store.get().petWindowPosition).toEqual({ x: 5, y: 6 })
  })

  it('persists to disk and reloads', () => {
    service.update('persona', { name: '小蓝' })
    store.flush()
    const reloaded = new SettingsService(new ConfigStore(file))
    expect(reloaded.get().persona.name).toBe('小蓝')
  })
})
