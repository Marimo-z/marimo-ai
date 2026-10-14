import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatHistoryStore } from '../electron/main/services/chat-history'
import { shouldSpeakProactively } from '../electron/main/services/proactive'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings'

describe('shouldSpeakProactively', () => {
  const base = (patch: (s: AppSettings) => void = () => {}) => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.persona.proactive = true
    settings.persona.proactiveIntervalMin = 10
    patch(settings)
    return { now: 10 * 60_000, lastActivity: 0, settings, petVisible: true, busy: false }
  }

  it('speaks after the interval when everything allows it', () => {
    expect(shouldSpeakProactively(base())).toBe(true)
    expect(shouldSpeakProactively({ ...base(), lastActivity: 1 })).toBe(false)
  })

  it('stays quiet when disabled, hidden, busy or in a quiet mode', () => {
    expect(shouldSpeakProactively(base((s) => (s.persona.proactive = false)))).toBe(false)
    expect(shouldSpeakProactively(base((s) => (s.ai.activeProfileId = null)))).toBe(false)
    expect(shouldSpeakProactively(base((s) => (s.pet.doNotDisturb = true)))).toBe(false)
    expect(shouldSpeakProactively(base((s) => (s.pet.clickThrough = true)))).toBe(false)
    expect(shouldSpeakProactively({ ...base(), petVisible: false })).toBe(false)
    expect(shouldSpeakProactively({ ...base(), busy: true })).toBe(false)
  })
})

describe('ChatHistoryStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marimo-chat-'))
  const file = join(dir, 'chat-history.json')
  afterEach(() => rmSync(file, { force: true }))

  it('round-trips messages and skips invalid entries', () => {
    const store = new ChatHistoryStore(file)
    store.save([
      { id: '1', role: 'user', text: '你好', at: 1 },
      { id: '2', role: 'assistant', text: '嗨', emotion: 'happy', at: 2 }
    ])
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    raw.messages.push(
      { id: '3', role: 'system', text: 'x', at: 3 },
      { id: '4', role: 'user', text: '', at: 4 },
      'bad'
    )
    writeFileSync(file, JSON.stringify(raw))

    expect(store.load().map((m) => m.id)).toEqual(['1', '2'])
  })

  it('returns an empty list for missing or corrupt files and deletes on clear', () => {
    const store = new ChatHistoryStore(file)
    expect(store.load()).toEqual([])
    writeFileSync(file, '{not json')
    expect(store.load()).toEqual([])
    store.clear()
    expect(existsSync(file)).toBe(false)
  })
})
