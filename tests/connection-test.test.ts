import { describe, expect, it, vi } from 'vitest'
import { checkBaseUrl, testConnection } from '../electron/main/services/ai/connection-test'
import { DEFAULT_SETTINGS, type AISettings } from '../shared/settings'

const KEY = 'sk-very-secret-key'
const base: AISettings = { ...DEFAULT_SETTINGS.ai, baseUrl: 'https://api.example.com/v1/' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('checkBaseUrl', () => {
  it('accepts https and local http only', () => {
    expect(checkBaseUrl('https://api.deepseek.com').ok).toBe(true)
    expect(checkBaseUrl('http://localhost:11434/v1').ok).toBe(true)
    expect(checkBaseUrl('http://127.0.0.1:8080').ok).toBe(true)
    expect(checkBaseUrl('http://api.example.com')).toMatchObject({
      ok: false,
      kind: 'insecure-url'
    })
    expect(checkBaseUrl('not a url')).toMatchObject({ ok: false, kind: 'invalid-url' })
    expect(checkBaseUrl('file:///etc/passwd')).toMatchObject({ ok: false, kind: 'insecure-url' })
  })
})

describe('testConnection', () => {
  it('calls GET {baseUrl}/models with a bearer token and reports model availability', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { data: [{ id: 'deepseek-chat' }, { id: 'other' }] })
    )
    const result = await testConnection(base, KEY, fetchImpl as unknown as typeof fetch)

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/models')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(result).toMatchObject({ ok: true, modelAvailable: true, status: 200 })
  })

  it('warns when the model is not listed', async () => {
    const fetchImpl = async () => jsonResponse(200, { data: [{ id: 'other' }] })
    const result = await testConnection(base, KEY, fetchImpl as typeof fetch)
    expect(result.ok).toBe(true)
    expect(result.modelAvailable).toBe(false)
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not-found'],
    [429, 'rate-limit'],
    [503, 'server'],
    [418, 'unknown']
  ])('classifies HTTP %i as %s without leaking the key or body', async (status, kind) => {
    const fetchImpl = async () => jsonResponse(status, { error: `bad key ${KEY}` })
    const result = await testConnection(base, KEY, fetchImpl as typeof fetch)
    expect(result).toMatchObject({ ok: false, kind, status })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('reports timeouts and network errors', async () => {
    const timeout = async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' })
    }
    const network = async () => {
      throw new TypeError(`fetch failed for ${KEY}`)
    }
    expect(await testConnection(base, KEY, timeout as typeof fetch)).toMatchObject({
      ok: false,
      kind: 'timeout'
    })
    const result = await testConnection(base, KEY, network as typeof fetch)
    expect(result).toMatchObject({ ok: false, kind: 'network' })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('requires a key for remote services but not for local ones', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: [] }))
    expect(await testConnection(base, null, fetchImpl as unknown as typeof fetch)).toMatchObject({
      ok: false,
      kind: 'missing-key'
    })
    expect(fetchImpl).not.toHaveBeenCalled()

    const local = { ...base, baseUrl: 'http://localhost:11434/v1', model: '' }
    const result = await testConnection(local, null, fetchImpl as unknown as typeof fetch)
    expect(result).toMatchObject({ ok: true, modelAvailable: null })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({})
  })

  it('never sends the key to an insecure URL', async () => {
    const fetchImpl = vi.fn()
    const result = await testConnection(
      { ...base, baseUrl: 'http://evil.example.com' },
      KEY,
      fetchImpl as unknown as typeof fetch
    )
    expect(result.kind).toBe('insecure-url')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
