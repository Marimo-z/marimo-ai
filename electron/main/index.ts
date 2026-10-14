import { app, type Tray } from 'electron'
import { join } from 'node:path'
import { registerPetIpc } from './ipc/pet-ipc'
import { ConfigStore } from './services/config-store'
import { createTray } from './tray'
import { PetWindow } from './windows/pet-window'

let tray: Tray | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.marimo.desktop-pet')

  app.whenReady().then(() => {
    const store = new ConfigStore(join(app.getPath('userData'), 'config.json'))
    const pet = new PetWindow(store)
    const actions = { quit: () => app.quit() }

    registerPetIpc(pet, actions)
    pet.create()
    tray = createTray(pet, actions)

    app.on('second-instance', () => pet.show())
    app.on('before-quit', () => {
      pet.prepareQuit()
      store.flush()
      tray?.destroy()
      tray = null
    })
  })

  // The pet lives in the tray; closing windows must not quit the app.
  app.on('window-all-closed', () => {})
}
