/** The subset of sherpa-onnx-node used by the local voice worker. */
declare module 'sherpa-onnx-node' {
  export interface OfflineStream {
    acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void
  }

  export class OfflineRecognizer {
    static createAsync(config: object): Promise<OfflineRecognizer>
    createStream(): OfflineStream
    decodeAsync(stream: OfflineStream): Promise<unknown>
    getResult(stream: OfflineStream): { text: string; lang?: string }
  }

  export class OfflineTts {
    static createAsync(config: object): Promise<OfflineTts>
    readonly numSpeakers: number
    readonly sampleRate: number
    generate(request: { text: string; sid: number; speed: number }): {
      samples: Float32Array
      sampleRate: number
    }
    generateAsync(request: {
      text: string
      sid: number
      speed: number
    }): Promise<{ samples: Float32Array; sampleRate: number }>
  }

  export const version: string
}
