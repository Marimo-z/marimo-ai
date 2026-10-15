import type { ConnectionTestResult } from '../../../../shared/ipc'
import type { AIProfile } from '../../../../shared/settings'
import { checkBaseUrl, endpoint, isLocalUrl, testConnection } from './connection-test'
import { AIRequestError, errorForFetchFailure, errorForStatus } from './errors'
import type { AIProvider, ChatOptions, ProviderMessage } from './provider'

function extractContent(body: unknown): string | null {
  const choices = (body as { choices?: unknown } | null)?.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const content = (choices[0] as { message?: { content?: unknown } } | null)?.message?.content
  return typeof content === 'string' ? content : null
}

/** `POST {baseUrl}/chat/completions` as implemented by DeepSeek, Qwen, OpenAI, Ollama and others. */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private readonly profile: AIProfile,
    private readonly apiKey: string | null,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  testConnection(): Promise<ConnectionTestResult> {
    return testConnection(this.profile, this.apiKey, this.fetchImpl)
  }

  async chat(messages: ProviderMessage[], { signal }: ChatOptions): Promise<string> {
    const { profile, apiKey } = this
    const check = checkBaseUrl(profile.baseUrl)
    if (!check.ok) throw new AIRequestError(check.kind, check.message)
    if (!apiKey && !isLocalUrl(profile.baseUrl)) {
      throw new AIRequestError('missing-key', `“${profile.name}”尚未设置 API Key`)
    }
    if (!profile.model.trim()) {
      throw new AIRequestError('invalid-input', `“${profile.name}”尚未填写模型名称`)
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    let response: Response
    try {
      response = await this.fetchImpl(endpoint(check.url, 'chat/completions'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: profile.model.trim(),
          messages,
          temperature: profile.temperature,
          max_tokens: profile.maxTokens,
          stream: false
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(profile.timeoutMs)])
      })
    } catch (error) {
      throw errorForFetchFailure(error, profile.timeoutMs, signal.aborted)
    }

    if (!response.ok) throw errorForStatus(response.status)

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (signal.aborted) throw errorForFetchFailure(error, profile.timeoutMs, true)
      throw new AIRequestError('bad-response', '服务返回的内容无法解析')
    }
    const content = extractContent(body)
    if (content === null) throw new AIRequestError('bad-response', '服务返回的内容缺少回复文本')
    return content
  }

  async *chatStream(messages: ProviderMessage[], { signal }: ChatOptions): AsyncIterable<string> {
    const { profile, apiKey } = this
    const check = checkBaseUrl(profile.baseUrl)
    if (!check.ok) throw new AIRequestError(check.kind, check.message)
    if (!apiKey && !isLocalUrl(profile.baseUrl)) {
      throw new AIRequestError('missing-key', `“${profile.name}”尚未设置 API Key`)
    }
    if (!profile.model.trim()) {
      throw new AIRequestError('invalid-input', `“${profile.name}”尚未填写模型名称`)
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    let response: Response
    try {
      response = await this.fetchImpl(endpoint(check.url, 'chat/completions'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: profile.model.trim(),
          messages,
          temperature: profile.temperature,
          max_tokens: profile.maxTokens,
          stream: true
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(profile.timeoutMs)])
      })
    } catch (error) {
      throw errorForFetchFailure(error, profile.timeoutMs, signal.aborted)
    }
    if (!response.ok) throw errorForStatus(response.status)

    const type = (response.headers.get('content-type') ?? '').toLowerCase()
    if (type.includes('application/json')) {
      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        if (signal.aborted) throw errorForFetchFailure(error, profile.timeoutMs, true)
        throw new AIRequestError('bad-response', '服务返回的内容无法解析')
      }
      const content = extractContent(body)
      if (content === null) throw new AIRequestError('bad-response', '服务返回的内容缺少回复文本')
      yield content
      return
    }
    if (!response.body) throw new AIRequestError('bad-response', '服务返回的内容缺少回复文本')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let yielded = false
    const take = (block: string): string | null => {
      const line = block.trim()
      if (!line.startsWith('data:')) return null
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return null
      let parsed: unknown
      try {
        parsed = JSON.parse(data)
      } catch {
        return null
      }
      const delta = (parsed as { choices?: Array<{ delta?: { content?: unknown } }> } | null)
        ?.choices?.[0]?.delta?.content
      return typeof delta === 'string' && delta ? delta : null
    }
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const delta = take(block)
          if (!delta) continue
          yielded = true
          yield delta
        }
      }
      const tail = take(buffer)
      if (tail) {
        yielded = true
        yield tail
      }
    } catch (error) {
      throw errorForFetchFailure(error, profile.timeoutMs, signal.aborted)
    }
    if (!yielded) throw new AIRequestError('bad-response', '服务返回的内容缺少回复文本')
  }
}
