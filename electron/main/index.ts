import { app, nativeTheme, type Tray } from 'electron'
import { join } from 'node:path'
import { registerPetIpc } from './ipc/pet-ipc'
import { registerSettingsIpc } from './ipc/settings-ipc'
import type { MenuActions } from './menus'
import { ConfigStore } from './services/config-store'
import { SecureStorage } from './services/secure-storage'
import { SettingsService } from './services/settings-service'
import { createTray } from './tray'
import { PetWindow } from './windows/pet-window'
import { SettingsWindow } from './windows/settings-window'

let tray: Tray | null = null

function applyLaunchAtLogin(enabled: boolean): void {
  // In development the executable is the bare Electron binary, so registering it is pointless.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.marimo.desktop-pet')

  app.whenReady().then(() => {
    const userData = app.getPath('userData')
    const store = new ConfigStore(join(userData, 'config.json'))
    const settings = new SettingsService(store)
    const secrets = new SecureStorage(join(userData, 'secrets.json'))

    const initial = settings.get()
    nativeTheme.themeSource = initial.appearance.theme
    applyLaunchAtLogin(initial.pet.launchAtLogin)

    const pet = new PetWindow(store, settings)
    const panel = new SettingsWindow()
    const actions: MenuActions = {
      quit: () => app.quit(),
      openPanel: (route) => panel.open(route)
    }

    settings.onChange((next, previous) => {
      if (next.appearance.theme !== previous.appearance.theme) {
        nativeTheme.themeSource = next.appearance.theme
      }
      if (next.pet.launchAtLogin !== previous.pet.launchAtLogin) {
        applyLaunchAtLogin(next.pet.launchAtLogin)
      }
      panel.broadcast(next)
    })

    registerPetIpc(pet, actions)
    registerSettingsIpc({ settings, secrets, pet, panel })
    pet.create()
    tray = createTray(pet, actions)

    app.on('second-instance', () => {
      pet.show()
      panel.open()
    })
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
