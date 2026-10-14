import { describe, expect, it } from 'vitest'
import { pcmFromBase64, pcmToBase64 } from '../electron/main/services/local-voice/protocol'
import { decodeWav, encodeWav } from '../shared/wav'

describe('local voice PCM transport', () => {
  it('round-trips float32 samples through base64', () => {
    const samples = new Float32Array([0, 0.5, -0.25, 1])
    const restored = pcmFromBase64(pcmToBase64(samples))
    expect(Array.from(restored)).toEqual(Array.from(samples))
  })

  it('survives encodeWav then decodeWav like the TTS IPC path', () => {
    const samples = new Float32Array([0, 0.25, -0.5])
    const wav = encodeWav(samples, 24000)
    const decoded = decodeWav(
      Uint8Array.from(Buffer.from(Buffer.from(wav).toString('base64'), 'base64'))
    )
    expect(decoded?.sampleRate).toBe(24000)
    expect(Array.from(decoded!.samples).map((s) => +s.toFixed(3))).toEqual([0, 0.25, -0.5])
  })
})
