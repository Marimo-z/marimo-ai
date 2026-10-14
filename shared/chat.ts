import type { ConnectionErrorKind } from './ipc'
import type { PetEmotion } from './pet'

export const CHAT_INPUT_MAX = 1000
export const AI_REPLY_TEXT_MAX = 1000
/** Messages kept in memory and on disk. */
export const CHAT_HISTORY_MAX = 200

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  /** Only for assistant messages. */
  emotion?: PetEmotion
  at: number
  /** Assistant message the pet started on its own. */
  proactive?: boolean
}

/** Validated, structured model reply. */
export interface AIReply {
  text: string
  emotion: PetEmotion
  speech: boolean
}

export type ChatErrorKind =
  ConnectionErrorKind | 'no-profile' | 'busy' | 'cancelled' | 'bad-response' | 'invalid-input'

export interface ChatState {
  messages: ChatMessage[]
  busy: boolean
}

export type ChatSendResult =
  { ok: true; reply: ChatMessage } | { ok: false; kind: ChatErrorKind; message: string }
