import { describe, expect, it, vi } from 'vitest'
import { isPcmWav, synthesizeSpeech, transcribeAudio } from '../electron/main/services/voice/cloud'
import { encodeWav } from '../shared/wav'

const target = {
  baseUrl: 'https://api.example.com/v1/',
  model: 'tts-model',
  voice: 'anna',
  speed: 1.2
}
const request = (fetchImpl: typeof fetch, apiKey: string | null = 'sk-voice') => ({
  apiKey,
  timeoutMs: 5000,
  signal: new AbortController().signal,
  fetchImpl
})

describe('synthesizeSpeech', () => {
  it('posts an OpenAI-compatible speech request and returns the audio', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } })
    )
    const audio = await synthesizeSpeech(target, '你好', request(fetchImpl as typeof fetch))

    expect(audio).toEqual({ data: new Uint8Array([1, 2, 3]), mime: 'audio/mpeg' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/audio/speech')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-voice')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'tts-model',
      input: '你好',
      voice: 'anna',
      speed: 1.2,
      response_format: 'mp3'
    })
  })

  it('rejects unsafe or incomplete settings before sending anything', async () => {
    const fetchImpl = vi.fn()
    const call = (overrides: Partial<typeof target>, key: string | null = 'sk') =>
      synthesizeSpeech({ ...target, ...overrides }, 'hi', request(fetchImpl as typeof fetch, key))

    await expect(call({ baseUrl: 'http://api.example.com' })).rejects.toMatchObject({
      kind: 'insecure-url'
    })
    await expect(call({}, null)).rejects.toMatchObject({ kind: 'missing-key' })
    await expect(call({ voice: ' ' })).rejects.toMatchObject({ kind: 'invalid-input' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps HTTP errors and rejects non-audio responses', async () => {
    const status = vi.fn(async () => new Response('nope', { status: 401 }))
    await expect(
      synthesizeSpeech(target, 'hi', request(status as typeof fetch))
    ).rejects.toMatchObject({
      kind: 'auth'
    })

    const json = vi.fn(
      async () => new Response('{"error":"x"}', { headers: { 'Content-Type': 'application/json' } })
    )
    await expect(
      synthesizeSpeech(target, 'hi', request(json as typeof fetch))
    ).rejects.toMatchObject({
      kind: 'bad-response'
    })
  })
})

describe('transcribeAudio', () => {
  const wav = encodeWav(new Float32Array(1600).fill(0.3), 16000)

  it('uploads the WAV as multipart form data and returns the text', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ text: '你好呀' }))
    const text = await transcribeAudio(
      { baseUrl: 'https://asr.example.com/v1', model: 'whisper-1' },
      wav,
      request(fetchImpl as typeof fetch)
    )

    expect(text).toBe('你好呀')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://asr.example.com/v1/audio/transcriptions')
    const form = init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    const file = form.get('file') as File
    expect(file.name).toBe('speech.wav')
    expect(file.size).toBe(wav.byteLength)
  })

  it('reports responses without text', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ result: 'x' }))
    await expect(
      transcribeAudio(
        { baseUrl: 'https://asr.example.com', model: 'm' },
        wav,
        request(fetchImpl as typeof fetch)
      )
    ).rejects.toMatchObject({ kind: 'bad-response' })
  })
})

describe('isPcmWav', () => {
  it('accepts 16-bit PCM WAV and rejects anything else', () => {
    expect(isPcmWav(encodeWav(new Float32Array(10), 16000))).toBe(true)
    expect(isPcmWav(new Uint8Array(100))).toBe(false)
    expect(isPcmWav(new TextEncoder().encode('RIFF'))).toBe(false)
  })
})
