import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalEngineError } from '../electron/main/services/local-voice/errors'
import { VoiceService, type LocalSpeech } from '../electron/main/services/voice/voice-service'
import type { PetCommand } from '../shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings, type VoiceSettings } from '../shared/settings'
import type { VoiceState } from '../shared/voice'
import { decodeWav, encodeWav } from '../shared/wav'

function setup(
  voice: Partial<VoiceSettings> = {},
  fetchImpl?: typeof fetch,
  dnd = false,
  local?: LocalSpeech
) {
  const settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  settings.voice = { ...settings.voice, ...voice }
  settings.pet.doNotDisturb = dnd
  const pet: PetCommand[] = []
  const states: VoiceState[] = []
  const service = new VoiceService({
    getSettings: () => settings,
    getKey: () => 'sk-voice',
    onPet: (command) => pet.push(command),
    onState: (state) => states.push(state),
    local,
    fetchImpl,
    mockDelayMs: 0
  })
  return { service, pet, states, settings }
}

const audioResponse = (): Response =>
  new Response(new Uint8Array([9, 9]), { headers: { 'Content-Type': 'audio/mpeg' } })

afterEach(() => vi.restoreAllMocks())

describe('VoiceService.present', () => {
  it('shows a plain bubble when not reading aloud, muted, or using the mock voice', async () => {
    for (const { speak, dnd, provider } of [
      { speak: false, dnd: false, provider: 'system' as const },
      { speak: true, dnd: true, provider: 'system' as const },
      { speak: true, dnd: false, provider: 'mock' as const }
    ]) {
      const { service, pet } = setup({ ttsProvider: provider }, undefined, dnd)
      await service.present('你好', 'happy', speak)
      expect(pet).toEqual([{ type: 'say', text: '你好', emotion: 'happy' }])
      expect(service.state().status).toBe('idle')
    }
  })

  it('hands system-voice lines to the pet and tracks playback reports', async () => {
    const { service, pet } = setup({ systemVoice: 'Huihui', rate: 1.5 })
    await service.present('你好', 'happy', true)

    expect(pet[0]).toMatchObject({
      type: 'say',
      text: '你好',
      voice: { engine: 'system', voiceName: 'Huihui', rate: 1.5 }
    })
    expect(service.state().status).toBe('speaking')
    const id = (pet[0] as { voice: { id: number } }).voice.id

    service.report(id + 1, 'ended')
    expect(service.state().status).toBe('speaking')
    service.report(id, 'error', 'device lost')
    expect(service.state()).toEqual({ status: 'idle', lastError: '语音播放失败：device lost' })
  })
})

