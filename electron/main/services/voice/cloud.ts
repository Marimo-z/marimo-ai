import { checkBaseUrl, endpoint, isLocalUrl } from '../ai/connection-test'
import { AIRequestError, errorForFetchFailure, errorForStatus } from '../ai/errors'

export interface CloudEndpoint {
  baseUrl: string
  model: string
}

export interface CloudRequest {
  apiKey: string | null
  timeoutMs: number
  signal: AbortSignal
  fetchImpl?: typeof fetch
}

export interface SynthesizedAudio {
  data: Uint8Array
  mime: string
}

const TTS_AUDIO_MAX_BYTES = 10 * 1024 * 1024

/** Validates the endpoint and sends the request; errors never contain the key or response body. */
async function send(
  target: CloudEndpoint,
  path: string,
  request: CloudRequest,
  init: { body: string | FormData; headers?: Record<string, string> }
): Promise<Response> {
  const check = checkBaseUrl(target.baseUrl)
  if (!check.ok) throw new AIRequestError(check.kind, check.message)
  if (!request.apiKey && !isLocalUrl(target.baseUrl)) {
    throw new AIRequestError('missing-key', '尚未设置 API Key')
  }
  if (!target.model.trim()) throw new AIRequestError('invalid-input', '尚未填写模型名称')

  const headers: Record<string, string> = { ...init.headers }
  if (request.apiKey) headers.Authorization = `Bearer ${request.apiKey}`

  let response: Response
  try {
    response = await (request.fetchImpl ?? fetch)(endpoint(check.url, path), {
      method: 'POST',
      headers,
      body: init.body,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)])
    })
  } catch (error) {
    throw errorForFetchFailure(error, request.timeoutMs, request.signal.aborted)
  }
  if (!response.ok) throw errorForStatus(response.status)
  return response
}

/** `POST {baseUrl}/audio/speech` (OpenAI-compatible). */
export async function synthesizeSpeech(
  target: CloudEndpoint & { voice: string; speed: number },
  text: string,
  request: CloudRequest
): Promise<SynthesizedAudio> {
  if (!target.voice.trim()) throw new AIRequestError('invalid-input', '尚未填写音色')
  const response = await send(target, 'audio/speech', request, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: target.model.trim(),
      input: text,
      voice: target.voice.trim(),
      speed: target.speed,
      response_format: 'mp3'
    })
  })

  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (mime && !mime.startsWith('audio/') && mime !== 'application/octet-stream') {
    throw new AIRequestError('bad-response', '服务没有返回音频，请检查模型和音色名称')
  }
  let buffer: ArrayBuffer
  try {
    buffer = await response.arrayBuffer()
  } catch (error) {
    throw errorForFetchFailure(error, request.timeoutMs, request.signal.aborted)
  }
  if (buffer.byteLength === 0) throw new AIRequestError('bad-response', '服务返回的音频为空')
  if (buffer.byteLength > TTS_AUDIO_MAX_BYTES) {
    throw new AIRequestError('bad-response', '服务返回的音频过大')
  }
  return { data: new Uint8Array(buffer), mime: mime.startsWith('audio/') ? mime : 'audio/mpeg' }
}

/** `POST {baseUrl}/audio/transcriptions` (OpenAI-compatible) with a WAV file. */
export async function transcribeAudio(
  target: CloudEndpoint,
  wav: Uint8Array,
  request: CloudRequest
): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav')
  form.append('model', target.model.trim())
  const response = await send(target, 'audio/transcriptions', request, { body: form })

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (request.signal.aborted) throw errorForFetchFailure(error, request.timeoutMs, true)
    throw new AIRequestError('bad-response', '服务返回的内容无法解析')
  }
  const text = (body as { text?: unknown } | null)?.text
  if (typeof text !== 'string')
    throw new AIRequestError('bad-response', '服务返回的内容缺少识别文本')
  return text
}

/** Checks for a RIFF/WAVE header with 16-bit PCM, which is all the panel ever sends. */
export function isPcmWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44) return false
  const ascii = (offset: number, length: number): string =>
    String.fromCharCode(...bytes.subarray(offset, offset + length))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return (
    ascii(0, 4) === 'RIFF' &&
    ascii(8, 4) === 'WAVE' &&
    ascii(12, 4) === 'fmt ' &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(34, true) === 16
  )
}
