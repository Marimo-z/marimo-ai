<script setup lang="ts">
import { Microphone, Mute, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { VoiceSettings } from '../../shared/settings'
import {
  ASR_PROVIDER_LABELS,
  ASR_PROVIDERS,
  ASR_SERVICE_PRESETS,
  TTS_PROVIDER_LABELS,
  TTS_PROVIDERS,
  TTS_SERVICE_PRESETS
} from '../../shared/voice'
import { useSettingsStore } from '../app/stores/settings'
import { useVoiceStore } from '../app/stores/voice'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'
import VoiceKeyField from '../components/voice/VoiceKeyField.vue'
import { useVoiceInput } from '../composables/useVoiceInput'
import { MicrophoneRecorder, RecognitionError } from '../services/speech-recognition'
import { pickSystemVoice } from '../utils/voice-select'

const store = useSettingsStore()
const voiceStore = useVoiceStore()
const voice = computed(() => store.settings.voice)
const set = (patch: Partial<VoiceSettings>): Promise<boolean> => store.update('voice', patch)

/** Text fields are edited locally and saved on blur / Enter. */
type TextField = 'ttsBaseUrl' | 'ttsModel' | 'ttsVoice' | 'asrBaseUrl' | 'asrModel'
const TEXT_FIELDS: TextField[] = ['ttsBaseUrl', 'ttsModel', 'ttsVoice', 'asrBaseUrl', 'asrModel']
const text = reactive({} as Record<TextField, string>)
watch(voice, (v) => TEXT_FIELDS.forEach((field) => (text[field] = v[field])), { immediate: true })
async function commit(field: TextField): Promise<void> {
  const value = text[field].trim()
  if (value !== voice.value[field]) await set({ [field]: value })
}

function applyTTSPreset(id: string): void {
  const preset = TTS_SERVICE_PRESETS.find((p) => p.id === id)
  if (preset)
    void set({ ttsBaseUrl: preset.baseUrl, ttsModel: preset.model, ttsVoice: preset.voice })
}
function applyASRPreset(id: string): void {
  const preset = ASR_SERVICE_PRESETS.find((p) => p.id === id)
  if (preset) void set({ asrBaseUrl: preset.baseUrl, asrModel: preset.model })
}

// --- System voices (the panel sees the same Windows voices as the pet window) ---
/** Element Plus treats '' as "nothing selected", so the automatic choice needs its own value. */
const AUTO_VOICE = '__auto__'
const systemVoices = ref<SpeechSynthesisVoice[]>([])
const loadVoices = (): void => {
  systemVoices.value = typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices()
}
const autoVoice = computed(() => pickSystemVoice(systemVoices.value, ''))
const hasChineseVoice = computed(() => autoVoice.value !== null)
const missingVoice = computed(
  () =>
    !!voice.value.systemVoice &&
    systemVoices.value.length > 0 &&
    !systemVoices.value.some((v) => v.name === voice.value.systemVoice)
)

// --- Preview ---
const testText = ref('你好，我是你的桌面小伙伴！')
const testing = ref(false)
async function playTest(): Promise<void> {
  const value = testText.value.trim()
  if (!value) return
  testing.value = true
  try {
    const result = await voiceStore.testSpeak(value)
    if (!result.ok) ElMessage.error(result.error)
    else if (voice.value.ttsProvider === 'mock')
      ElMessage.info('模拟语音：桌宠只显示气泡，不会发声')
  } finally {
    testing.value = false
  }
}

// --- Microphone test: three seconds of level metering ---
const MIC_TEST_MS = 3000
const micTest = reactive({ running: false, level: 0, peak: 0, result: '' as string, ok: false })
const micRecorder = new MicrophoneRecorder()
async function testMicrophone(): Promise<void> {
  if (micTest.running || recognition.phase.value !== 'idle') return
  Object.assign(micTest, { running: true, level: 0, peak: 0, result: '', ok: false })
  try {
    await micRecorder.start({
      maxMs: MIC_TEST_MS,
      onLevel: (level) => {
        micTest.level = level
        micTest.peak = Math.max(micTest.peak, level)
      },
      onLimit: () => void finishMicTest()
    })
  } catch (error) {
    micTest.running = false
    micTest.result = error instanceof RecognitionError ? error.message : '无法打开麦克风。'
  }
}
async function finishMicTest(): Promise<void> {
  try {
    await micRecorder.stop()
    Object.assign(micTest, { ok: true, result: '麦克风工作正常，能听到你的声音。' })
  } catch (error) {
    micTest.result = error instanceof RecognitionError ? error.message : '录音失败。'
  } finally {
    micTest.running = false
    micTest.level = 0
  }
}

// --- Recognition test ---
const recognized = ref('')
const recognition = useVoiceInput((value) => (recognized.value = value))
function toggleRecognition(): void {
  if (recognition.phase.value === 'recording') void recognition.stop()
  else if (recognition.phase.value === 'idle') {
    recognized.value = ''
    void recognition.start()
  }
}

onMounted(() => {
  void voiceStore.load()
  loadVoices()
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.addEventListener('voiceschanged', loadVoices)
  }
})
onBeforeUnmount(() => {
  micRecorder.cancel()
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }
})
</script>

