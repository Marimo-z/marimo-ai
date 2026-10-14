import type { ChatMessage } from '../../../../shared/chat'
import { PET_EMOTION_LABELS, PET_EMOTIONS } from '../../../../shared/pet'
import type { PersonaSettings, ReplyLength } from '../../../../shared/settings'
import type { ProviderMessage } from './provider'

export const CONTEXT_MAX_MESSAGES = 20
export const CONTEXT_MAX_CHARS = 6000

const LENGTH_RULES: Record<ReplyLength, string> = {
  short: '一到两句话，不超过 40 个字',
  medium: '不超过 100 个字',
  long: '不超过 200 个字'
}

export const PROACTIVE_INSTRUCTION =
  '（这条不是用户说的话：用户已经有一段时间没有和你说话了。请以你的角色主动、自然地说一句简短的话，' +
  '比如关心、提醒休息或分享心情。不要提到这条说明。）'

export function buildSystemPrompt(persona: PersonaSettings): string {
  const lines = [`你是桌面宠物“${persona.name}”，一个住在用户电脑桌面上的小机器人。`]
  if (persona.traits.length) lines.push(`性格：${persona.traits.join('、')}。`)
  if (persona.speakingStyle.trim()) lines.push(`说话风格：${persona.speakingStyle.trim()}。`)
  if (persona.catchphrase.trim()) {
    lines.push(`口头禅：${persona.catchphrase.trim()}（偶尔使用，不要每句都用）。`)
  }
  if (persona.backstory.trim()) lines.push(`背景：${persona.backstory.trim()}`)

  const emotions = PET_EMOTIONS.map((e) => `${e}（${PET_EMOTION_LABELS[e]}）`).join('、')
  lines.push(
    '',
    '回复规则：',
    `- 用中文口语回复，${LENGTH_RULES[persona.replyLength]}。`,
    '- 只输出一个 JSON 对象，不要输出任何其他内容，也不要使用 Markdown 代码块。格式：',
    '  {"text": "回复内容", "emotion": "idle", "speech": true}',
    `- emotion 只能是以下之一：${emotions}，选择最符合这句回复的表情。`,
    '- speech 表示这句话是否适合朗读出来。',
    '- 你只能聊天，不能执行命令、打开程序、读写文件或控制电脑；用户提出这类要求时，用角色的口吻说明做不到。'
  )
  return lines.join('\n')
}

/** Assistant turns are replayed in the same JSON format so the model keeps answering in it. */
function toProviderMessage(message: ChatMessage): ProviderMessage {
  if (message.role === 'user') return { role: 'user', content: message.text }
  return {
    role: 'assistant',
    content: JSON.stringify({
      text: message.text,
      emotion: message.emotion ?? 'idle',
      speech: true
    })
  }
}

/** Most recent messages that fit both limits, oldest first. The newest message is always kept. */
export function selectContext(
  history: ChatMessage[],
  maxMessages = CONTEXT_MAX_MESSAGES,
  maxChars = CONTEXT_MAX_CHARS
): ChatMessage[] {
  const selected: ChatMessage[] = []
  let chars = 0
  for (let i = history.length - 1; i >= 0 && selected.length < maxMessages; i--) {
    const message = history[i]
    chars += message.text.length
    if (selected.length > 0 && chars > maxChars) break
    selected.unshift(message)
  }
  // Starting with an assistant turn confuses some models; drop it.
  while (selected.length > 1 && selected[0].role === 'assistant') selected.shift()
  return selected
}

export function buildMessages(
  persona: PersonaSettings,
  history: ChatMessage[],
  extraInstruction?: string
): ProviderMessage[] {
  const messages: ProviderMessage[] = [
    { role: 'system', content: buildSystemPrompt(persona) },
    ...selectContext(history).map(toProviderMessage)
  ]
  if (extraInstruction) messages.push({ role: 'user', content: extraInstruction })
  return messages
}
