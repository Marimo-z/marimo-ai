/**
 * Runs sherpa-onnx in an Electron utility process, so heavy inference and a native crash cannot
 * freeze or take down the main process. Models are loaded on first use and kept until the
 * process is stopped by the main process.
 */
import { join } from 'node:path'
import { OfflineRecognizer, OfflineTts } from 'sherpa-onnx-node'
import type { WorkerRequest, WorkerResponse } from './protocol'

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

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  if (request.type === 'transcribe') {
    const engine = await recognizer(request.modelDir)
    const stream = engine.createStream()
    stream.acceptWaveform({ samples: request.samples, sampleRate: request.sampleRate })
    await engine.decodeAsync(stream)
    return { id: request.id, ok: true, text: engine.getResult(stream).text }
  }
  const engine = await tts(request.modelDir)
  const sid = Math.min(Math.max(0, Math.round(request.sid)), engine.numSpeakers - 1)
  const audio = await engine.generateAsync({ text: request.text, sid, speed: request.speed })
  // Copy out of the native buffer before it is sent over IPC.
  return {
    id: request.id,
    ok: true,
    samples: new Float32Array(audio.samples),
    sampleRate: audio.sampleRate
  }
}

process.parentPort.on('message', (event: Electron.MessageEvent) => {
  const request = event.data as WorkerRequest
  handle(request)
    .then((response) => process.parentPort.postMessage(response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      process.parentPort.postMessage({
        id: request.id,
        ok: false,
        error: message
      } satisfies WorkerResponse)
    })
})
