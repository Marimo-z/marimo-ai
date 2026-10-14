import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatErrorKind, ChatMessage } from '../../../shared/chat'
import type { ChatSendOptions } from '../../../shared/ipc'
import { chatBridge as bridge } from '../settings/bridge'

export interface ChatError {
  kind: ChatErrorKind
  message: string
}

/** Mirror of the conversation owned by the main process. */
export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const busy = ref(false)
  const loaded = ref(false)
  /** Error of the last request, shown below the conversation until the next send. */
  const lastError = ref<ChatError | null>(null)

  async function load(): Promise<void> {
    if (loaded.value) return
    const state = await bridge.getState()
    messages.value = state.messages
    busy.value = state.busy
    bridge.onChanged((next) => {
      messages.value = next.messages
      busy.value = next.busy
    })
    loaded.value = true
  }

  async function send(text: string, options?: ChatSendOptions): Promise<boolean> {
    lastError.value = null
    const result = await bridge.send(text, options)
    if (!result.ok && result.kind !== 'cancelled') {
      lastError.value = { kind: result.kind, message: result.message }
    }
    return result.ok
  }

  function cancel(): Promise<void> {
    return bridge.cancel()
  }

  async function clear(): Promise<void> {
    lastError.value = null
    await bridge.clear()
  }

  return { messages, busy, loaded, lastError, load, send, cancel, clear }
})
