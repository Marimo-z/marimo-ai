<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref } from 'vue'
import type { VoiceKeyKind } from '../../../shared/voice'
import { useVoiceStore } from '../../app/stores/voice'

const props = defineProps<{ kind: VoiceKeyKind }>()

const voice = useVoiceStore()
const input = ref('')
const saving = ref(false)
const hasKey = computed(() => voice.keyStatus[props.kind])
const encryption = computed(() => voice.keyStatus.encryptionAvailable)

async function save(): Promise<void> {
  if (!input.value.trim()) return
  saving.value = true
  try {
    const result = await voice.setKey(props.kind, input.value)
    if (!result.ok) return void ElMessage.error(result.error)
    input.value = ''
    ElMessage.success('API Key 已加密保存')
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后需要重新填写才能使用在线语音服务。', '删除 API Key', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await voice.deleteKey(props.kind)
  ElMessage.success('API Key 已删除')
}
</script>

<template>
  <div class="key-field">
    <form class="key-row" @submit.prevent="save">
      <el-input
        v-model="input"
        type="password"
        show-password
        autocomplete="off"
        :placeholder="hasKey ? '已保存，输入新密钥以替换' : '尚未设置'"
        :disabled="!encryption"
      />
      <el-button
        type="primary"
        native-type="submit"
        :disabled="!input.trim() || !encryption"
        :loading="saving"
      >
        {{ hasKey ? '替换' : '保存' }}
      </el-button>
      <el-button v-if="hasKey" type="danger" plain @click="remove">删除</el-button>
    </form>
    <p v-if="!encryption" class="hint">系统加密不可用，无法保存密钥。</p>
  </div>
</template>

<style scoped>
.key-field {
  width: 100%;
}

.key-row {
  display: flex;
  gap: 8px;
}

.key-row .el-button + .el-button {
  margin-left: 0;
}

.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
