/** Messages between the main process and the Node worker. Audio travels as base64, not typed arrays. */

export function pcmToBase64(samples: Float32Array): string {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).toString('base64')
}

export function pcmFromBase64(b64: string): Float32Array {
  const bytes = Buffer.from(b64, 'base64')
  const copy = new Float32Array(bytes.byteLength / 4)
  copy.set(new Float32Array(bytes.buffer, bytes.byteOffset, copy.length))
  return copy
}

export type WorkerRequest =
  | {
      id: number
      type: 'transcribe'
      modelDir: string
      /** Float32 PCM, little-endian, encoded as base64. */
      pcm: string
      sampleRate: number
    }
  | {
      id: number
      type: 'synthesize'
      modelDir: string
      text: string
      sid: number
      speed: number
    }

export type WorkerResponse =
  | { id: number; ok: true; text: string }
  | { id: number; ok: true; wav: string }
  | { id: number; ok: false; error: string }
