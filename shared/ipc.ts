import type { ChatSendResult, ChatState } from './chat'
import type { GameEvent, GameRecord, PlayableGameId } from './game'
import type { PetEmotion, PetSettings } from './pet'
import type { AIProfile, AppSettings, SettingsSection } from './settings'
import type {
  LocalModelId,
  LocalModelStatus,
  PetVoice,
  SpeechOutcome,
  VoiceKeyKind,
  VoiceKeyStatus,
  VoiceState
} from './voice'

export const IPC = {
  petGetSettings: 'pet:get-settings',
  petSettingsChanged: 'pet:settings-changed',
  petCursor: 'pet:cursor',
  petCommand: 'pet:command',
  petSetInteractive: 'pet:set-interactive',
  petDragStart: 'pet:drag-start',
  petDragEnd: 'pet:drag-end',
  petShowContextMenu: 'pet:show-context-menu',
  petOpenPanel: 'pet:open-panel',
  petSetAutoSpeak: 'pet:set-auto-speak',
  petSetChatDock: 'pet:set-chat-dock',
  petSpeechReport: 'pet:speech-report',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  settingsChanged: 'settings:changed',
  panelNavigate: 'panel:navigate',
  secretsAIStatus: 'secrets:ai-status',
  secretsAISet: 'secrets:ai-set',
  secretsAIDelete: 'secrets:ai-delete',
  aiTestConnection: 'ai:test-connection',
  chatGetState: 'chat:get-state',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  chatClear: 'chat:clear',
  chatChanged: 'chat:changed',
  voiceGetState: 'voice:get-state',
  voiceChanged: 'voice:changed',
  voiceTestSpeak: 'voice:test-speak',
  voiceStop: 'voice:stop',
  voiceTranscribe: 'voice:transcribe',
  voiceKeyStatus: 'voice:key-status',
  voiceKeySet: 'voice:key-set',
  voiceKeyDelete: 'voice:key-delete',
  voiceModels: 'voice:models',
  voiceModelsChanged: 'voice:models-changed',
  voiceModelDownload: 'voice:model-download',
  voiceModelCancel: 'voice:model-cancel',
  voiceModelImport: 'voice:model-import',
  voiceModelDelete: 'voice:model-delete',
  petResetPosition: 'pet:reset-position',
  petPreviewSay: 'pet:preview-say',
  appGetInfo: 'app:get-info',
  gameGetRecords: 'game:records',
  gameRecordsChanged: 'game:records-changed',
  gameSetPlaying: 'game:set-playing',
  gameReport: 'game:report'
} as const

/** Cursor position relative to the pet window's top-left corner, in DIP. */
export interface CursorPoint {
  x: number
  y: number
}

export type PetCommand =
  /** With `voice`, the bubble stays up until playback ends. */
  | { type: 'say'; text?: string; emotion?: PetEmotion; voice?: PetVoice }
  /**
   * Grows the current bubble without restarting playback.
   * `complete` lets the typewriter finish; until then the text may still grow.
   */
  | { type: 'caption'; text: string; emotion?: PetEmotion; complete?: boolean }
  /** Another clip of the line already on screen. `text` is what a system voice should read. */
  | { type: 'speak-more'; voice: PetVoice; text: string }
  /** No further clips will arrive for this playback id. */
  | { type: 'speech-end'; id: number }
  /** `durationMs` 0 keeps the emotion until the next command. */
  | { type: 'emotion'; emotion: PetEmotion; durationMs?: number }
  | { type: 'stop-speech' }
  | { type: 'play'; playing: boolean; game?: PlayableGameId }

/** What the pet window needs: its own settings, the persona name, and the voice toggles it shows. */
export interface PetViewSettings extends PetSettings {
  petName: string
  autoSpeak: boolean
  interruptSpeech: boolean
}

export type Unsubscribe = () => void

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface AIKeyStatus {
  /** Ids of the AI profiles that have a stored key. */
  profileIds: string[]
  /** False when the OS cannot encrypt (then keys cannot be stored at all). */
  encryptionAvailable: boolean
}

export type ConnectionErrorKind =
  | 'missing-key'
  | 'invalid-url'
  | 'insecure-url'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'unknown'

