import type { ChatSendResult, ChatState } from './chat'
import type { PetEmotion, PetSettings } from './pet'
import type { AIProfile, AppSettings, SettingsSection } from './settings'

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
  petResetPosition: 'pet:reset-position',
  petPreviewSay: 'pet:preview-say',
  appGetInfo: 'app:get-info'
} as const

/** Cursor position relative to the pet window's top-left corner, in DIP. */
export interface CursorPoint {
  x: number
  y: number
}

export type PetCommand =
  | { type: 'say'; text?: string; emotion?: PetEmotion }
  /** `durationMs` 0 keeps the emotion until the next command. */
  | { type: 'emotion'; emotion: PetEmotion; durationMs?: number }

/** What the pet window needs: its own settings plus the persona name for the greeting. */
export interface PetViewSettings extends PetSettings {
  petName: string
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
  send(text: string): Promise<ChatSendResult>
  cancel(): Promise<void>
  clear(): Promise<void>
  onChanged(listener: (state: ChatState) => void): Unsubscribe
}

export interface MarimoBridge {
  pet: PetBridge
  settings: SettingsBridge
  chat: ChatBridge
}
