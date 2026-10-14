/**
 * Runs sherpa-onnx in a real Node process (forked with system node.exe).
 * Electron 44 cannot receive Kokoro's external ArrayBuffers.
 */
import { join } from 'node:path'
import { OfflineRecognizer, OfflineTts } from 'sherpa-onnx-node'
import { encodeWav } from '../../../../shared/wav'
import { pcmFromBase64, type WorkerRequest, type WorkerResponse } from './protocol'

const NUM_THREADS = 2

const recognizers = new Map<string, Promise<OfflineRecognizer>>()
const voices = new Map<string, Promise<OfflineTts>>()

function recognizer(dir: string): Promise<OfflineRecognizer> {
  let pending = recognizers.get(dir)
  if (!pending) {
    pending = OfflineRecognizer.createAsync({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: {
          model: join(dir, 'model.int8.onnx'),
          language: 'auto',
          useInverseTextNormalization: 1
        },
        tokens: join(dir, 'tokens.txt'),
        numThreads: NUM_THREADS,
        provider: 'cpu',
        debug: 0
      }
    })
    pending.catch(() => recognizers.delete(dir))
    recognizers.set(dir, pending)
  }
  return pending
}

function tts(dir: string): Promise<OfflineTts> {
  let pending = voices.get(dir)
  if (!pending) {
    pending = OfflineTts.createAsync({
      model: {
        kokoro: {
          model: join(dir, 'model.int8.onnx'),
          voices: join(dir, 'voices.bin'),
          tokens: join(dir, 'tokens.txt'),
          dataDir: join(dir, 'espeak-ng-data'),
          lexicon: [join(dir, 'lexicon-us-en.txt'), join(dir, 'lexicon-zh.txt')].join(','),
          lang: 'en-us'
        },
        numThreads: NUM_THREADS,
        provider: 'cpu',
        debug: 0
      },
      ruleFsts: ['date-zh.fst', 'phone-zh.fst', 'number-zh.fst'].map((f) => join(dir, f)).join(','),
      maxNumSentences: 1
    })
    pending.catch(() => voices.delete(dir))
    voices.set(dir, pending)
  }
  return pending
}

function copySamples(src: Float32Array): Float32Array {
  const copy = new Float32Array(src.length)
  copy.set(src)
  return copy
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  if (request.type === 'transcribe') {
    const engine = await recognizer(request.modelDir)
    const stream = engine.createStream()
    stream.acceptWaveform({ samples: pcmFromBase64(request.pcm), sampleRate: request.sampleRate })
    await engine.decodeAsync(stream)
    return { id: request.id, ok: true, text: engine.getResult(stream).text }
  }
  const engine = await tts(request.modelDir)
  const sid = Math.min(Math.max(0, Math.round(request.sid)), engine.numSpeakers - 1)
  const audio = engine.generate({ text: request.text, sid, speed: request.speed })
  const wav = encodeWav(copySamples(audio.samples), audio.sampleRate)
  return { id: request.id, ok: true, wav: Buffer.from(wav).toString('base64') }
}

function send(response: WorkerResponse): void {
  process.send?.(response)
}

process.on('message', (request: WorkerRequest) => {
  handle(request)
    .then(send)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      send({ id: request.id, ok: false, error: message })
    })
})

process.on('disconnect', () => process.exit(0))
