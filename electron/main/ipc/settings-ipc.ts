import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC,
  type AIKeyStatus,
  type AppInfo,
  type ConnectionTestResult,
  type Result
} from '../../../shared/ipc'
import { isPetEmotion } from '../../../shared/pet'
import { isSettingsSection } from '../../../shared/settings'
import { createProvider } from '../services/ai/provider'
import type { ChatService } from '../services/chat-service'
import { aiProfileSchema, formatIssues } from '../services/config-schema'
import { aiKeyName, type SecureStorage } from '../services/secure-storage'
import { SettingsValidationError, type SettingsService } from '../services/settings-service'
import type { PetWindow } from '../windows/pet-window'
import type { SettingsWindow } from '../windows/settings-window'

const MAX_KEY_LENGTH = 512
const MAX_PREVIEW_TEXT = 200

interface Deps {
  settings: SettingsService
  secrets: SecureStorage
  pet: PetWindow
  panel: SettingsWindow
  chat: ChatService
}

export function registerSettingsIpc({ settings, secrets, pet, panel, chat }: Deps): void {
  /** Registers a handler that only the control panel may call. */
  const handle = <A extends unknown[], R>(
    channel: string,
    handler: (...args: A) => R | Promise<R>
  ): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (panel.webContents === null || event.sender !== panel.webContents) {
        throw new Error('Forbidden')
      }
      return handler(...(args as A))
    })
  }

  const keyStatus = (): AIKeyStatus => ({
    profileIds: secrets.aiProfileIds(),
    encryptionAvailable: secrets.available
  })

  const profileExists = (id: unknown): id is string =>
    typeof id === 'string' && settings.get().ai.profiles.some((p) => p.id === id)

  handle(IPC.settingsGet, () => settings.get())

  handle(IPC.settingsUpdate, (section: unknown, patch: unknown) => {
    if (!isSettingsSection(section) || !patch || typeof patch !== 'object') {
      return { ok: false, error: '无效的设置请求' } satisfies Result<never>
    }
    try {
      return { ok: true, data: settings.update(section, patch) }
    } catch (error) {
      if (error instanceof SettingsValidationError) return { ok: false, error: error.message }
      throw error
    }
  })

  handle(IPC.settingsReset, (section: unknown) =>
    settings.reset(isSettingsSection(section) ? section : undefined)
  )

  handle(IPC.secretsAIStatus, keyStatus)

  handle(IPC.secretsAISet, (profileId: unknown, key: unknown): Result<AIKeyStatus> => {
    if (!profileExists(profileId)) return { ok: false, error: '该 AI 配置不存在，请先保存' }
    if (typeof key !== 'string') return { ok: false, error: '无效的 API Key' }
    const trimmed = key.trim()
    if (!trimmed || trimmed.length > MAX_KEY_LENGTH || /\s/.test(trimmed)) {
      return { ok: false, error: 'API Key 不能为空、不能包含空白字符，且长度不超过 512' }
    }
    try {
      secrets.set(aiKeyName(profileId), trimmed)
      return { ok: true, data: keyStatus() }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  handle(IPC.secretsAIDelete, (profileId: unknown) => {
    if (typeof profileId === 'string') secrets.delete(aiKeyName(profileId))
    return keyStatus()
  })

  handle(IPC.aiTestConnection, async (profile: unknown): Promise<ConnectionTestResult> => {
    const parsed = aiProfileSchema.safeParse(profile)
    if (!parsed.success) {
      return { ok: false, kind: 'invalid-url', message: formatIssues(parsed.error) }
    }
    const key = profileExists(parsed.data.id) ? secrets.get(aiKeyName(parsed.data.id)) : null
    return createProvider(parsed.data, key).testConnection()
  })

  handle(IPC.chatGetState, () => chat.state())
  handle(IPC.chatSend, (text: unknown) => chat.send(text))
  handle(IPC.chatCancel, () => chat.cancel())
  handle(IPC.chatClear, () => chat.clear())

  handle(IPC.petResetPosition, () => pet.resetPosition())

  handle(IPC.petPreviewSay, (text: unknown, emotion: unknown) => {
    if (typeof text !== 'string' || !text.trim()) return
    pet.show()
    pet.sendCommand({
      type: 'say',
      text: text.slice(0, MAX_PREVIEW_TEXT),
      emotion: isPetEmotion(emotion) ? emotion : undefined
    })
  })

  handle(IPC.appGetInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    packaged: app.isPackaged
  }))
}
