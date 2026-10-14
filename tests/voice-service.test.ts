import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceService } from '../electron/main/services/voice/voice-service'
import type { PetCommand } from '../shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings, type VoiceSettings } from '../shared/settings'
import type { VoiceState } from '../shared/voice'
import { encodeWav } from '../src/utils/wav'

function setup(voice: Partial<VoiceSettings> = {}, fetchImpl?: typeof fetch, dnd = false) {
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
    expect(pet[0]).toMatchObject({
      type: 'say',
      voice: { engine: 'audio', data: new Uint8Array([9, 9]), mime: 'audio/mpeg', volume: 0.5 }
    })
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
    let calls = 0
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          if (++calls === 1) {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('x', 'AbortError'))
            )
          } else resolve(audioResponse())
        })
    )
    const { service, pet } = setup({ ttsProvider: 'openai-compatible' }, fetchImpl as typeof fetch)

    const first = service.speak('第一句')
    const second = service.speak('第二句')
    await Promise.all([first, second])
    expect(pet).toHaveLength(1)
    expect(pet[0]).toMatchObject({ type: 'say', text: '第二句' })
    expect(service.state().status).toBe('speaking')
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
    const ok = setup({}, vi.fn(async () => Response.json({ text: '  你好  ' })) as typeof fetch)
    expect(await ok.service.transcribe(wav)).toEqual({ ok: true, data: '你好' })

    const empty = setup({}, vi.fn(async () => Response.json({ text: ' ' })) as typeof fetch)
    expect(await empty.service.transcribe(wav)).toMatchObject({ ok: false })

    const down = setup({}, vi.fn(async () => new Response('', { status: 503 })) as typeof fetch)
    const failed = await down.service.transcribe(wav)
    expect(failed.ok).toBe(false)
    expect(!failed.ok && failed.error).toContain('语音识别失败')
  })

  it('the mock recognizer works offline', async () => {
    const fetchImpl = vi.fn()
    const { service } = setup({ asrProvider: 'mock' }, fetchImpl as typeof fetch)
    expect((await service.transcribe(wav)).ok).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
