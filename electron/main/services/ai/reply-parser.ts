import { z } from 'zod'
import { AI_REPLY_TEXT_MAX, type AIReply } from '../../../../shared/chat'
import { PET_EMOTIONS } from '../../../../shared/pet'

const replySchema = z.object({
  text: z.string().trim().min(1),
  emotion: z.enum(PET_EMOTIONS).catch('idle'),
  speech: z.boolean().catch(false)
})

function truncate(text: string): string {
  return text.length > AI_REPLY_TEXT_MAX ? `${text.slice(0, AI_REPLY_TEXT_MAX - 1)}…` : text
}

function stripWrappers(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    .trim()
}

function tryParseJson(candidate: string): { parsed: true; value: unknown } | { parsed: false } {
  try {
    return { parsed: true, value: JSON.parse(candidate) }
  } catch {
    return { parsed: false }
  }
}

/**
 * Turns raw model output into a validated reply.
 * - Valid JSON `{text, emotion, speech}` (optionally wrapped in prose or a code fence) is used.
 * - Unknown emotions become `idle`; a missing `speech` becomes false.
 * - Output that is not JSON falls back to plain text with `idle`.
 * - Returns null when there is nothing displayable (empty output, or JSON without text).
 */
export function parseAIReply(raw: string): AIReply | null {
  const cleaned = stripWrappers(raw)
  if (!cleaned) return null

  const candidates = [cleaned]
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1))

  let sawJson = false
  for (const candidate of candidates) {
    const result = tryParseJson(candidate)
    if (!result.parsed) continue
    sawJson = true
    const reply = replySchema.safeParse(result.value)
    if (reply.success) return { ...reply.data, text: truncate(reply.data.text) }
  }
  if (sawJson) return null
  return { text: truncate(cleaned), emotion: 'idle', speech: false }
}
