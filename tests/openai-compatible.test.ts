import { describe, expect, it, vi } from 'vitest'
import { AIRequestError } from '../electron/main/services/ai/errors'
import { OpenAICompatibleProvider } from '../electron/main/services/ai/openai-compatible'
import type { ProviderMessage } from '../electron/main/services/ai/provider'
import { createAIProfile, type AIProfile } from '../shared/settings'

const KEY = 'sk-very-secret-key'
const profile: AIProfile = {
  ...createAIProfile('p', 'deepseek'),
  baseUrl: 'https://api.example.com/v1/',
  model: 'deepseek-flash',
  timeoutMs: 5000
}
const messages: ProviderMessage[] = [
  { role: 'system', content: 's' },
  { role: 'user', content: '你好' }
]

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function chatError(
  provider: OpenAICompatibleProvider,
  signal = new AbortController().signal
) {
  try {
    await provider.chat(messages, { signal })
  } catch (error) {
    return error as AIRequestError
  }
  throw new Error('expected chat() to fail')
}

describe('OpenAICompatibleProvider.chat', () => {
  it('posts to {baseUrl}/chat/completions and returns the message content', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { choices: [{ message: { role: 'assistant', content: '{"text":"嗨"}' } }] })
    )
    const provider = new OpenAICompatibleProvider(
      profile,
      KEY,
      fetchImpl as unknown as typeof fetch
    )
    await expect(provider.chat(messages, { signal: new AbortController().signal })).resolves.toBe(
      '{"text":"嗨"}'
    )

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'deepseek-flash',
      messages,
      temperature: profile.temperature,
      max_tokens: profile.maxTokens,
      stream: false
    })
  })

  it.each([
    [401, 'auth'],
    [404, 'not-found'],
    [429, 'rate-limit'],
    [500, 'server']
  ])('maps HTTP %i to %s without leaking the key or body', async (status, kind) => {
    const fetchImpl = async () => json(status, { error: { message: `bad ${KEY}` } })
    const error = await chatError(
      new OpenAICompatibleProvider(profile, KEY, fetchImpl as typeof fetch)
    )
    expect(error).toBeInstanceOf(AIRequestError)
    expect(error.kind).toBe(kind)
    expect(error.message).not.toContain(KEY)
  })

  it('reports malformed responses', async () => {
    const empty = async () => json(200, { choices: [] })
    expect(
      (await chatError(new OpenAICompatibleProvider(profile, KEY, empty as typeof fetch))).kind
    ).toBe('bad-response')
    const notJson = async () => new Response('<html>', { status: 200 })
    expect(
      (await chatError(new OpenAICompatibleProvider(profile, KEY, notJson as typeof fetch))).kind
    ).toBe('bad-response')
  })

  it('tells a user cancel apart from a timeout', async () => {
    const hang = (_url: unknown, init: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
      )
    const controller = new AbortController()
    const provider = new OpenAICompatibleProvider(profile, KEY, hang as unknown as typeof fetch)
    const pending = chatError(provider, controller.signal)
    controller.abort()
    expect((await pending).kind).toBe('cancelled')

    const fast = new OpenAICompatibleProvider(
      { ...profile, timeoutMs: 20 },
      KEY,
      hang as unknown as typeof fetch
    )
    expect((await chatError(fast)).kind).toBe('timeout')
  })

  it('refuses to send a key over plain HTTP or without a model', async () => {
    const fetchImpl = vi.fn()
    const insecure = new OpenAICompatibleProvider(
      { ...profile, baseUrl: 'http://evil.example.com' },
      KEY,
      fetchImpl as unknown as typeof fetch
    )
    expect((await chatError(insecure)).kind).toBe('insecure-url')
    const noModel = new OpenAICompatibleProvider(
      { ...profile, model: ' ' },
      KEY,
      fetchImpl as unknown as typeof fetch
    )
    expect((await chatError(noModel)).kind).toBe('invalid-input')
    const noKey = new OpenAICompatibleProvider(profile, null, fetchImpl as unknown as typeof fetch)
    expect((await chatError(noKey)).kind).toBe('missing-key')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
