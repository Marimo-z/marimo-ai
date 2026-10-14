/** Messages between the main process and the local voice worker (an Electron utility process). */
export type WorkerRequest =
  | {
      id: number
      type: 'transcribe'
      modelDir: string
      samples: Float32Array
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
  | { id: number; ok: true; samples: Float32Array; sampleRate: number }
  | { id: number; ok: false; error: string }
