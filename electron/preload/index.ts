import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type MarimoBridge, type Unsubscribe } from '../../shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  // The IPC event object is intentionally not forwarded to the page.
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Both windows share this preload; the main process checks which window may call each channel.
const bridge: MarimoBridge = {
  pet: {
    getSettings: () => ipcRenderer.invoke(IPC.petGetSettings),
    setInteractive: (interactive) => ipcRenderer.send(IPC.petSetInteractive, interactive === true),
    startDrag: () => ipcRenderer.send(IPC.petDragStart),
    endDrag: () => ipcRenderer.send(IPC.petDragEnd),
    showContextMenu: () => ipcRenderer.send(IPC.petShowContextMenu),
    openPanel: () => ipcRenderer.send(IPC.petOpenPanel),
    reportSpeech: (id, outcome, message) =>
      ipcRenderer.send(IPC.petSpeechReport, id, outcome, message),
    onCursor: (listener) => subscribe(IPC.petCursor, listener),
    onSettings: (listener) => subscribe(IPC.petSettingsChanged, listener),
    onCommand: (listener) => subscribe(IPC.petCommand, listener)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (section, patch) => ipcRenderer.invoke(IPC.settingsUpdate, section, patch),
    reset: (section) => ipcRenderer.invoke(IPC.settingsReset, section),
    onChanged: (listener) => subscribe(IPC.settingsChanged, listener),
    onNavigate: (listener) => subscribe(IPC.panelNavigate, listener),
    getAIKeyStatus: () => ipcRenderer.invoke(IPC.secretsAIStatus),
    setAIKey: (profileId, key) => ipcRenderer.invoke(IPC.secretsAISet, profileId, key),
    deleteAIKey: (profileId) => ipcRenderer.invoke(IPC.secretsAIDelete, profileId),
    testAIConnection: (profile) => ipcRenderer.invoke(IPC.aiTestConnection, profile),
    resetPetPosition: () => ipcRenderer.invoke(IPC.petResetPosition),
    previewSay: (text, emotion) => ipcRenderer.invoke(IPC.petPreviewSay, text, emotion),
    getAppInfo: () => ipcRenderer.invoke(IPC.appGetInfo)
  },
  chat: {
    getState: () => ipcRenderer.invoke(IPC.chatGetState),
    send: (text, options) => ipcRenderer.invoke(IPC.chatSend, text, options),
    cancel: () => ipcRenderer.invoke(IPC.chatCancel),
    clear: () => ipcRenderer.invoke(IPC.chatClear),
    onChanged: (listener) => subscribe(IPC.chatChanged, listener)
  },
  voice: {
    getState: () => ipcRenderer.invoke(IPC.voiceGetState),
    onChanged: (listener) => subscribe(IPC.voiceChanged, listener),
    testSpeak: (text) => ipcRenderer.invoke(IPC.voiceTestSpeak, text),
    stop: () => ipcRenderer.invoke(IPC.voiceStop),
    transcribe: (wav) => ipcRenderer.invoke(IPC.voiceTranscribe, wav),
    getKeyStatus: () => ipcRenderer.invoke(IPC.voiceKeyStatus),
    setKey: (kind, key) => ipcRenderer.invoke(IPC.voiceKeySet, kind, key),
    deleteKey: (kind) => ipcRenderer.invoke(IPC.voiceKeyDelete, kind),
    getModels: () => ipcRenderer.invoke(IPC.voiceModels),
    onModelsChanged: (listener) => subscribe(IPC.voiceModelsChanged, listener),
    downloadModel: (id) => ipcRenderer.invoke(IPC.voiceModelDownload, id),
    cancelDownload: (id) => ipcRenderer.invoke(IPC.voiceModelCancel, id),
    importModel: (id) => ipcRenderer.invoke(IPC.voiceModelImport, id),
    deleteModel: (id) => ipcRenderer.invoke(IPC.voiceModelDelete, id)
  }
}

contextBridge.exposeInMainWorld('marimo', bridge)
