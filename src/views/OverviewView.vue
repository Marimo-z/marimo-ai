<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AppInfo } from '../../shared/ipc'
import { findProviderPreset } from '../../shared/settings'
import { ASR_PROVIDER_LABELS, TTS_PROVIDER_LABELS } from '../../shared/voice'
import { settingsBridge } from '../app/settings/bridge'
import { useChatStore } from '../app/stores/chat'
import { useSettingsStore } from '../app/stores/settings'
import { useVoiceStore } from '../app/stores/voice'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'
import PetPreview from '../components/pet/PetPreview.vue'

const store = useSettingsStore()
const voice = useVoiceStore()
const router = useRouter()
const s = computed(() => store.settings)
const preview = ref<InstanceType<typeof PetPreview> | null>(null)
const info = ref<AppInfo | null>(null)

const active = computed(() => store.activeAIProfile)
const providerName = computed(() =>
  active.value ? (findProviderPreset(active.value.providerId)?.name ?? '未知') : '-'
)

type TagType = 'success' | 'warning' | 'info' | 'danger'
const modelStatus = computed<{ type: TagType; text: string }>(() => {
  const profile = active.value
  if (!profile) return { type: 'warning', text: '未启用' }
  const test = store.lastTests[profile.id]
  if (test)
    return test.ok ? { type: 'success', text: '连接正常' } : { type: 'danger', text: '连接失败' }
  if (!store.isAIProfileReady(profile)) return { type: 'warning', text: '未设置密钥' }
  return { type: 'info', text: '未测试' }
})

const themeLabel = computed(
  () => ({ system: '跟随系统', light: '浅色', dark: '深色' })[s.value.appearance.theme]
)

async function sayHello(): Promise<void> {
  preview.value?.react('happy')
  await settingsBridge.previewSay(`你好呀，我是${s.value.persona.name}！`, 'happy')
}

async function testVoice(): Promise<void> {
  const result = await voice.testSpeak(`你好呀，我是${s.value.persona.name}，这是一段语音测试。`)
  if (!result.ok) ElMessage.error(result.error)
  else if (s.value.voice.ttsProvider === 'mock') {
    ElMessage.info('当前为模拟语音：桌宠会显示气泡，但不会发声')
  }
}

async function resetAll(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '桌宠、人设、语音、游戏和外观设置都会恢复为默认值。AI 配置列表及其 API Key 会保留，如需删除请在"AI 配置"页逐个操作。',
      '恢复默认配置',
      { type: 'warning', confirmButtonText: '恢复默认', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await store.resetAllExceptAI()
  ElMessage.success('已恢复默认配置')
}

const chat = useChatStore()
const recent = computed(() => chat.messages.slice(-4))

onMounted(async () => {
  void chat.load()
  info.value = await settingsBridge.getAppInfo()
})
</script>

<template>
  <div class="page">
    <PageHeader title="总览" description="桌宠状态与常用操作" />

    <section class="hero">
      <PetPreview ref="preview" :size="128" :idle-animation="s.pet.idleAnimation" />
      <div class="hero-body">
        <h2 class="hero-name">{{ s.persona.name }}</h2>
        <p class="hero-traits">
          <el-tag v-for="trait in s.persona.traits" :key="trait" size="small" effect="plain" round>
            {{ trait }}
          </el-tag>
        </p>
        <div class="hero-actions">
          <el-button type="primary" @click="router.push('/chat')">开始聊天</el-button>
          <el-button @click="sayHello">让桌宠打个招呼</el-button>
          <el-button @click="testVoice">测试语音</el-button>
          <el-button @click="router.push('/games')">游戏中心</el-button>
        </div>
      </div>
    </section>

    <div class="grid-3">
      <SettingsCard title="AI 模型">
        <dl class="facts">
          <dt>当前</dt>
          <dd :title="active?.name">{{ active?.name ?? '未启用任何配置' }}</dd>
          <dt>服务商</dt>
          <dd>{{ providerName }}</dd>
          <dt>模型</dt>
          <dd>{{ active ? active.model || '未填写' : '-' }}</dd>
          <dt>状态</dt>
          <dd>
            <el-tag :type="modelStatus.type" size="small">{{ modelStatus.text }}</el-tag>
          </dd>
        </dl>
        <el-button class="card-link" link type="primary" @click="router.push('/ai')">
          前往配置
        </el-button>
      </SettingsCard>

      <SettingsCard title="语音服务">
        <dl class="facts">
          <dt>识别</dt>
          <dd>{{ ASR_PROVIDER_LABELS[s.voice.asrProvider] }}</dd>
          <dt>合成</dt>
          <dd>{{ TTS_PROVIDER_LABELS[s.voice.ttsProvider] }}</dd>
          <dt>自动朗读</dt>
          <dd>{{ s.voice.autoSpeak ? '开启' : '关闭' }}</dd>
        </dl>
        <el-button class="card-link" link type="primary" @click="router.push('/voice')">
          前往配置
        </el-button>
      </SettingsCard>

      <SettingsCard title="桌宠">
        <dl class="facts">
          <dt>大小</dt>
          <dd>{{ Math.round(s.pet.scale * 100) }}%</dd>
          <dt>模式</dt>
          <dd>
            <el-tag v-if="s.pet.clickThrough" type="warning" size="small">鼠标穿透</el-tag>
            <el-tag v-else-if="s.pet.doNotDisturb" type="info" size="small">勿扰</el-tag>
            <el-tag v-else type="success" size="small">正常</el-tag>
          </dd>
          <dt>外观主题</dt>
          <dd>{{ themeLabel }}</dd>
        </dl>
        <el-button class="card-link" link type="primary" @click="router.push('/pet')">
          前往配置
        </el-button>
      </SettingsCard>
    </div>

    <div class="grid-2">
      <SettingsCard title="最近互动">
        <template #extra>
          <el-button link type="primary" @click="router.push('/chat')">全部</el-button>
        </template>
        <ul v-if="recent.length" class="recent">
          <li v-for="m in recent" :key="m.id">
            <span class="recent-who">{{ m.role === 'user' ? '我' : s.persona.name }}</span>
            <span class="recent-text" :title="m.text">{{ m.text }}</span>
          </li>
        </ul>
        <el-empty v-else description="还没有聊天记录" :image-size="64" />
      </SettingsCard>
      <SettingsCard title="最近战绩">
        <el-empty description="小游戏上线后会显示在这里" :image-size="64" />
      </SettingsCard>
    </div>

    <SettingsCard title="维护">
      <div class="maintenance">
        <p class="hint">
          版本 {{ info?.version ?? '-' }} · Electron {{ info?.electron ?? '-' }} · Chrome
          {{ info?.chrome ?? '-' }} · {{ info?.platform ?? '' }}
        </p>
        <el-button type="danger" plain @click="resetAll">恢复默认配置</el-button>
      </div>
    </SettingsCard>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 24px 28px;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background:
    radial-gradient(120% 140% at 0% 0%, var(--mo-accent-soft), transparent 60%), var(--mo-bg-card);
  box-shadow: var(--mo-shadow);
}

.hero-body {
  min-width: 0;
}

.hero-name {
  margin: 0;
  font-size: 22px;
}

.hero-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 16px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-actions .el-button + .el-button {
  margin-left: 0;
}

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 14px;
  margin: 0;
}

.facts dt {
  color: var(--mo-text-secondary);
}

.facts dd {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-link {
  margin-top: 14px;
}

.recent {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent li {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.recent-who {
  flex: none;
  color: var(--mo-text-secondary);
}

.recent-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.maintenance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
</style>
