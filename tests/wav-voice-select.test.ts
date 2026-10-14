import { describe, expect, it } from 'vitest'
import { pickSystemVoice } from '../src/utils/voice-select'
import { encodeWav, peakLevel } from '../src/utils/wav'

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