export interface ConnectionTestResult {
  ok: boolean
  kind?: ConnectionErrorKind
  message: string
  status?: number
  latencyMs?: number
  /** null when no model name was given or the service does not list models. */
  modelAvailable?: boolean | null
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  packaged: boolean
}

export interface PetBridge {
  getSettings(): Promise<PetViewSettings>
  setInteractive(interactive: boolean): void
  startDrag(): void
  endDrag(): void
  showContextMenu(): void
  openPanel(): void
  /** Toggles the existing auto-speak setting. Does not create a second preference. */
  setAutoSpeak(enabled: boolean): void
  /** Grows the pet window downward so the chat dock can be clicked. */
  setChatDock(open: boolean): void
  reportSpeech(id: number, outcome: SpeechOutcome, message?: string): void
  onCursor(listener: (point: CursorPoint) => void): Unsubscribe
  onSettings(listener: (settings: PetViewSettings) => void): Unsubscribe
  onCommand(listener: (command: PetCommand) => void): Unsubscribe
}

export interface SettingsBridge {
  get(): Promise<AppSettings>
  update<K extends SettingsSection>(
    section: K,
    patch: Partial<AppSettings[K]>
  ): Promise<Result<AppSettings>>
  reset(section?: SettingsSection): Promise<AppSettings>
  onChanged(listener: (settings: AppSettings) => void): Unsubscribe
  onNavigate(listener: (route: string) => void): Unsubscribe
  getAIKeyStatus(): Promise<AIKeyStatus>
  setAIKey(profileId: string, key: string): Promise<Result<AIKeyStatus>>
  deleteAIKey(profileId: string): Promise<AIKeyStatus>
  /** Tests a saved profile with possibly unsaved edits; uses the key stored for `profile.id`. */
  testAIConnection(profile: AIProfile): Promise<ConnectionTestResult>
  resetPetPosition(): Promise<void>
  previewSay(text: string, emotion?: PetEmotion): Promise<void>
  getAppInfo(): Promise<AppInfo>
}

export interface ChatBridge {
  getState(): Promise<ChatState>
  /** Resolves when the reply arrives, fails, or is cancelled. Only one request runs at a time. */
  send(text: string, options?: ChatSendOptions): Promise<ChatSendResult>
  cancel(): Promise<void>
  clear(): Promise<void>
  onChanged(listener: (state: ChatState) => void): Unsubscribe
}

export interface ChatSendOptions {
  /** The text came from speech recognition, so the reply is read aloud. */
  fromVoice?: boolean
}

export interface VoiceBridge {
  getState(): Promise<VoiceState>
  onChanged(listener: (state: VoiceState) => void): Unsubscribe
  /** Resolves once playback has started (or failed); ignores do-not-disturb. */
  testSpeak(text: string): Promise<Result<null>>
  stop(): Promise<void>
  /** `wav` must be 16-bit PCM WAV. Returns the recognized text. */
  transcribe(wav: Uint8Array): Promise<Result<string>>
  getKeyStatus(): Promise<VoiceKeyStatus>
  setKey(kind: VoiceKeyKind, key: string): Promise<Result<VoiceKeyStatus>>
  deleteKey(kind: VoiceKeyKind): Promise<VoiceKeyStatus>
  getModels(): Promise<LocalModelStatus[]>
  onModelsChanged(listener: (statuses: LocalModelStatus[]) => void): Unsubscribe
  /** Starts a download from the configured source; progress arrives via `onModelsChanged`. */
  downloadModel(id: LocalModelId): Promise<void>
  cancelDownload(id: LocalModelId): Promise<void>
  /** Opens a folder picker and copies the model; `null` when the picker was dismissed. */
  importModel(id: LocalModelId): Promise<Result<null> | null>
  deleteModel(id: LocalModelId): Promise<Result<null>>
}

export interface GameBridge {
  getRecords(): Promise<GameRecord[]>
  onRecordsChanged(listener: (records: GameRecord[]) => void): Unsubscribe
  setPlaying(gameId: PlayableGameId | null): Promise<Result<null>>
  reportEvent(event: GameEvent): Promise<Result<null>>
}

export interface MarimoBridge {
  pet: PetBridge
  settings: SettingsBridge
  chat: ChatBridge
  voice: VoiceBridge
  game: GameBridge
}
