import { describe, expect, it } from 'vitest'
import { pickSystemVoice } from '../src/utils/voice-select'
import { decodeWav, encodeWav, peakLevel } from '../shared/wav'

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 16000)
    const view = new DataView(bytes.buffer)
    const ascii = (offset: number): string =>
      String.fromCharCode(...bytes.subarray(offset, offset + 4))

    expect(bytes.byteLength).toBe(44 + 8)
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(view.getUint32(4, true)).toBe(36 + 8)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 32767, -32768, 32767
    ])
  })

  it('decodeWav round-trips encodeWav and skips unknown chunks', () => {
    const bytes = encodeWav(new Float32Array([0, 0.5, -0.5]), 24000)
    expect(decodeWav(bytes)?.sampleRate).toBe(24000)
    expect(Array.from(decodeWav(bytes)!.samples).map((s) => +s.toFixed(3))).toEqual([0, 0.5, -0.5])

    // A LIST chunk between "fmt " and "data", as some encoders write.
    const list = new Uint8Array([0x4c, 0x49, 0x53, 0x54, 2, 0, 0, 0, 0, 0])
    const withList = new Uint8Array([...bytes.subarray(0, 36), ...list, ...bytes.subarray(36)])
    expect(decodeWav(withList)?.samples).toHaveLength(3)
  })

  it('decodeWav rejects stereo and non-WAV data', () => {
    const stereo = encodeWav(new Float32Array(4), 16000)
    new DataView(stereo.buffer).setUint16(22, 2, true)
    expect(decodeWav(stereo)).toBeNull()
    expect(decodeWav(new TextEncoder().encode('not a wav file'))).toBeNull()
  })

  it('peakLevel returns the largest magnitude', () => {
    expect(peakLevel(new Float32Array([0.1, -0.6, 0.3]))).toBeCloseTo(0.6)
  })
})

describe('pickSystemVoice', () => {
  const voices = [
    { name: 'Microsoft David', lang: 'en-US', localService: true },
    { name: 'Google 普通话', lang: 'zh-CN', localService: false },
    { name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }
  ]

  it('prefers the named voice, then a local Chinese voice', () => {
    expect(pickSystemVoice(voices, 'Microsoft David')?.name).toBe('Microsoft David')
    expect(pickSystemVoice(voices, '')?.name).toBe('Microsoft Huihui')
    expect(pickSystemVoice(voices, 'Missing')?.name).toBe('Microsoft Huihui')
  })

  it('returns null when there is no Chinese voice', () => {
    expect(pickSystemVoice([voices[0]], '')).toBeNull()
  })
})
