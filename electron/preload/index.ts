import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type MarimoBridge, type Unsubscribe } from '../../shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  // The IPC event object is intentionally not forwarded to the page.
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const bridge: MarimoBridge = {
  pet: {
    getSettings: () => ipcRenderer.invoke(IPC.petGetSettings),
    setInteractive: (interactive) => ipcRenderer.send(IPC.petSetInteractive, interactive === true),
    startDrag: () => ipcRenderer.send(IPC.petDragStart),
    endDrag: () => ipcRenderer.send(IPC.petDragEnd),
    showContextMenu: () => ipcRenderer.send(IPC.petShowContextMenu),
    onCursor: (listener) => subscribe(IPC.petCursor, listener),
    onSettings: (listener) => subscribe(IPC.petSettingsChanged, listener),
    onCommand: (listener) => subscribe(IPC.petCommand, listener)
  }
}

contextBridge.exposeInMainWorld('marimo', bridge)