describe('VoiceService cloud voice', () => {
  it('synthesizes first, then sends the audio with the bubble', async () => {
    const fetchImpl = vi.fn(async () => audioResponse())
    const { service, pet, states } = setup(
      { ttsProvider: 'openai-compatible', volume: 0.5 },
      fetchImpl
    )

    expect(await service.speak('你好')).toEqual({ ok: true, data: null })
    expect(states.map((s) => s.status)).toEqual(['synthesizing', 'speaking'])
    expect(pet[0]).toMatchObject({ type: 'say', text: '你好' })
    expect(pet[1]).toMatchObject({
      type: 'speak-more',
      voice: { engine: 'audio', data: new Uint8Array([9, 9]), mime: 'audio/mpeg', volume: 0.5 }
    })
    expect(pet[2]).toMatchObject({ type: 'speech-end' })
  })

  it('still shows the reply when synthesis fails, and reports why', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }))
    const { service, pet } = setup({ ttsProvider: 'openai-compatible' }, fetchImpl)

    const result = await service.speak('你好', 'happy')
    expect(result.ok).toBe(false)
    expect(pet).toEqual([{ type: 'say', text: '你好', emotion: 'happy' }])
    expect(service.state().status).toBe('idle')
    expect(service.state().lastError).toContain('语音合成失败')
  })

  it('stop() during synthesis cancels the request without an error', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        )
    )
    const { service, pet } = setup({ ttsProvider: 'openai-compatible' }, fetchImpl as typeof fetch)

    const pending = service.speak('你好')
    service.stop()
    expect((await pending).ok).toBe(false)
    expect(service.state()).toEqual({ status: 'idle', lastError: null })
    expect(pet).toEqual([{ type: 'say', text: '你好', emotion: undefined }])
  })

  it('a newer line replaces one that is still being synthesized', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          if (init.signal?.aborted) {
            reject(new DOMException('x', 'AbortError'))
            return
          }
          const timer = setTimeout(() => resolve(audioResponse()), 20)
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('x', 'AbortError'))
          })
        })
    )
    const { service, pet } = setup({ ttsProvider: 'openai-compatible' }, fetchImpl as typeof fetch)

    const first = service.speak('第一句')
    const second = service.speak('第二句')
    await Promise.all([first, second])
    const says = pet.filter((command) => command?.type === 'say')
    expect(says.at(-1)).toMatchObject({ type: 'say', text: '第二句' })
    expect(service.state().status).toBe('speaking')
  })

  it('plays the first sentence while the next one is still being synthesized', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const fetchImpl = vi.fn((_url: string, _init: RequestInit) => {
      calls++
      if (calls === 1) return gate.then(() => audioResponse())
      return Promise.resolve(audioResponse())
    })
    const { service, pet } = setup(
      { ttsProvider: 'openai-compatible' },
      fetchImpl as typeof fetch
    )

    const pending = service.speak('第一句。第二句。')
    await vi.waitUntil(() => calls === 1)
    expect(pet.some((command) => command?.type === 'speak-more')).toBe(false)
    release()
    await vi.waitUntil(() => calls === 2)
    expect(pet.some((command) => command?.type === 'speak-more')).toBe(true)
    await pending
    expect(pet.filter((command) => command?.type === 'speak-more')).toHaveLength(2)
    expect(pet.at(-1)).toMatchObject({ type: 'speech-end' })
  })
})

function fakeLocal(overrides: Partial<LocalSpeech> & { ready?: boolean } = {}): LocalSpeech {
  const { ready = true, ...rest } = overrides
  return {
    isReady: () => ready,
    transcribe: async () => '',
    synthesize: async () => ({ samples: new Float32Array(240).fill(0.1), sampleRate: 24000 }),
    ...rest
  }
}

describe('VoiceService local voice', () => {
  it('synthesizes on device and sends a WAV with the bubble', async () => {
    const synthesize = vi.fn(fakeLocal().synthesize)
    const { service, pet } = setup(
      { ttsProvider: 'local', localVoice: 7, rate: 1.2 },
      undefined,
      false,
      fakeLocal({ synthesize })
    )
    expect(await service.speak('你好')).toEqual({ ok: true, data: null })
    expect(synthesize.mock.calls[0]?.slice(0, 3)).toEqual(['你好', 7, 1.2])
    const clip = pet.find((command) => command?.type === 'speak-more')
    const voice = (clip as { voice: { engine: string; mime: string; data: Uint8Array } }).voice
    expect(voice).toMatchObject({ engine: 'audio', mime: 'audio/wav' })
    expect(decodeWav(voice.data)).toMatchObject({ sampleRate: 24000 })
  })

  it('synthesizes a finished sentence before the reply is allowed to play', async () => {
    const synthesize = vi.fn(fakeLocal().synthesize)
    const { service, pet } = setup({ ttsProvider: 'local' }, undefined, false, fakeLocal({ synthesize }))

    service.beginStream()
    service.noteStream('第一句。第二句还没')
    await vi.waitUntil(() => synthesize.mock.calls.length === 1)
    expect(synthesize.mock.calls[0]?.[0]).toBe('第一句。')
    expect(pet.some((command) => command?.type === 'speak-more')).toBe(false)

    await service.commitStream('第一句。第二句还没说完。', true)
    expect(synthesize.mock.calls.map((call) => call[0])).toEqual(['第一句。', '第二句还没说完。'])
    expect(pet.filter((command) => command?.type === 'speak-more')).toHaveLength(2)
  })

  it('drops audio prepared ahead when the reply should stay silent', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const synthesize = vi.fn(async () => {
      await gate
      return { samples: new Float32Array([0.1]), sampleRate: 24000 }
    })
    const { service, pet } = setup({ ttsProvider: 'local' }, undefined, false, fakeLocal({ synthesize }))

    service.beginStream()
    service.noteStream('不要读出来。')
    await vi.waitUntil(() => synthesize.mock.calls.length === 1)
    const pending = service.commitStream('不要读出来。', false)
    release()
    await pending
    expect(pet.some((command) => command?.type === 'speak-more')).toBe(false)
    expect(service.state().status).toBe('idle')
  })

  it('falls back to a silent bubble when the model is missing', async () => {
    const { service, pet } = setup(
      { ttsProvider: 'local' },
      undefined,
      false,
      fakeLocal({ ready: false })
    )
    const result = await service.speak('你好', 'happy')
    expect(!result.ok && result.error).toContain('尚未下载')
    expect(pet).toEqual([{ type: 'say', text: '你好', emotion: 'happy' }])
    expect(service.state().lastError).toContain('语音合成失败')
  })
})

