<script setup lang="ts">
import { ref } from 'vue'
import { CHAT_INPUT_MAX } from '../../../shared/chat'

const props = defineProps<{
  busy: boolean
  /** Shown as the placeholder when a send fails. Never rendered as HTML. */
  hint: string
  onSend: (text: string) => Promise<boolean>
}>()

const draft = ref('')

async function onSubmit(): Promise<void> {
  const text = draft.value.trim()
  if (!text || props.busy) return
  const accepted = await props.onSend(text)
  if (accepted) draft.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void onSubmit()
}
</script>

<template>
  <form class="dock" data-interactive aria-label="对话框" @submit.prevent="onSubmit">
    <input
      v-model="draft"
      type="text"
      :maxlength="CHAT_INPUT_MAX"
      :placeholder="hint || '和我说点什么'"
      aria-label="对话内容"
      @keydown="onKeydown"
    />
    <button type="submit" :disabled="busy || !draft.trim()">发送</button>
  </form>
</template>

<style scoped>
.dock {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--pet-scale, 1));
  height: 100%;
  box-sizing: border-box;
  padding: calc(8px * var(--pet-scale, 1));
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: calc(16px * var(--pet-scale, 1));
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(18px) saturate(1.35);
  box-shadow: 0 8px 24px rgba(20, 30, 60, 0.16);
}

.dock input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #1c2744;
  font: inherit;
  font-size: calc(14px * var(--pet-scale, 1));
  user-select: text;
}

.dock input::placeholder {
  color: rgba(28, 39, 68, 0.55);
}

.dock button {
  flex: none;
  border: none;
  border-radius: calc(10px * var(--pet-scale, 1));
  padding: calc(6px * var(--pet-scale, 1)) calc(12px * var(--pet-scale, 1));
  background: rgba(79, 104, 176, 0.88);
  color: #fff;
  font: inherit;
  font-size: calc(13px * var(--pet-scale, 1));
  cursor: pointer;
}

.dock button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
