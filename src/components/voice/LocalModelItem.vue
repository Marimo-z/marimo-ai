<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref } from 'vue'
import { LOCAL_MODELS, type LocalModelId } from '../../../shared/voice'
import { useVoiceStore } from '../../app/stores/voice'

const props = defineProps<{ id: LocalModelId }>()

const voice = useVoiceStore()
const info = computed(() => LOCAL_MODELS[props.id])
const status = computed(() => voice.model(props.id))
const state = computed(() => {
  const s = status.value
  if (!s) return 'missing'
  return s.state === 'missing' && s.receivedBytes > 0 ? 'paused' : s.state
})
const busy = ref(false)

const percent = computed(() => {
  const s = status.value
  if (!s || s.totalBytes <= 0) return 0
  return Math.min(100, Math.floor((s.receivedBytes / s.totalBytes) * 100))
})
const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1)

const TAGS = {
  missing: { type: 'info', label: '未下载' },
  downloading: { type: 'primary', label: '下载中' },
  paused: { type: 'warning', label: '已暂停' },
  ready: { type: 'success', label: '已就绪' },
  error: { type: 'danger', label: '下载失败' }
} as const

async function importFolder(): Promise<void> {
  busy.value = true
  try {
    const result = await voice.importModel(props.id)
    if (result?.ok) ElMessage.success(`${info.value.name} 已导入`)
    else if (result) ElMessage.error(result.error)
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除后需要重新下载（约 ${info.value.downloadMb} MB）。`,
      '删除模型',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  busy.value = true
  try {
    const result = await voice.deleteModel(props.id)
    if (!result.ok) ElMessage.error(result.error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="model">
    <div class="head">
      <div class="title">
        <strong>{{ info.name }}</strong>
        <el-tag :type="TAGS[state].type" size="small" disable-transitions>
          {{ TAGS[state].label }}
        </el-tag>
      </div>
      <div class="actions">
        <template v-if="state === 'downloading'">
          <el-button size="small" @click="voice.cancelDownload(id)">暂停</el-button>
        </template>
        <template v-else>
          <el-button
            v-if="state !== 'ready'"
            type="primary"
            size="small"
            :disabled="busy"
            @click="voice.downloadModel(id)"
          >
            {{ state === 'error' ? '重试下载' : '下载' }}
          </el-button>
          <el-button size="small" :loading="busy" @click="importFolder">导入文件夹</el-button>
          <el-button v-if="state === 'ready'" size="small" :disabled="busy" @click="remove">
            删除
          </el-button>
        </template>
      </div>
    </div>
    <p class="desc">{{ info.description }} · 约 {{ info.downloadMb }} MB</p>
    <div v-if="state === 'downloading'" class="progress">
      <el-progress :percentage="percent" :stroke-width="6" />
      <span class="hint">
        {{
          status && status.totalBytes > 0
            ? `${mb(status.receivedBytes)} / ${mb(status.totalBytes)} MB`
            : '正在获取文件列表…'
        }}
      </span>
    </div>
    <p v-if="state === 'error' && status?.error" class="hint error">{{ status.error }}</p>
  </div>
</template>

<style scoped>
.model + .model {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--mo-border);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.actions {
  display: flex;
  gap: 6px;
}

.actions .el-button + .el-button {
  margin-left: 0;
}

.desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--mo-text-secondary);
}

.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.progress .el-progress {
  flex: 1;
}

.hint {
  font-size: 12.5px;
  color: var(--mo-text-secondary);
  white-space: nowrap;
}

p.hint {
  margin: 6px 0 0;
  white-space: normal;
}

.hint.error {
  color: var(--el-color-danger);
}
</style>
