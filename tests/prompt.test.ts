import { describe, expect, it } from 'vitest'
import {
  buildMessages,
  buildSystemPrompt,
  PROACTIVE_INSTRUCTION,
  selectContext
} from '../electron/main/services/ai/prompt'
import type { ChatMessage } from '../shared/chat'
import { DEFAULT_SETTINGS } from '../shared/settings'

const persona = DEFAULT_SETTINGS.persona

function msg(i: number, role: ChatMessage['role'], text = `m${i}`): ChatMessage {
  return { id: String(i), role, text, at: i, ...(role === 'assistant' ? { emotion: 'happy' } : {}) }
}

describe('buildSystemPrompt', () => {
  it('includes the persona, the JSON format and the allowed emotions', () => {
    const prompt = buildSystemPrompt({ ...persona, name: '小蓝', replyLength: 'long' })
    expect(prompt).toContain('小蓝')
    expect(prompt).toContain(persona.traits[0])
    expect(prompt).toContain('"emotion"')
    expect(prompt).toContain('angry')
    expect(prompt).toContain('200')
    expect(prompt).toContain('不能执行命令')
  })

  it('omits empty persona fields', () => {
    const prompt = buildSystemPrompt({ ...persona, traits: [], catchphrase: '', backstory: '' })
    expect(prompt).not.toContain('性格：')
    expect(prompt).not.toContain('口头禅')
    expect(prompt).not.toContain('背景：')
  })
})

describe('selectContext', () => {
  it('keeps the most recent messages within the count limit', () => {
    const history = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 ? 'assistant' : 'user'))
    const selected = selectContext(history, 10)
    expect(selected.at(-1)?.id).toBe('29')
    expect(selected.length).toBeLessThanOrEqual(10)
    expect(selected[0].role).toBe('user')
  })

  it('respects the character budget but always keeps the newest message', () => {
    const history = [
      msg(1, 'user', 'a'.repeat(50)),
      msg(2, 'assistant', 'b'.repeat(50)),
      msg(3, 'user', 'c'.repeat(80))
    ]
    expect(selectContext(history, 20, 100).map((m) => m.id)).toEqual(['3'])
    expect(selectContext([msg(1, 'user', 'x'.repeat(9999))], 20, 100)).toHaveLength(1)
  })
})

describe('buildMessages', () => {
  it('replays assistant turns as JSON and appends the extra instruction', () => {
    const messages = buildMessages(
      persona,
      [msg(1, 'user', '你好'), msg(2, 'assistant', '嗨')],
      PROACTIVE_INSTRUCTION
    )
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(JSON.parse(messages[2].content)).toEqual({ text: '嗨', emotion: 'happy', speech: true })
    expect(messages[3].content).toBe(PROACTIVE_INSTRUCTION)
  })
})