describe('VoiceService.transcribe', () => {
  const wav = encodeWav(new Float32Array(1600).fill(0.2), 16000)

  it('validates the audio before anything is sent', async () => {
    const fetchImpl = vi.fn()
    const { service } = setup({}, fetchImpl as typeof fetch)
    expect(await service.transcribe('not audio')).toEqual({ ok: false, error: '录音格式不正确' })
    expect(await service.transcribe(new Uint8Array(64))).toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns trimmed text from the service and explains empty or failed results', async () => {
    const cloud = { asrProvider: 'openai-compatible' } as const
    const ok = setup(cloud, vi.fn(async () => Response.json({ text: '  你好  ' })) as typeof fetch)
    expect(await ok.service.transcribe(wav)).toEqual({ ok: true, data: '你好' })

    const empty = setup(cloud, vi.fn(async () => Response.json({ text: ' ' })) as typeof fetch)
    expect(await empty.service.transcribe(wav)).toMatchObject({ ok: false })

    const down = setup(cloud, vi.fn(async () => new Response('', { status: 503 })) as typeof fetch)
    const failed = await down.service.transcribe(wav)
    expect(failed.ok).toBe(false)
    expect(!failed.ok && failed.error).toContain('语音识别失败')
  })

  it('the local recognizer gets the decoded samples', async () => {
    const transcribe = vi.fn(async () => ' 本地结果 ')
    const local = fakeLocal({ transcribe })
    const { service } = setup({ asrProvider: 'local' }, undefined, false, local)
    expect(await service.transcribe(wav)).toEqual({ ok: true, data: '本地结果' })
    const [samples, rate] = transcribe.mock.calls[0] as unknown as [Float32Array, number]
    expect(rate).toBe(16000)
    expect(samples).toHaveLength(1600)
    expect(samples[0]).toBeCloseTo(0.2, 3)
  })

  it('explains a missing local model or an engine failure', async () => {
    const missing = setup({ asrProvider: 'local' }, undefined, false, fakeLocal({ ready: false }))
    const result = await missing.service.transcribe(wav)
    expect(!result.ok && result.error).toContain('尚未下载')

    const crash = fakeLocal({
      transcribe: async () => {
        throw new LocalEngineError('本地语音引擎意外退出，请重试')
      }
    })
    const crashed = await setup(
      { asrProvider: 'local' },
      undefined,
      false,
      crash
    ).service.transcribe(wav)
    expect(crashed).toEqual({ ok: false, error: '语音识别失败：本地语音引擎意外退出，请重试' })
  })

  it('the mock recognizer works offline', async () => {
    const fetchImpl = vi.fn()
    const { service } = setup({ asrProvider: 'mock' }, fetchImpl as typeof fetch)
    expect((await service.transcribe(wav)).ok).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
