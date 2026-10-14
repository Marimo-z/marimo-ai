import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  AI_REPLY_TEXT_MAX,
  CHAT_HISTORY_MAX,
  CHAT_INPUT_MAX,
  type ChatMessage
} from '../../../shared/chat'
import { PET_EMOTIONS } from '../../../shared/pet'

const messageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(Math.max(CHAT_INPUT_MAX, AI_REPLY_TEXT_MAX)),
  emotion: z.enum(PET_EMOTIONS).optional(),
  at: z.number().int().nonnegative(),
  proactive: z.boolean().optional()
})

export interface ChatHistoryPersistence {
  load(): ChatMessage[]
  save(messages: ChatMessage[]): void
  clear(): void
}

/** Plain-text chat log (no secrets). Invalid entries are skipped instead of discarding the file. */
export class ChatHistoryStore implements ChatHistoryPersistence {
  constructor(private readonly filePath: string) {}

  load(): ChatMessage[] {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8').replace(/^\uFEFF/, ''))
    } catch {
      return []
    }
    const list = (raw as { messages?: unknown } | null)?.messages
    if (!Array.isArray(list)) return []
    return list
      .map((item) => messageSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data as ChatMessage)
      .slice(-CHAT_HISTORY_MAX)
  }

  save(messages: ChatMessage[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(
      tmp,
      JSON.stringify({ version: 1, messages: messages.slice(-CHAT_HISTORY_MAX) }),
      'utf-8'
    )
    renameSync(tmp, this.filePath)
  }

  clear(): void {
    rmSync(this.filePath, { force: true })
  }
}