<template>
  <div class="page">
    <PageHeader title="语音设置" description="朗读 AI 回复，以及在聊天页用麦克风说话">
      <el-button @click="store.reset('voice')">恢复本页默认</el-button>
    </PageHeader>

    <SettingsCard title="语音合成（朗读）">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="服务类型">
          <el-radio-group
            :model-value="voice.ttsProvider"
            @change="(v) => set({ ttsProvider: v as VoiceSettings['ttsProvider'] })"
          >
            <el-radio-button v-for="id in TTS_PROVIDERS" :key="id" :value="id">
              {{ TTS_PROVIDER_LABELS[id] }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="voice.ttsProvider === 'system'">
          <el-form-item label="音色">
            <el-select
              :model-value="voice.systemVoice || AUTO_VOICE"
              filterable
              @change="(v: string) => set({ systemVoice: v === AUTO_VOICE ? '' : v })"
            >
              <el-option
                :label="`自动（优先中文）${autoVoice ? ` · ${autoVoice.name}` : ''}`"
                :value="AUTO_VOICE"
              />
              <el-option
                v-for="v in systemVoices"
                :key="v.voiceURI"
                :label="`${v.name}（${v.lang}）`"
                :value="v.name"
              />
            </el-select>
          </el-form-item>
          <el-alert
            v-if="systemVoices.length > 0 && !hasChineseVoice"
            type="warning"
            show-icon
            :closable="false"
            title="没有找到中文语音。可以在 Windows 设置 → 时间和语言 → 语音 中添加中文语音包。"
          />
          <el-alert
            v-if="missingVoice"
            type="warning"
            show-icon
            :closable="false"
            title="所选音色已不在本机，朗读时会自动选择中文语音。"
          />
        </template>

        <template v-else-if="voice.ttsProvider === 'openai-compatible'">
          <el-alert
            type="info"
            show-icon
            :closable="false"
            title="调用 {Base URL}/audio/speech，按服务商标准计费。预设只是起点，模型和音色名称以服务商文档为准。"
          />
          <el-form-item label="快速填写">
            <el-select placeholder="选择服务商预设" @change="applyTTSPreset">
              <el-option
                v-for="p in TTS_SERVICE_PRESETS"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <div class="grid-3">
            <el-form-item label="API Base URL">
              <el-input
                v-model="text.ttsBaseUrl"
                placeholder="https://..."
                @change="commit('ttsBaseUrl')"
              />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="text.ttsModel" @change="commit('ttsModel')" />
            </el-form-item>
            <el-form-item label="音色">
              <el-input v-model="text.ttsVoice" @change="commit('ttsVoice')" />
            </el-form-item>
          </div>
          <el-form-item label="API Key（与 AI 配置的密钥分开保存）">
            <VoiceKeyField kind="tts" />
          </el-form-item>
        </template>

        <el-alert
          v-else
          type="info"
          show-icon
          :closable="false"
          title="模拟服务不发声，桌宠只显示气泡。"
        />

        <el-form-item label="自动朗读 AI 回复" class="switch-item">
          <el-switch
            :model-value="voice.autoSpeak"
            @change="(v) => set({ autoSpeak: v as boolean })"
          />
          <span class="hint">用语音输入发送的消息，回复总会朗读。免打扰模式下不朗读。</span>
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="声音参数">
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
            :disabled="voice.ttsProvider !== 'system'"
            @change="(v) => set({ pitch: v as number })"
          />
        </el-form-item>
        <p v-if="voice.ttsProvider !== 'system'" class="hint">音调只对 Windows 系统语音生效。</p>
      </el-form>
    </SettingsCard>

    <SettingsCard title="试听">
      <div class="row">
        <el-input v-model="testText" maxlength="100" placeholder="输入测试文本" />
        <el-button
          type="primary"
          :icon="VideoPlay"
          :loading="testing"
          :disabled="!testText.trim()"
          @click="playTest"
        >
          播放
        </el-button>
        <el-button :icon="Mute" :disabled="!voiceStore.active" @click="voiceStore.stop()">
          停止
        </el-button>
      </div>
      <p v-if="voiceStore.state.lastError" class="hint error">{{ voiceStore.state.lastError }}</p>
    </SettingsCard>

    <SettingsCard
      title="语音识别（语音输入）"
      description="只在你点击麦克风后录音；录音只发送给下面配置的识别服务，不保存到本机"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="服务类型">
          <el-radio-group
            :model-value="voice.asrProvider"
            @change="(v) => set({ asrProvider: v as VoiceSettings['asrProvider'] })"
          >
            <el-radio-button v-for="id in ASR_PROVIDERS" :key="id" :value="id">
              {{ ASR_PROVIDER_LABELS[id] }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="voice.asrProvider === 'openai-compatible'">
          <el-alert
            type="info"
            show-icon
            :closable="false"
            title="调用 {Base URL}/audio/transcriptions，上传 16 kHz 单声道 WAV，按服务商标准计费。"
          />
          <el-form-item label="快速填写">
            <el-select placeholder="选择服务商预设" @change="applyASRPreset">
              <el-option
                v-for="p in ASR_SERVICE_PRESETS"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <div class="grid-2">
            <el-form-item label="API Base URL">
              <el-input
                v-model="text.asrBaseUrl"
                placeholder="https://..."
                @change="commit('asrBaseUrl')"
              />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="text.asrModel" @change="commit('asrModel')" />
            </el-form-item>
          </div>
          <el-form-item label="API Key（与 AI 配置的密钥分开保存）">
            <VoiceKeyField kind="asr" />
          </el-form-item>
        </template>
        <el-alert
          v-else
          type="info"
          show-icon
          :closable="false"
          title="模拟服务仍会录音并检查音量，但不上传，总是返回一句固定的文本。"
        />

        <el-form-item label="设备测试">
          <div class="tests">
            <div class="row">
              <el-button
                :icon="Microphone"
                :loading="micTest.running"
                :disabled="recognition.phase.value !== 'idle'"
                @click="testMicrophone"
              >
                {{ micTest.running ? '请说话…' : '测试麦克风（3 秒）' }}
              </el-button>
              <span v-if="micTest.running" class="meter">
                <i :style="{ width: `${Math.round(micTest.level * 100)}%` }" />
              </span>
              <span v-else-if="micTest.result" :class="['hint', { error: !micTest.ok }]">
                {{ micTest.result }}
              </span>
            </div>
            <div class="row">
              <el-button
                :type="recognition.phase.value === 'recording' ? 'danger' : 'default'"
                :loading="recognition.phase.value === 'transcribing'"
                :disabled="micTest.running"
                @click="toggleRecognition"
              >
                {{ recognition.phase.value === 'recording' ? '结束并识别' : '测试识别' }}
              </el-button>
              <span v-if="recognition.phase.value === 'recording'" class="meter">
                <i :style="{ width: `${Math.round(recognition.level.value * 100)}%` }" />
              </span>
              <span v-else-if="recognition.error.value" class="hint error">
                {{ recognition.error.value }}
              </span>
              <span v-else-if="recognized" class="recognized">识别结果：{{ recognized }}</span>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </SettingsCard>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.row .el-button + .el-button {
  margin-left: 0;
}

.el-select {
  width: 100%;
}

.el-alert {
  margin-bottom: 14px;
}

.grid-3 {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 0 14px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.switch-item :deep(.el-form-item__content) {
  gap: 12px;
}

.hint {
  font-size: 12.5px;
  color: var(--mo-text-secondary);
}

p.hint {
  margin: 4px 0 0;
}

.hint.error {
  color: var(--el-color-danger);
}

.tests {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.meter {
  width: 160px;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--mo-bg-soft);
}

.meter i {
  display: block;
  height: 100%;
  background: var(--mo-accent);
  transition: width 100ms linear;
}

.recognized {
  font-size: 13px;
}
</style>
