<script setup lang="ts">
import { Delete, Promotion, VideoPause } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import logoUrl from '../../logo.svg'
import { CHAT_INPUT_MAX, type ChatErrorKind } from '../../shared/chat'
import { PET_EMOTION_LABELS } from '../../shared/pet'
import { findProviderPreset, MOCK_PROVIDER_ID } from '../../shared/settings'
import { useChatStore } from '../app/stores/chat'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'

const router = useRouter()
const settings = useSettingsStore()
const chat = useChatStore()
const { messages, busy, lastError } = storeToRefs(chat)

const profile = computed(() => settings.activeAIProfile)
const description = computed(() => {
  const p = profile.value
  if (!p) return '尚未启用 AI 配置'
  if (p.providerId === MOCK_PROVIDER_ID) return `当前：${p.name}（模拟回复，不联网）`
  const provider = findProviderPreset(p.providerId)?.name ?? p.providerId
  const parts = [p.name, provider === p.name ? '' : provider, p.model || '未填写模型']
  return `当前：${parts.filter(Boolean).join(' · ')}`
})

/** Problems we can detect before sending. */
const setupProblem = computed(() => {
  const p = profile.value
  if (!p) return '还没有启用任何 AI 配置，桌宠暂时无法聊天。'
  if (!settings.isAIProfileReady(p) && !isLocal(p.baseUrl)) {
    return `“${p.name}”还没有设置 API Key。`
  }
  return ''
})

function isLocal(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

const CONFIG_ERRORS: ChatErrorKind[] = [
  'no-profile',
  'missing-key',
  'auth',
  'not-found',
  'invalid-url',
  'insecure-url',
  'invalid-input'
]
const errorNeedsConfig = computed(
  () => !!lastError.value && CONFIG_ERRORS.includes(lastError.value.kind)
)

const NOT_RECORDED: ChatErrorKind[] = ['no-profile', 'missing-key', 'invalid-input', 'busy']

const input = ref('')
const canSend = computed(() => !busy.value && !!input.value.trim())

async function send(): Promise<void> {
  if (!canSend.value) return
  const text = input.value
  input.value = ''
  await chat.send(text)
  // These are rejected before the message is recorded, so give the text back.
  const kind = chat.lastError?.kind
  if (kind && NOT_RECORDED.includes(kind) && !input.value) input.value = text
}

function onKeydown(event: Event | KeyboardEvent): void {
  if (!(event instanceof KeyboardEvent)) return
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

async function clearHistory(): Promise<void> {
  try {
    await ElMessageBox.confirm('将删除全部聊天记录（包括已保存到本机的记录）。', '清空聊天记录', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await chat.clear()
}

const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' })
const formatTime = (at: number): string => timeFormat.format(at)

const scroller = ref<HTMLElement | null>(null)
async function scrollToBottom(): Promise<void> {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
}
watch(() => [messages.value.length, busy.value, lastError.value], scrollToBottom)

onMounted(async () => {
  await chat.load()
  await scrollToBottom()
})
</script>

<template>
  <div class="page chat-page">
    <PageHeader title="聊天" :description="description">
      <el-button :icon="Delete" :disabled="messages.length === 0" @click="clearHistory">
        清空记录
      </el-button>
    </PageHeader>

    <el-alert v-if="setupProblem" type="warning" show-icon :closable="false">
      <template #title>
        {{ setupProblem }}
        <el-button link type="primary" @click="router.push('/ai')">前往 AI 配置</el-button>
      </template>
    </el-alert>

    <section ref="scroller" class="messages" aria-live="polite">
      <el-empty
        v-if="messages.length === 0 && !busy"
        :description="`和 ${settings.settings.persona.name} 说点什么吧`"
        :image-size="72"
      />

      <div v-for="m in messages" :key="m.id" class="row" :class="m.role">
        <img v-if="m.role === 'assistant'" class="avatar" :src="logoUrl" alt="" />
        <div class="bubble-wrap">
          <div class="bubble">{{ m.text }}</div>
          <div class="meta">
            <span>{{ formatTime(m.at) }}</span>
            <span v-if="m.emotion && m.emotion !== 'idle'"
              >· {{ PET_EMOTION_LABELS[m.emotion] }}</span
            >
            <span v-if="m.proactive">· 主动搭话</span>
          </div>
        </div>
      </div>

      <div v-if="busy" class="row assistant">
        <img class="avatar" :src="logoUrl" alt="" />
        <div class="bubble typing" aria-label="正在思考"><i /><i /><i /></div>
      </div>

      <el-alert
        v-if="lastError"
        class="error"
        type="error"
        show-icon
        :closable="false"
        :title="lastError.message"
      >
        <el-button v-if="errorNeedsConfig" link type="primary" @click="router.push('/ai')">
          前往 AI 配置
        </el-button>
      </el-alert>
    </section>

    <footer class="composer">
      <el-input
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 5 }"
        :maxlength="CHAT_INPUT_MAX"
        resize="none"
        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
        @keydown="onKeydown"
      />
      <el-button v-if="busy" :icon="VideoPause" @click="chat.cancel()">停止</el-button>
      <el-button v-else type="primary" :icon="Promotion" :disabled="!canSend" @click="send">
        发送
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.chat-page {
  height: 100%;
  box-sizing: border-box;
  padding-bottom: 20px;
}

.messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background: var(--mo-bg-card);
}

.messages .el-empty {
  margin: auto;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 78%;
}

.row.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.avatar {
  flex: none;
  width: 30px;
  height: 30px;
}

.bubble-wrap {
  min-width: 0;
}

.row.user .bubble-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.bubble {
  padding: 9px 13px;
  border-radius: 14px;
  background: var(--mo-bg-soft);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.row.assistant .bubble {
  border-top-left-radius: 4px;
}

.row.user .bubble {
  border-top-right-radius: 4px;
  background: var(--mo-accent);
  color: #fff;
}

.meta {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--mo-text-secondary);
}

.typing {
  display: flex;
  gap: 4px;
  padding: 14px 16px;
}

.typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mo-text-secondary);
  animation: blink 1.2s infinite ease-in-out;
}

.typing i:nth-child(2) {
  animation-delay: 0.2s;
}

.typing i:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}

.error {
  flex: none;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.composer .el-button {
  height: 40px;
}
</style>
