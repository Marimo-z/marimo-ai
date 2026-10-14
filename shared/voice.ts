export const TTS_PROVIDERS = ['system', 'local', 'openai-compatible', 'mock'] as const
export type TTSProviderId = (typeof TTS_PROVIDERS)[number]
export const ASR_PROVIDERS = ['local', 'openai-compatible', 'mock'] as const
export type ASRProviderId = (typeof ASR_PROVIDERS)[number]

export const TTS_PROVIDER_LABELS: Record<TTSProviderId, string> = {
  system: 'Windows 系统语音',
  local: '本地模型 Kokoro',
  'openai-compatible': '在线（OpenAI 兼容）',
  mock: '模拟'
}

export const ASR_PROVIDER_LABELS: Record<ASRProviderId, string> = {
  local: '本地模型 SenseVoice',
  'openai-compatible': '在线（OpenAI 兼容）',
  mock: '模拟'
}

// --- Local models (sherpa-onnx), downloaded on demand into userData/models/<id> ---

export const LOCAL_MODEL_IDS = ['sensevoice', 'kokoro'] as const
export type LocalModelId = (typeof LOCAL_MODEL_IDS)[number]

export function isLocalModelId(value: unknown): value is LocalModelId {
  return typeof value === 'string' && (LOCAL_MODEL_IDS as readonly string[]).includes(value)
}

export interface LocalModelInfo {
  id: LocalModelId
  kind: 'asr' | 'tts'
  name: string
  description: string
  /** Hugging Face repository the files come from. */
  repo: string
  /** Approximate download size, for display. */
  downloadMb: number
}

export const LOCAL_MODELS: Record<LocalModelId, LocalModelInfo> = {
  sensevoice: {
    id: 'sensevoice',
    kind: 'asr',
    name: 'SenseVoice Small（int8）',
    description: '语音识别：中文、粤语、英语、日语、韩语，带标点',
    repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    downloadMb: 228
  },
  kokoro: {
    id: 'kokoro',
    kind: 'tts',
    name: 'Kokoro v1.1 中文（int8）',
    description: '语音合成：100 个中文音色，支持中英混读',
    repo: 'csukuangfj/kokoro-int8-multi-lang-v1_1',
    downloadMb: 185
  }
}

export const MODEL_SOURCES = ['hf-mirror', 'huggingface'] as const
export type ModelSource = (typeof MODEL_SOURCES)[number]
export const MODEL_SOURCE_LABELS: Record<ModelSource, string> = {
  'hf-mirror': 'hf-mirror.com（国内镜像）',
  huggingface: 'huggingface.co'
}

export type LocalModelState = 'missing' | 'downloading' | 'ready' | 'error'

export interface LocalModelStatus {
  id: LocalModelId
  state: LocalModelState
  receivedBytes: number
  totalBytes: number
  error: string | null
}

/** Kokoro v1.1-zh speaker names; the speaker id is the index (upstream order, sorted by name). */
export const KOKORO_VOICE_NAMES = [
  'af_maple',
  'af_sol',
  'bf_vale',
  'zf_001',
  'zf_002',
  'zf_003',
  'zf_004',
  'zf_005',
  'zf_006',
  'zf_007',
  'zf_008',
  'zf_017',
  'zf_018',
  'zf_019',
  'zf_021',
  'zf_022',
  'zf_023',
  'zf_024',
  'zf_026',
  'zf_027',
  'zf_028',
  'zf_032',
  'zf_036',
  'zf_038',
  'zf_039',
  'zf_040',
  'zf_042',
  'zf_043',
  'zf_044',
  'zf_046',
  'zf_047',
  'zf_048',
  'zf_049',
  'zf_051',
  'zf_059',
  'zf_060',
  'zf_067',
  'zf_070',
  'zf_071',
  'zf_072',
  'zf_073',
  'zf_074',
  'zf_075',
  'zf_076',
  'zf_077',
  'zf_078',
  'zf_079',
  'zf_083',
  'zf_084',
  'zf_085',
  'zf_086',
  'zf_087',
  'zf_088',
  'zf_090',
  'zf_092',
  'zf_093',
  'zf_094',
  'zf_099',
  'zm_009',
  'zm_010',
  'zm_011',
  'zm_012',
  'zm_013',
  'zm_014',
  'zm_015',
  'zm_016',
  'zm_020',
  'zm_025',
  'zm_029',
  'zm_030',
  'zm_031',
  'zm_033',
  'zm_034',
  'zm_035',
  'zm_037',
  'zm_041',
  'zm_045',
  'zm_050',
  'zm_052',
  'zm_053',
  'zm_054',
  'zm_055',
  'zm_056',
  'zm_057',
  'zm_058',
  'zm_061',
  'zm_062',
  'zm_063',
  'zm_064',
  'zm_065',
  'zm_066',
  'zm_068',
  'zm_069',
  'zm_080',
  'zm_081',
  'zm_082',
  'zm_089',
  'zm_091',
  'zm_095',
  'zm_096',
  'zm_097',
  'zm_098',
  'zm_100'
] as const

