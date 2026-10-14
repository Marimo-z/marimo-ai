import type { ConnectionTestResult } from '../../../../shared/ipc'
import type { PetEmotion } from '../../../../shared/pet'
import { AIRequestError } from './errors'
import type { AIProvider, ChatOptions, ProviderMessage } from './provider'

const RULES: Array<{ pattern: RegExp; text: string; emotion: PetEmotion }> = [
  { pattern: /你好|hi|hello|嗨/i, text: '你好呀！今天也要元气满满哦～', emotion: 'happy' },
  { pattern: /笨|傻|讨厌/, text: '哼，我才不笨呢！', emotion: 'angry' },
  { pattern: /累|难过|伤心|烦/, text: '辛苦啦，要不要休息一下？我陪着你。', emotion: 'sad' },
  { pattern: /[?？]|为什么|怎么/, text: '这个问题嘛……让我想想。（模拟回复）', emotion: 'thinking' }
]

/** Offline provider for development and demos: canned replies in the structured format. */
export class MockProvider implements AIProvider {
  constructor(private readonly delayMs = 700) {}

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, message: '模拟服务无需联网，始终可用', latencyMs: 0, modelAvailable: null }
  }

  async chat(messages: ProviderMessage[], { signal }: ChatOptions): Promise<string> {
    if (signal.aborted) throw new AIRequestError('cancelled', '已取消')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new AIRequestError('cancelled', '已取消'))
        },
        { once: true }
      )
    })
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const rule = RULES.find((r) => r.pattern.test(last))
    const reply = rule ?? {
      text: `我听到你说“${last.slice(0, 30)}”啦。（这是模拟回复，在 AI 配置中启用真实服务即可正常聊天）`,
      emotion: 'curious' as const
    }
    return JSON.stringify({ text: reply.text, emotion: reply.emotion, speech: true })
  }
}
