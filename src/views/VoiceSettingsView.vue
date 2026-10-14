<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import type { VoiceSettings } from '../../shared/settings'
import { settingsBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'

const store = useSettingsStore()
const voice = computed(() => store.settings.voice)
const set = (patch: Partial<VoiceSettings>): Promise<boolean> => store.update('voice', patch)

const MOCK_VOICES = [
  { id: 'mock-default', name: '默认（模拟）' },
  { id: 'mock-lively', name: '活泼（模拟）' },
  { id: 'mock-calm', name: '沉稳（模拟）' }
]

const testText = ref('你好，我是你的桌面小伙伴！')

async function playTest(): Promise<void> {
  const text = testText.value.trim()
  if (!text) return
  await settingsBridge.previewSay(text, 'happy')
  ElMessage.info('模拟语音：桌宠显示气泡，不会发声')
}
</script>

<template>
  <div class="page">
    <PageHeader
      title="语音设置"
      description="当前为模拟服务；真实的识别与合成服务在阶段 4 接入并评估费用"
    >
      <el-button @click="store.reset('voice')">恢复本页默认</el-button>
    </PageHeader>

    <div class="grid-2">
      <SettingsCard title="语音识别（ASR）">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="服务类型">
            <el-select :model-value="voice.asrProvider" disabled>
              <el-option label="模拟（Mock）" value="mock" />
            </el-select>
          </el-form-item>
          <el-form-item label="录音方式">
            <el-radio-group
              :model-value="voice.recordMode"
              @change="(v) => set({ recordMode: v as VoiceSettings['recordMode'] })"
            >
              <el-radio-button value="hold">按住说话</el-radio-button>
              <el-radio-button value="toggle">点击开始/停止</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="设备测试">
            <div class="row">
              <el-button disabled>测试麦克风（即将推出）</el-button>
              <el-button disabled>测试识别（即将推出）</el-button>
            </div>
          </el-form-item>
        </el-form>
      </SettingsCard>

      <SettingsCard title="语音合成（TTS）">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="服务类型">
            <el-select :model-value="voice.ttsProvider" disabled>
              <el-option label="模拟（Mock）" value="mock" />
            </el-select>
          </el-form-item>
          <el-form-item label="音色">
            <el-select :model-value="voice.voiceId" @change="(v: string) => set({ voiceId: v })">
              <el-option v-for="v in MOCK_VOICES" :key="v.id" :label="v.name" :value="v.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="自动朗读 AI 回复">
            <el-switch
              :model-value="voice.autoSpeak"
              @change="(v) => set({ autoSpeak: v as boolean })"
            />
          </el-form-item>
        </el-form>
      </SettingsCard>
    </div>

    <SettingsCard title="声音参数" description="真实服务支持时生效">
      <el-form label-position="left" label-width="96px" @submit.prevent>
        <el-form-item :label="`语速 ${voice.rate.toFixed(1)}x`">
          <el-slider
            :model-value="voice.rate"
            :min="0.5"
            :max="2"
            :step="0.1"
            @change="(v) => set({ rate: v as number })"
          />
        </el-form-item>
        <el-form-item :label="`音量 ${Math.round(voice.volume * 100)}%`">
          <el-slider
            :model-value="voice.volume"
            :min="0"
            :max="1"
            :step="0.05"
            @change="(v) => set({ volume: v as number })"
          />
        </el-form-item>
        <el-form-item :label="`音调 ${voice.pitch.toFixed(1)}`">
          <el-slider
            :model-value="voice.pitch"
            :min="0.5"
            :max="2"
            :step="0.1"
            @change="(v) => set({ pitch: v as number })"
          />
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="试听">
      <div class="row">
        <el-input v-model="testText" maxlength="100" placeholder="输入测试文本" />
        <el-button type="primary" :disabled="!testText.trim()" @click="playTest">
          播放测试文本
        </el-button>
      </div>
    </SettingsCard>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.row .el-button + .el-button {
  margin-left: 0;
}

.el-select {
  width: 100%;
}
</style>