export const KOKORO_SPEAKER_MAX = KOKORO_VOICE_NAMES.length - 1
export const KOKORO_DEFAULT_SPEAKER = KOKORO_VOICE_NAMES.indexOf('zf_001')

export interface LocalVoiceOption {
  sid: number
  label: string
  group: '女声' | '男声'
}

/** The Chinese voices, labelled like "女声 001". */
export const KOKORO_CHINESE_VOICES: LocalVoiceOption[] = KOKORO_VOICE_NAMES.flatMap(
  (name, sid): LocalVoiceOption[] => {
    const match = /^z([fm])_(\d+)$/.exec(name)
    if (!match) return []
    const group = match[1] === 'f' ? '女声' : '男声'
    return [{ sid, label: `${group} ${match[2]}`, group }]
  }
)

export interface TTSServicePreset {
  id: string
  name: string
  baseUrl: string
  model: string
  voice: string
}

export interface ASRServicePreset {
  id: string
  name: string
  baseUrl: string
  model: string
}

/** Starting points only; model and voice names follow each provider's documentation. */
export const TTS_SERVICE_PRESETS: readonly TTSServicePreset[] = [
  {
    id: 'siliconflow',
    name: '硅基流动 CosyVoice',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    voice: 'FunAudioLLM/CosyVoice2-0.5B:anna'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy'
  }
]

export const ASR_SERVICE_PRESETS: readonly ASRServicePreset[] = [
  {
    id: 'siliconflow',
    name: '硅基流动 SenseVoice',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/SenseVoiceSmall'
  },
  {
    id: 'openai',
    name: 'OpenAI Whisper',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1'
  },
  {
    id: 'groq',
    name: 'Groq Whisper',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'whisper-large-v3-turbo'
  }
]

export const VOICE_KEY_KINDS = ['tts', 'asr'] as const
export type VoiceKeyKind = (typeof VOICE_KEY_KINDS)[number]

export function isVoiceKeyKind(value: unknown): value is VoiceKeyKind {
  return typeof value === 'string' && (VOICE_KEY_KINDS as readonly string[]).includes(value)
}

export interface VoiceKeyStatus {
  tts: boolean
  asr: boolean
  encryptionAvailable: boolean
}

export type VoiceStatus = 'idle' | 'synthesizing' | 'speaking'

export interface VoiceState {
  status: VoiceStatus
  /** Last synthesis or playback failure, cleared by the next successful start. */
  lastError: string | null
}

/** How the pet window should voice a line. `id` ties playback reports to the request. */
export type PetVoice =
  | { engine: 'system'; id: number; voiceName: string; rate: number; pitch: number; volume: number }
  | { engine: 'audio'; id: number; data: Uint8Array; mime: string; volume: number }

export type SpeechOutcome = 'ended' | 'error'

export const TTS_TEXT_MAX = 1000
export const RECORDING_MAX_MS = 60_000
export const RECORDING_MIN_MS = 400
export const ASR_SAMPLE_RATE = 16_000
/** 60 s of 16 kHz mono 16-bit PCM is about 1.9 MB. */
export const ASR_AUDIO_MAX_BYTES = 4 * 1024 * 1024
