import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../../shared/ipc'
import { buildPetContextMenu, type MenuActions } from '../menus'
import type { SettingsService } from '../services/settings-service'
import type { VoiceService } from '../services/voice/voice-service'
import type { PetWindow } from '../windows/pet-window'

export function registerPetIpc(
  pet: PetWindow,
  actions: MenuActions,
  voice: VoiceService,
  settings: SettingsService
): void {
  const fromPet = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    pet.webContents !== null && event.sender === pet.webContents

  ipcMain.handle(IPC.petGetSettings, (event) => {
    if (!fromPet(event)) throw new Error('Forbidden')
    return pet.viewSettings
  })

  ipcMain.on(IPC.petSetInteractive, (event, interactive: unknown) => {
    if (fromPet(event) && typeof interactive === 'boolean') pet.setInteractive(interactive)
  })

  ipcMain.on(IPC.petDragStart, (event) => {
    if (fromPet(event)) pet.startDrag()
  })

  ipcMain.on(IPC.petDragEnd, (event) => {
    if (fromPet(event)) pet.endDrag()
  })

  ipcMain.on(IPC.petShowContextMenu, (event) => {
    if (!fromPet(event)) return
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) buildPetContextMenu(pet, actions).popup({ window })
  })

  ipcMain.on(IPC.petOpenPanel, (event) => {
    if (fromPet(event) && pet.settings.doubleClickAction === 'panel') actions.openPanel('/overview')
  })

  ipcMain.on(IPC.petSetAutoSpeak, (event, enabled: unknown) => {
    if (fromPet(event) && typeof enabled === 'boolean')
      settings.update('voice', { autoSpeak: enabled })
  })

  ipcMain.on(IPC.petSetChatDock, (event, open: unknown) => {
    if (fromPet(event) && typeof open === 'boolean') pet.setChatDock(open)
  })

  ipcMain.on(IPC.petSpeechReport, (event, id: unknown, outcome: unknown, message: unknown) => {
    if (fromPet(event)) voice.report(id, outcome, message)
  })
}
