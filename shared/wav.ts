/** Encodes mono samples in [-1, 1] as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return bytes
}

/** Decodes a mono 16-bit PCM WAV; returns null for anything else. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } | null {
  if (bytes.length < 12) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null

  let sampleRate = 0
  let pcmMono16 = false
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ' && size >= 16) {
      pcmMono16 =
        view.getUint16(body, true) === 1 &&
        view.getUint16(body + 2, true) === 1 &&
        view.getUint16(body + 14, true) === 16
      sampleRate = view.getUint32(body + 4, true)
    } else if (id === 'data') {
      if (!pcmMono16 || sampleRate <= 0) return null
      const count = Math.floor(Math.min(size, bytes.length - body) / 2)
      const samples = new Float32Array(count)
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true) / 0x8000
      return { samples, sampleRate }
    }
    offset = body + size + (size % 2)
  }
  return null
}

export function peakLevel(samples: Float32Array): number {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  return peak
}
