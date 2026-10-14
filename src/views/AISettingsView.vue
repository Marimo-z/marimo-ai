<script setup lang="ts">
import { CopyDocument, Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'
import type { ConnectionTestResult } from '../../shared/ipc'
import {
  AI_PROFILE_NAME_MAX,
  AI_PROFILES_MAX,
  AI_PROVIDER_PRESETS,
  findProviderPreset,
  type AIProfile,
  type AIProviderId
} from '../../shared/settings'
import { settingsBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'
import { plainClone } from '../utils/plain-clone'

const store = useSettingsStore()
const profiles = computed(() => store.settings.ai.profiles)
const activeId = computed(() => store.settings.ai.activeProfileId)
const atLimit = computed(() => profiles.value.length >= AI_PROFILES_MAX)

const providerName = (id: AIProviderId): string => findProviderPreset(id)?.name ?? id

/* ---------- selection & draft ---------- */

const selectedId = ref<string | null>(activeId.value ?? profiles.value[0]?.id ?? null)
const saved = computed(() => profiles.value.find((p) => p.id === selectedId.value) ?? null)
const draft = ref<AIProfile | null>(saved.value ? plainClone(saved.value) : null)
const dirty = computed(
  () =>
    !!draft.value && !!saved.value && JSON.stringify(draft.value) !== JSON.stringify(saved.value)
)
const saving = ref(false)
/** Non-null view of the draft for the editor template, which only renders when a draft exists. */
const form = computed(() => draft.value as AIProfile)

let lastSaved = JSON.stringify(saved.value)
watch(saved, (next) => {
  const wasClean = JSON.stringify(draft.value) === lastSaved
  lastSaved = JSON.stringify(next)
  if (wasClean || draft.value?.id !== next?.id) draft.value = next ? plainClone(next) : null
})

// Keep a valid selection when the selected profile disappears (deleted here or elsewhere).
watch(profiles, (list) => {
  if (!list.some((p) => p.id === selectedId.value)) {
    selectedId.value = activeId.value ?? list[0]?.id ?? null
  }
})

async function confirmDiscard(): Promise<boolean> {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('当前配置有未保存的修改，切换后将丢失。', '放弃修改？', {
      type: 'warning',
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑'
    })
    return true
  } catch {
    return false
  }
}

async function select(id: string): Promise<void> {
  if (id === selectedId.value || !(await confirmDiscard())) return
  selectedId.value = id
}

function revert(): void {
  if (saved.value) draft.value = plainClone(saved.value)
}

/* ---------- list actions ---------- */

async function add(providerId: AIProviderId): Promise<void> {
  if (!(await confirmDiscard())) return
  revert()
  const profile = await store.addAIProfile(providerId)
  if (!profile) return
  selectedId.value = profile.id
  ElMessage.success(`已添加"${profile.name}"`)
}

async function duplicate(): Promise<void> {
  if (!saved.value || !(await confirmDiscard())) return
  revert()
  const copy = await store.duplicateAIProfile(saved.value.id)
  if (!copy) return
  selectedId.value = copy.id
  ElMessage.success('已复制，API Key 不会被复制，请为副本单独填写')
}

async function remove(): Promise<void> {
  const target = saved.value
  if (!target) return
  const isActive = target.id === activeId.value
  try {
    await ElMessageBox.confirm(
      `将删除"${target.name}"及其已保存的 API Key。${isActive ? '它是当前启用的配置，删除后 AI 将处于未启用状态。' : ''}`,
      '删除 AI 配置',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  if (await store.removeAIProfile(target.id)) ElMessage.success('已删除')
}

async function activate(id: string | null): Promise<void> {
  if (await store.activateAIProfile(id)) {
    const name = profiles.value.find((p) => p.id === id)?.name
    ElMessage.success(name ? `已启用"${name}"` : '已停用 AI')
  }
}

/* ---------- editor ---------- */

const preset = computed(() =>
  draft.value ? findProviderPreset(draft.value.providerId) : undefined
)
const keyOptional = computed(() => preset.value?.keyOptional === true)

const urlWarning = computed(() => {
  const raw = draft.value?.baseUrl.trim() ?? ''
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

const nameError = computed(() => (draft.value?.name.trim() ? '' : '请填写名称'))

const timeoutSeconds = computed({
  get: () => Math.round((draft.value?.timeoutMs ?? 0) / 1000),
  set: (value: number) => {
    if (draft.value) draft.value.timeoutMs = value * 1000
  }
})

function onProviderChange(id: AIProviderId): void {
  const next = findProviderPreset(id)
  if (!draft.value || !next || id === 'custom') return
  draft.value.baseUrl = next.baseUrl
  draft.value.model = next.model
}

async function save(): Promise<void> {
  if (!draft.value) return
  const problem = nameError.value || urlWarning.value
  if (problem) {
    ElMessage.warning(problem)
    return
  }
  saving.value = true
  try {
    if (await store.saveAIProfile(plainClone(draft.value))) ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

/* ---------- connection test ---------- */

const testing = ref(false)
const testResult = ref<ConnectionTestResult | null>(
  selectedId.value ? (store.lastTests[selectedId.value] ?? null) : null
)

async function runTest(): Promise<void> {
  if (!draft.value) return
  const id = draft.value.id
  testing.value = true
  try {
    const result = await settingsBridge.testAIConnection(plainClone(draft.value))
    if (selectedId.value === id) testResult.value = result
    if (!dirty.value) store.lastTests[id] = result
  } finally {
    testing.value = false
  }
}

/* ---------- API key ---------- */

const keyInput = ref('')
const savingKey = ref(false)
const selectedHasKey = computed(() => !!selectedId.value && store.hasKey(selectedId.value))

watch(selectedId, (id) => {
  testResult.value = id ? (store.lastTests[id] ?? null) : null
  keyInput.value = ''
})

const keyTag = computed(() => {
  if (!store.keyStatus.encryptionAvailable)
    return { type: 'danger', text: '系统加密不可用' } as const
  if (selectedHasKey.value) return { type: 'success', text: '已加密保存' } as const
  return keyOptional.value
    ? ({ type: 'info', text: '可不填' } as const)
    : ({ type: 'warning', text: '未设置' } as const)
})

async function saveKey(): Promise<void> {
  if (!selectedId.value) return
  savingKey.value = true
  try {
    if (await store.setAIKey(selectedId.value, keyInput.value)) {
      keyInput.value = ''
      testResult.value = null
      ElMessage.success('API Key 已加密保存')
    }
  } finally {
    savingKey.value = false
  }
}

async function deleteKey(): Promise<void> {
  if (!selectedId.value) return
  try {
    await ElMessageBox.confirm('删除后需要重新填写才能使用该配置。', '删除 API Key', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await store.deleteAIKey(selectedId.value)
  testResult.value = null
  ElMessage.success('API Key 已删除')
}

function itemStatus(profile: AIProfile): { type: 'success' | 'warning' | 'danger'; text: string } {
  const test = store.lastTests[profile.id]
  if (test && !test.ok) return { type: 'danger', text: '连接失败' }
  if (!store.isAIProfileReady(profile)) return { type: 'warning', text: '缺少密钥' }
  return { type: 'success', text: test?.ok ? '连接正常' : '可用' }
}
</script>

<template>
  <div class="page">
    <PageHeader
      title="AI 配置"
      description="可添加多个 OpenAI 兼容的模型服务，启用其中一个用于聊天"
    >
      <el-dropdown trigger="click" :disabled="atLimit" @command="add">
        <el-button type="primary" :icon="Plus" :disabled="atLimit">添加 AI</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="p in AI_PROVIDER_PRESETS" :key="p.id" :command="p.id">
              {{ p.name }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </PageHeader>

    <el-alert
      v-if="!activeId && profiles.length > 0"
      type="warning"
      show-icon
      :closable="false"
      title="当前没有启用任何 AI 配置，桌宠将无法聊天。请在列表中选择一个并启用。"
    />

    <div v-if="profiles.length === 0" class="empty-wrap">
      <SettingsCard title="还没有 AI 配置">
        <el-empty description="点击右上角“添加 AI”，选择一个服务商开始配置" :image-size="72" />
      </SettingsCard>
    </div>

    <div v-else class="layout">
      <!-- profile list -->
      <aside class="list">
        <div class="list-head">
          <span>AI 列表</span>
          <span class="hint">{{ profiles.length }} / {{ AI_PROFILES_MAX }}</span>
        </div>
        <div
          v-for="p in profiles"
          :key="p.id"
          class="item"
          :class="{ selected: p.id === selectedId, active: p.id === activeId }"
          role="button"
          tabindex="0"
          @click="select(p.id)"
          @keydown.enter="select(p.id)"
        >
          <el-radio
            :model-value="activeId ?? ''"
            :value="p.id"
            class="item-radio"
            :aria-label="`启用 ${p.name}`"
            @click.stop
            @change="activate(p.id)"
          />
          <div class="item-body">
            <div class="item-title">
              <span class="item-name" :title="p.name">{{ p.name }}</span>
              <el-tag v-if="p.id === activeId" size="small" effect="dark" round>启用中</el-tag>
            </div>
            <div class="item-meta" :title="`${providerName(p.providerId)} · ${p.model}`">
              {{ providerName(p.providerId) }} · {{ p.model || '未填写模型' }}
            </div>
            <div class="item-status" :class="`is-${itemStatus(p).type}`">
              {{ itemStatus(p).text }}
            </div>
          </div>
        </div>
        <p class="hint list-tip">点击圆点启用；点击条目编辑</p>
      </aside>

      <!-- editor -->
      <div v-if="draft" class="editor">
        <SettingsCard :title="saved?.name ?? draft.name">
          <template #extra>
            <div class="editor-actions">
              <el-button
                v-if="draft.id !== activeId"
                size="small"
                type="primary"
                plain
                @click="activate(draft.id)"
              >
                启用
              </el-button>
              <el-button v-else size="small" @click="activate(null)">停用</el-button>
              <el-tooltip content="复制配置（不含 API Key）" placement="top">
                <el-button
                  size="small"
                  :icon="CopyDocument"
                  :disabled="atLimit"
                  @click="duplicate"
                />
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" type="danger" plain :icon="Delete" @click="remove" />
              </el-tooltip>
            </div>
          </template>

          <el-form label-position="top" @submit.prevent>
            <div class="grid-2">
              <el-form-item label="名称" :error="nameError">
                <el-input
                  v-model="form.name"
                  :maxlength="AI_PROFILE_NAME_MAX"
                  placeholder="例如 DeepSeek 工作用"
                />
              </el-form-item>
              <el-form-item label="服务商">
                <el-select v-model="form.providerId" @change="onProviderChange">
                  <el-option
                    v-for="p in AI_PROVIDER_PRESETS"
                    :key="p.id"
                    :label="p.name"
                    :value="p.id"
                  />
                </el-select>
              </el-form-item>
            </div>
            <el-form-item label="API Base URL" :error="urlWarning">
              <el-input v-model="form.baseUrl" placeholder="https://..." clearable />
            </el-form-item>
            <el-form-item label="模型名称">
              <el-input
                v-model="form.model"
                placeholder="例如 deepseek-flash、qwen-plus"
                clearable
              />
            </el-form-item>
            <div class="grid-2">
              <el-form-item label="超时（秒）">
                <el-input-number v-model="timeoutSeconds" :min="3" :max="120" />
              </el-form-item>
              <el-form-item label="最大输出 Token">
                <el-input-number v-model="form.maxTokens" :min="16" :max="32768" :step="64" />
              </el-form-item>
            </div>
            <el-form-item :label="`Temperature：${form.temperature.toFixed(1)}`">
              <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" />
            </el-form-item>
          </el-form>

          <div class="footer">
            <el-button :loading="testing" @click="runTest">测试连接</el-button>
            <span class="hint footer-hint">含未保存的修改</span>
            <el-button :disabled="!dirty" @click="revert">撤销修改</el-button>
            <el-button type="primary" :disabled="!dirty" :loading="saving" @click="save">
              保存
            </el-button>
          </div>
          <el-alert
            v-if="testResult"
            class="test-result"
            :type="
              testResult.ok
                ? testResult.modelAvailable === false
                  ? 'warning'
                  : 'success'
                : 'error'
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

        <SettingsCard title="API Key" description="每个配置单独保存，只在主进程中解密使用">
          <template #extra>
            <el-tag :type="keyTag.type">{{ keyTag.text }}</el-tag>
          </template>
          <form class="key-row" @submit.prevent="saveKey">
            <el-input
              v-model="keyInput"
              type="password"
              show-password
              autocomplete="off"
              :placeholder="
                selectedHasKey
                  ? '输入新密钥以替换'
                  : keyOptional
                    ? '本地服务通常不需要密钥，可留空'
                    : 'sk-...'
              "
              :disabled="!store.keyStatus.encryptionAvailable"
            />
            <el-button
              type="primary"
              :disabled="!keyInput.trim() || !store.keyStatus.encryptionAvailable"
              :loading="savingKey"
              native-type="submit"
            >
              {{ selectedHasKey ? '替换' : '保存密钥' }}
            </el-button>
            <el-button v-if="selectedHasKey" type="danger" plain @click="deleteKey">删除</el-button>
          </form>
          <p class="hint security-note">
            密钥使用 Windows DPAPI（Electron
            safeStorage）加密后保存在本机用户目录，只会发送给该配置的服务地址。 以当前 Windows
            用户身份运行的恶意程序仍有可能解密它；请勿在不信任的电脑上保存密钥，并为密钥设置额度上限。
          </p>
        </SettingsCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.list {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 10px;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background: var(--mo-bg-card);
  box-shadow: var(--mo-shadow);
}

.list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 6px 6px;
  font-size: 15px;
  font-weight: 600;
}

.list-head .hint {
  margin: 0;
  font-weight: 400;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 10px 10px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

.item:hover {
  background: var(--mo-bg-soft);
}

.item.selected {
  border-color: var(--mo-accent);
  background: var(--mo-accent-soft);
}

.item:focus-visible {
  outline: 2px solid var(--mo-accent);
  outline-offset: 1px;
}

.item-radio {
  height: 20px;
  margin-right: 0;
}

.item-radio :deep(.el-radio__label) {
  display: none;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.item-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-title .el-tag {
  flex: none;
}

.item-meta {
  overflow: hidden;
  margin-top: 2px;
  font-size: 12px;
  color: var(--mo-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-status {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 12px;
}

.item-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.item-status.is-success {
  color: var(--el-color-success);
}

.item-status.is-warning {
  color: var(--el-color-warning);
}

.item-status.is-danger {
  color: var(--el-color-danger);
}

.list-tip {
  padding: 4px 6px 0;
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.editor-actions {
  display: flex;
  gap: 6px;
}

.editor-actions .el-button + .el-button {
  margin-left: 0;
}

.footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}

.footer .el-button + .el-button {
  margin-left: 0;
}

.footer-hint {
  flex: 1;
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
  margin-top: 12px;
}

.el-select,
.el-input-number {
  width: 100%;
}
</style>
