import { describe, expect, it } from 'vitest'
import { parseAIReply } from '../electron/main/services/ai/reply-parser'
import { AI_REPLY_TEXT_MAX } from '../shared/chat'

describe('parseAIReply', () => {
  it('accepts the structured format', () => {
    expect(parseAIReply('{"text":"哼！","emotion":"angry","speech":true}')).toEqual({
      text: '哼！',
      emotion: 'angry',
      speech: true
    })
  })

  it('unwraps code fences, think blocks and surrounding prose', () => {
    expect(parseAIReply('```json\n{"text":"好","emotion":"happy","speech":false}\n```')).toEqual({
      text: '好',
      emotion: 'happy',
      speech: false
    })
    expect(
      parseAIReply('<think>嗯</think>好的，回复如下：{"text":"在呢","emotion":"curious"} 完毕')
    ).toEqual({ text: '在呢', emotion: 'curious', speech: false })
  })

  it('maps unknown emotions to idle instead of trusting the model', () => {
    for (const emotion of ['dragging', 'talking', 'rm -rf', 42]) {
      expect(parseAIReply(JSON.stringify({ text: 'x', emotion }))?.emotion).toBe('idle')
    }
  })

  it('falls back to plain text with idle when the output is not JSON', () => {
    expect(parseAIReply('  就是普通的一句话  ')).toEqual({
      text: '就是普通的一句话',
      emotion: 'idle',
      speech: false
    })
  })

  it('returns null when nothing is displayable', () => {
    expect(parseAIReply('')).toBeNull()
    expect(parseAIReply('   ')).toBeNull()
    expect(parseAIReply('{"emotion":"happy"}')).toBeNull()
    expect(parseAIReply('{"text":"   "}')).toBeNull()
    expect(parseAIReply('{"text": 123}')).toBeNull()
  })

  it('keeps text as plain text and truncates very long replies', () => {
    const html = '<img src=x onerror=alert(1)>'
    expect(parseAIReply(JSON.stringify({ text: html }))?.text).toBe(html)
    const long = parseAIReply(JSON.stringify({ text: 'a'.repeat(5000) }))
    expect(long?.text).toHaveLength(AI_REPLY_TEXT_MAX)
    expect(long?.text.endsWith('…')).toBe(true)
  })
})
