import type { ConnectionErrorKind, ConnectionTestResult } from '../../../../shared/ipc'
import type { AIProfile } from '../../../../shared/settings'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

type UrlCheck = { ok: true; url: URL } | { ok: false; kind: ConnectionErrorKind; message: string }

/** Keys may only travel over HTTPS, except to services on this machine. */
export function checkBaseUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, kind: 'invalid-url', message: 'API Base URL 格式不正确' }
  }
  if (url.protocol === 'https:') return { ok: true, url }
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return { ok: true, url }
  return {
    ok: false,
    kind: 'insecure-url',
    message: '仅允许 HTTPS 地址（本机 localhost 服务除外），避免密钥被明文传输'
  }
}

export function isLocalUrl(raw: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(raw.trim()).hostname)
  } catch {
    return false
  }
}

function fail(kind: ConnectionErrorKind, message: string, status?: number): ConnectionTestResult {
  return { ok: false, kind, message, status }
}

function classifyStatus(status: number): ConnectionTestResult {
  if (status === 401 || status === 403) return fail('auth', 'API Key 无效或没有权限', status)
  if (status === 404) return fail('not-found', '接口地址不存在，请检查 Base URL', status)
  if (status === 429) return fail('rate-limit', '请求过于频繁或额度不足，请稍后再试', status)
  if (status >= 500) return fail('server', '服务端暂时不可用，请稍后再试', status)
  return fail('unknown', `服务返回了异常状态码 ${status}`, status)
}

function listModelIds(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return null
  return data
    .map((item) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Calls the OpenAI-compatible `GET {baseUrl}/models` endpoint. Result messages never contain
 * the key or the response body.
 */
export async function testConnection(
  settings: AIProfile,
  apiKey: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  const check = checkBaseUrl(settings.baseUrl)
  if (!check.ok) return fail(check.kind, check.message)
  if (!apiKey && !isLocalUrl(settings.baseUrl)) {
    return fail('missing-key', '尚未保存 API Key')
  }

  const endpoint = `${check.url.href.replace(/\/+$/, '')}/models`
  const started = Date.now()
  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(settings.timeoutMs)
    })
  } catch (error) {
    const name = (error as Error)?.name
    if (name === 'TimeoutError' || name === 'AbortError') {
      return fail('timeout', `连接超时（${Math.round(settings.timeoutMs / 1000)} 秒）`)
    }
    return fail('network', '无法连接到服务，请检查网络或 Base URL')
  }

  const latencyMs = Date.now() - started
  if (!response.ok) return { ...classifyStatus(response.status), latencyMs }

  let ids: string[] | null = null
  try {
    ids = listModelIds(await response.json())
  } catch {
    ids = null
  }

  const model = settings.model.trim()
  const modelAvailable = model && ids ? ids.includes(model) : null
  const message =
    modelAvailable === false ? `已连接，但模型列表中没有 “${model}”，请确认模型名称` : '连接成功'
  return { ok: true, message, status: response.status, latencyMs, modelAvailable }
}
