<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref } from 'vue'
import type { ConnectionTestResult } from '../../shared/ipc'
import { AI_PROVIDER_PRESETS, findProviderPreset, type AIProviderId } from '../../shared/settings'
import { settingsBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'
import { useSectionDraft } from '../composables/useSectionDraft'
import { plainClone } from '../utils/plain-clone'

const store = useSettingsStore()
const { draft, dirty, saving, save, revert } = useSectionDraft('ai')

const preset = computed(() => findProviderPreset(draft.value.providerId))
const keyOptional = computed(() => preset.value?.keyOptional === true)

const urlWarning = computed(() => {
  const raw = draft.value.baseUrl.trim()
  if (!raw) return '请填写 API Base URL'
  try {
    const url = new URL(raw)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return ''
    return '仅允许 HTTPS 地址（本机 localhost 服务除外）'
  } catch {
    return 'URL 格式不正确'
  }
})

const timeoutSeconds = computed({
  get: () => Math.round(draft.value.timeoutMs / 1000),
  set: (value: number) => (draft.value.timeoutMs = value * 1000)
})

function onProviderChange(id: AIProviderId): void {
  const next = findProviderPreset(id)
  if (!next || id === 'custom') return
  draft.value.baseUrl = next.baseUrl
  draft.value.model = next.model
}

async function onSave(): Promise<void> {
  if (urlWarning.value) {
    ElMessage.warning(urlWarning.value)
    return
  }
  if (await save()) ElMessage.success('AI 配置已保存')
}

const testing = ref(false)
const testResult = ref<ConnectionTestResult | null>(null)

async function runTest(): Promise<void> {
  testing.value = true
  try {
    const result = await settingsBridge.testAIConnection(plainClone(draft.value))
    testResult.value = result
    if (!dirty.value) store.lastTest = result
  } finally {
    testing.value = false
  }
}

const keyInput = ref('')
const savingKey = ref(false)

const keyTag = computed(() => {
  if (!store.keyStatus.encryptionAvailable)
    return { type: 'danger', text: '系统加密不可用' } as const
  return store.keyStatus.hasKey
    ? ({ type: 'success', text: '已加密保存' } as const)
    : ({ type: 'info', text: '未设置' } as const)
})

async function saveKey(): Promise<void> {
  savingKey.value = true
  try {
    if (await store.setAIKey(keyInput.value)) {
      keyInput.value = ''
      ElMessage.success('API Key 已加密保存')
    }
  } finally {
    savingKey.value = false
  }
}

async function deleteKey(): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后需要重新填写才能使用在线模型。', '删除 API Key', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await store.deleteAIKey()
  testResult.value = null
  ElMessage.success('API Key 已删除')
}
</script>

<template>
  <div class="page">
    <PageHeader title="AI 配置" description="使用 OpenAI 兼容接口的模型服务">
      <el-button :disabled="!dirty" @click="revert">撤销修改</el-button>
      <el-button type="primary" :disabled="!dirty" :loading="saving" @click="onSave">
        保存
      </el-button>
    </PageHeader>

    <SettingsCard title="模型服务">
      <el-form label-position="top" @submit.prevent>
        <div class="grid-2">
          <el-form-item label="服务商">
            <el-select v-model="draft.providerId" @change="onProviderChange">
              <el-option
                v-for="p in AI_PROVIDER_PRESETS"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input v-model="draft.model" placeholder="例如 deepseek-chat、qwen-plus" clearable />
          </el-form-item>
        </div>
        <el-form-item label="API Base URL" :error="urlWarning">
          <el-input v-model="draft.baseUrl" placeholder="https://..." clearable />
        </el-form-item>
        <div class="grid-3">
          <el-form-item label="超时（秒）">
            <el-input-number v-model="timeoutSeconds" :min="3" :max="120" />
          </el-form-item>
          <el-form-item label="最大输出 Token">
            <el-input-number v-model="draft.maxTokens" :min="16" :max="32768" :step="64" />
          </el-form-item>
          <el-form-item :label="`Temperature：${draft.temperature.toFixed(1)}`">
            <el-slider v-model="draft.temperature" :min="0" :max="2" :step="0.1" />
          </el-form-item>
        </div>
      </el-form>

      <div class="test-row">
        <el-button :loading="testing" @click="runTest">测试连接</el-button>
        <span class="hint">使用当前表单中的配置（含未保存的修改）请求服务商的模型列表</span>
      </div>
      <el-alert
        v-if="testResult"
        class="test-result"
        :type="
          testResult.ok ? (testResult.modelAvailable === false ? 'warning' : 'success') : 'error'
        "
        :title="testResult.message"
        :description="
          [
            testResult.status ? `HTTP ${testResult.status}` : '',
            testResult.latencyMs !== undefined ? `耗时 ${testResult.latencyMs} ms` : ''
          ]
            .filter(Boolean)
            .join(' · ')
        "
        show-icon
        :closable="false"
      />
    </SettingsCard>

    <SettingsCard
      title="API Key"
      description="密钥只在主进程中解密使用，不会写入普通配置文件或日志"
    >
      <template #extra>
        <el-tag :type="keyTag.type">{{ keyTag.text }}</el-tag>
      </template>
      <el-form label-position="top" @submit.prevent="saveKey">
        <el-form-item :label="store.keyStatus.hasKey ? '替换密钥' : '填写密钥'">
          <div class="key-row">
            <el-input
              v-model="keyInput"
              type="password"
              show-password
              autocomplete="off"
              :placeholder="keyOptional ? '本地服务通常不需要密钥，可留空' : 'sk-...'"
              :disabled="!store.keyStatus.encryptionAvailable"
            />
            <el-button
              type="primary"
              :disabled="!keyInput.trim() || !store.keyStatus.encryptionAvailable"
              :loading="savingKey"
              native-type="submit"
            >
              保存密钥
            </el-button>
            <el-button v-if="store.keyStatus.hasKey" type="danger" plain @click="deleteKey">
              删除
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon>
        <template #title>安全说明</template>
        <p class="security-note">
          密钥使用 Windows DPAPI（Electron
          safeStorage）加密后保存在本机用户目录，只会发送给上方配置的服务商。 以当前 Windows
          用户身份运行的恶意程序仍有可能解密它，桌面应用也可能被逆向分析；请勿在不信任的电脑上保存密钥，并为密钥设置额度上限。
        </p>
      </el-alert>
    </SettingsCard>
  </div>
</template>

<style scoped>
.test-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.test-row .hint {
  margin: 0;
}

.test-result {
  margin-top: 12px;
}

.key-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.key-row .el-button + .el-button {
  margin-left: 0;
}

.security-note {
  margin: 4px 0 0;
  line-height: 1.6;
}

.el-select,
.el-input-number {
  width: 100%;
}
</style>
