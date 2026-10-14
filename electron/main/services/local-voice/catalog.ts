import { LOCAL_MODELS, type LocalModelId, type ModelSource } from '../../../../shared/voice'

export interface ModelSpec {
  /** Hugging Face repository the files come from (mirrors of the sherpa-onnx releases). */
  repo: string
  /** Which repository files to download. */
  include(path: string): boolean
  /** Files that must exist for the model to load; also used to validate imported folders. */
  required: string[]
}

const KOKORO_ROOT_FILES = new Set([
  'model.int8.onnx',
  'voices.bin',
  'tokens.txt',
  'lexicon-us-en.txt',
  'lexicon-zh.txt',
  'date-zh.fst',
  'number-zh.fst',
  'phone-zh.fst'
])

export const MODEL_SPECS: Record<LocalModelId, ModelSpec> = {
  sensevoice: {
    repo: LOCAL_MODELS.sensevoice.repo,
    include: (path) => path === 'model.int8.onnx' || path === 'tokens.txt',
    required: ['model.int8.onnx', 'tokens.txt']
  },
  kokoro: {
    repo: LOCAL_MODELS.kokoro.repo,
    include: (path) => KOKORO_ROOT_FILES.has(path) || path.startsWith('espeak-ng-data/'),
    required: [...KOKORO_ROOT_FILES, 'espeak-ng-data/phontab']
  }
}

export const MODEL_HOSTS: Record<ModelSource, string> = {
  'hf-mirror': 'https://hf-mirror.com',
  huggingface: 'https://huggingface.co'
}
