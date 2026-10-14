import { randomUUID } from 'node:crypto'
import {
  CHAT_HISTORY_MAX,
  CHAT_INPUT_MAX,
  type AIReply,
  type ChatErrorKind,
  type ChatMessage,
  type ChatSendResult,
  type ChatState
} from '../../../shared/chat'
import type { ChatSendOptions, PetCommand } from '../../../shared/ipc'
import {
  findProviderPreset,
  getActiveAIProfile,
  type AIProfile,
  type AppSettings
} from '../../../shared/settings'
import { isLocalUrl } from './ai/connection-test'
import { AIRequestError } from './ai/errors'
import { buildMessages, PROACTIVE_INSTRUCTION } from './ai/prompt'
import type { AIProvider } from './ai/provider'
import { parseAIReply } from './ai/reply-parser'
import type { ChatHistoryPersistence } from './chat-history'

export interface ChatServiceDeps {
  getSettings(): AppSettings
  getKey(profileId: string): string | null
  createProvider(profile: AIProfile, apiKey: string | null): AIProvider
  history: ChatHistoryPersistence
  /** Pushes the new state to the control panel. */
  onState(state: ChatState): void
  /** Drives the pet's bubble and expression. */
  onPet(command: PetCommand): void
  /** Shows a reply on the pet, optionally read aloud; defaults to a plain bubble. */
  presentReply?(reply: AIReply, readAloud: boolean): void
  now?(): number
}

type Failure = { ok: false; kind: ChatErrorKind; message: string }

const PET_ERROR_LINES: Partial<Record<ChatErrorKind, string>> = {
  'no-profile': '我还没有连上大脑……先去控制面板启用一个 AI 配置吧。',
  'missing-key': '我还缺一把钥匙（API Key），去控制面板帮我填一下吧。',
  auth: '钥匙好像不对，我进不去……检查一下 API Key 吧。',
  timeout: '想得太久，脑袋卡住了……再试一次？',
  network: '呜，连不上网络了……'
}

/** Owns the conversation: context, the single in-flight request, history and pet reactions. */
export class ChatService {
  private messages: ChatMessage[]
  private controller: AbortController | null = null
  private lastActivityAt: number

  constructor(private readonly deps: ChatServiceDeps) {
    const keep = deps.getSettings().persona.keepHistory
    this.messages = keep ? deps.history.load() : []
    this.lastActivityAt = this.now()
  }

  get busy(): boolean {
    return this.controller !== null
  }

  /** Time of the last message or request, used by the proactive scheduler. */
  get lastActivity(): number {
    return Math.max(this.lastActivityAt, this.messages.at(-1)?.at ?? 0)
  }

  state(): ChatState {
    return { messages: this.messages.map((m) => ({ ...m })), busy: this.busy }
  }

  async send(input: unknown, options?: unknown): Promise<ChatSendResult> {
    const fromVoice = (options as ChatSendOptions | undefined)?.fromVoice === true
    if (typeof input !== 'string' || !input.trim()) {
      return this.fail('invalid-input', '消息不能为空')
    }
    const text = input.trim()
    if (text.length > CHAT_INPUT_MAX) {
      return this.fail('invalid-input', `消息不能超过 ${CHAT_INPUT_MAX} 个字`)
    }
    if (this.busy) return this.fail('busy', '上一条消息还在回复中')

    const ready = this.resolveProvider()
    if (!ready.ok) {
      this.petSayError(ready.kind)
      return ready
    }

    this.append({ id: randomUUID(), role: 'user', text, at: this.now() })
    return this.request(ready.provider, undefined, false, fromVoice)
  }

  /** Asks the model for an unprompted line. Failures are silent apart from the return value. */
  async speakProactively(): Promise<ChatSendResult> {
    if (this.busy) return this.fail('busy', '正在回复中')
    const ready = this.resolveProvider()
    if (!ready.ok) return ready
    return this.request(ready.provider, PROACTIVE_INSTRUCTION, true, false)
  }

  cancel(): void {
    this.controller?.abort()
  }

  clear(): void {
    this.cancel()
    this.messages = []
    this.deps.history.clear()
    this.emit()
  }

  /** Called when the "keep history" setting changes. */
  setKeepHistory(keep: boolean): void {
    if (keep) this.deps.history.save(this.messages)
    else this.deps.history.clear()
  }

  private async request(
    provider: AIProvider,
    extraInstruction: string | undefined,
    proactive: boolean,
    fromVoice: boolean
  ): Promise<ChatSendResult> {
    const controller = new AbortController()
    this.controller = controller
    this.lastActivityAt = this.now()
    this.emit()
    if (!proactive) this.deps.onPet({ type: 'emotion', emotion: 'thinking', durationMs: 0 })

    try {
      const persona = this.deps.getSettings().persona
      const raw = await provider.chat(buildMessages(persona, this.messages, extraInstruction), {
        signal: controller.signal
      })
      const reply = parseAIReply(raw)
      if (!reply) throw new AIRequestError('bad-response', '模型没有返回可显示的内容')

      const message: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        text: reply.text,
        emotion: reply.emotion,
        at: this.now(),
        ...(proactive ? { proactive: true } : {})
      }
      this.append(message)
      const readAloud = reply.speech && (fromVoice || this.deps.getSettings().voice.autoSpeak)
      if (this.deps.presentReply) this.deps.presentReply(reply, readAloud)
      else this.deps.onPet({ type: 'say', text: reply.text, emotion: reply.emotion })
      return { ok: true, reply: message }
    } catch (error) {
      const failure =
        error instanceof AIRequestError
          ? this.fail(error.kind, error.message)
          : this.fail('unknown', '请求失败，请稍后再试')
      if (failure.kind === 'cancelled') {
        this.deps.onPet({ type: 'emotion', emotion: 'idle' })
      } else if (!proactive) {
        this.petSayError(failure.kind)
      }
      if (!(error instanceof AIRequestError)) console.error('[chat] unexpected error', error)
      return failure
    } finally {
      this.controller = null
      this.lastActivityAt = this.now()
      this.emit()
    }
  }

  private resolveProvider(): { ok: true; provider: AIProvider } | Failure {
    const profile = getActiveAIProfile(this.deps.getSettings().ai)
    if (!profile) {
      return this.fail('no-profile', '尚未启用 AI 配置，请在控制面板的“AI 配置”中启用一个')
    }
    const key = this.deps.getKey(profile.id)
    const keyOptional =
      findProviderPreset(profile.providerId)?.keyOptional === true || isLocalUrl(profile.baseUrl)
    if (!key && !keyOptional) {
      return this.fail('missing-key', `“${profile.name}”尚未设置 API Key，请在“AI 配置”中填写`)
    }
    return { ok: true, provider: this.deps.createProvider(profile, key) }
  }

  private petSayError(kind: ChatErrorKind): void {
    this.deps.onPet({
      type: 'say',
      text: PET_ERROR_LINES[kind] ?? '出了点问题，我没能回答你……',
      emotion: 'sad'
    })
  }

  private append(message: ChatMessage): void {
    this.messages = [...this.messages, message].slice(-CHAT_HISTORY_MAX)
    if (this.deps.getSettings().persona.keepHistory) this.deps.history.save(this.messages)
    this.emit()
  }

  private emit(): void {
    this.deps.onState(this.state())
  }

  private fail(kind: ChatErrorKind, message: string): Failure {
    return { ok: false, kind, message }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}
