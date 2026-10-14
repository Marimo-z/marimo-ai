import { describe, expect, it, vi } from 'vitest'
import { AIRequestError } from '../electron/main/services/ai/errors'
import type { AIProvider, ProviderMessage } from '../electron/main/services/ai/provider'
import type { ChatHistoryPersistence } from '../electron/main/services/chat-history'
import { ChatService } from '../electron/main/services/chat-service'
import type { ChatMessage } from '../shared/chat'
import type { PetCommand } from '../shared/ipc'
import { createAIProfile, DEFAULT_SETTINGS, type AppSettings } from '../shared/settings'

function memoryHistory(
  initial: ChatMessage[] = []
): ChatHistoryPersistence & { saved: ChatMessage[] | null } {
  return {
    saved: null,
    load: () => initial,
    save(messages) {
      this.saved = messages
    },
    clear() {
      this.saved = null
    }
  }
}

function setup(
  options: {
    settings?: Partial<AppSettings>
    key?: string | null
    chat?: AIProvider['chat']
    history?: ReturnType<typeof memoryHistory>
  } = {}
) {
  const settings: AppSettings = { ...structuredClone(DEFAULT_SETTINGS), ...options.settings }
  const chat = vi.fn(
    options.chat ?? (async () => '{"text":"你好呀","emotion":"happy","speech":true}')
  )
  const provider: AIProvider = { testConnection: vi.fn(), chat }
  const pet: PetCommand[] = []
  const states: boolean[] = []
  const history = options.history ?? memoryHistory()
  const service = new ChatService({
    getSettings: () => settings,
    getKey: () => (options.key === undefined ? 'sk-test' : options.key),
    createProvider: () => provider,
    history,
    onState: (state) => states.push(state.busy),
    onPet: (command) => pet.push(command)
  })
  return { service, chat, pet, states, history, settings }
}

describe('ChatService', () => {
  it('sends the persona prompt plus history and records a validated reply', async () => {
    const { service, chat, pet, states, history } = setup()
    const result = await service.send('  你好  ')

    expect(result).toMatchObject({
      ok: true,
      reply: { role: 'assistant', text: '你好呀', emotion: 'happy' }
    })
    const sent = chat.mock.calls[0][0] as ProviderMessage[]
    expect(sent[0].role).toBe('system')
    expect(sent.at(-1)).toEqual({ role: 'user', content: '你好' })
    expect(service.state().messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(history.saved).toHaveLength(2)
    expect(pet).toEqual([
      { type: 'emotion', emotion: 'thinking', durationMs: 0 },
      { type: 'say', text: '你好呀', emotion: 'happy' }
    ])
    expect(states).toContain(true)
    expect(states.at(-1)).toBe(false)
  })

  it('explains what to configure when no profile is active or the key is missing', async () => {
    const off = setup({ settings: { ai: { ...DEFAULT_SETTINGS.ai, activeProfileId: null } } })
    expect(await off.service.send('hi')).toMatchObject({ ok: false, kind: 'no-profile' })
    expect(off.chat).not.toHaveBeenCalled()
    expect(off.service.state().messages).toEqual([])
    expect(off.pet[0]).toMatchObject({ type: 'say', emotion: 'sad' })

    const noKey = setup({ key: null })
    expect(await noKey.service.send('hi')).toMatchObject({ ok: false, kind: 'missing-key' })
  })

  it('does not need a key for the mock provider or local services', async () => {
    const mock = createAIProfile('m', 'mock')
    const local = {
      ...createAIProfile('l', 'custom'),
      baseUrl: 'http://localhost:1234/v1',
      model: 'x'
    }
    for (const profile of [mock, local]) {
      const { service } = setup({
        key: null,
        settings: { ai: { activeProfileId: profile.id, profiles: [profile] } }
      })
      expect((await service.send('hi')).ok).toBe(true)
    }
  })

  it('rejects empty, oversized and concurrent messages', async () => {
    let release: (value: string) => void = () => {}
    const { service } = setup({ chat: () => new Promise((resolve) => (release = resolve)) })
    expect(await service.send('   ')).toMatchObject({ kind: 'invalid-input' })
    expect(await service.send('x'.repeat(1001))).toMatchObject({ kind: 'invalid-input' })
    expect(await service.send(42)).toMatchObject({ kind: 'invalid-input' })

    const first = service.send('one')
    expect(service.busy).toBe(true)
    expect(await service.send('two')).toMatchObject({ kind: 'busy' })
    release('{"text":"ok"}')
    expect((await first).ok).toBe(true)
  })

  it('cancels the in-flight request and resets the pet', async () => {
    const { service, pet } = setup({
      chat: (_messages, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new AIRequestError('cancelled', '已取消')))
        )
    })
    const pending = service.send('hi')
    service.cancel()
    expect(await pending).toMatchObject({ ok: false, kind: 'cancelled' })
    expect(service.busy).toBe(false)
    expect(pet.at(-1)).toEqual({ type: 'emotion', emotion: 'idle' })
    expect(service.state().messages.map((m) => m.role)).toEqual(['user'])
  })

  it('reports provider errors and unusable replies without crashing', async () => {
    const failing = setup({
      chat: async () => Promise.reject(new AIRequestError('network', '网络错误'))
    })
    expect(await failing.service.send('hi')).toMatchObject({ ok: false, kind: 'network' })
    expect(failing.pet.at(-1)).toMatchObject({ type: 'say', emotion: 'sad' })

    const empty = setup({ chat: async () => '{"emotion":"happy"}' })
    expect(await empty.service.send('hi')).toMatchObject({ ok: false, kind: 'bad-response' })

    const crash = setup({ chat: async () => Promise.reject(new Error('boom')) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await crash.service.send('hi')).toMatchObject({ ok: false, kind: 'unknown' })
  })

  it('honours keepHistory and clears everything on request', async () => {
    const stored: ChatMessage[] = [{ id: 'old', role: 'user', text: '旧消息', at: 1 }]
    const off = setup({
      settings: { persona: { ...DEFAULT_SETTINGS.persona, keepHistory: false } },
      history: memoryHistory(stored)
    })
    expect(off.service.state().messages).toEqual([])
    await off.service.send('hi')
    expect(off.history.saved).toBeNull()

    const on = setup({ history: memoryHistory(stored) })
    expect(on.service.state().messages).toHaveLength(1)
    on.service.clear()
    expect(on.service.state().messages).toEqual([])
    expect(on.history.saved).toBeNull()
  })

  it('records proactive lines without a user message', async () => {
    const { service, chat } = setup()
    const result = await service.speakProactively()
    expect(result).toMatchObject({ ok: true, reply: { proactive: true } })
    const sent = chat.mock.calls[0][0] as ProviderMessage[]
    expect(sent.at(-1)?.role).toBe('user')
    expect(service.state().messages.map((m) => m.role)).toEqual(['assistant'])
  })
})
