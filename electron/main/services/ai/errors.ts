import type { ChatErrorKind } from '../../../../shared/chat'

/** Error with a user-facing message that never contains the key or the response body. */
export class AIRequestError extends Error {
  constructor(
    readonly kind: ChatErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'AIRequestError'
  }
}

export function errorForStatus(status: number): AIRequestError {
  if (status === 401 || status === 403) {
    return new AIRequestError('auth', 'API Key 无效或没有权限', status)
  }
  if (status === 404)
    return new AIRequestError(
      'not-found',
      '接口地址或模型不存在，请检查 Base URL 和模型名称',
      status
    )
  if (status === 429) {
    return new AIRequestError('rate-limit', '请求过于频繁或额度不足，请稍后再试', status)
  }
  if (status >= 500) return new AIRequestError('server', '服务端暂时不可用，请稍后再试', status)
  return new AIRequestError('unknown', `服务返回了异常状态码 ${status}`, status)
}

/** Maps a fetch failure; `cancelled` tells a user cancel apart from the timeout. */
export function errorForFetchFailure(
  error: unknown,
  timeoutMs: number,
  cancelled: boolean
): AIRequestError {
  if (cancelled) return new AIRequestError('cancelled', '已取消')
  const name = (error as Error | undefined)?.name
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new AIRequestError('timeout', `请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
  }
  return new AIRequestError('network', '无法连接到服务，请检查网络或 Base URL')
}
