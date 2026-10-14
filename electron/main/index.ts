import { app, nativeTheme, type Tray } from 'electron'
import { join } from 'node:path'
import { registerPetIpc } from './ipc/pet-ipc'
import { registerSettingsIpc } from './ipc/settings-ipc'
import type { MenuActions } from './menus'
import { createProvider } from './services/ai/provider'
import { ChatHistoryStore } from './services/chat-history'
import { ChatService } from './services/chat-service'
import { ConfigStore } from './services/config-store'
import { PROACTIVE_CHECK_INTERVAL_MS, shouldSpeakProactively } from './services/proactive'
import { LocalVoiceEngine } from './services/local-voice/engine'
import { ModelStore } from './services/local-voice/model-store'
import { restrictPermissions } from './permissions'
import { aiKeyName, SecureStorage, voiceKeyName } from './services/secure-storage'
import { SettingsService } from './services/settings-service'
import { VoiceService } from './services/voice/voice-service'
import { createTray } from './tray'
import { PetWindow } from './windows/pet-window'
import { SettingsWindow } from './windows/settings-window'

let tray: Tray | null = null
let proactiveTimer: ReturnType<typeof setInterval> | null = null

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
    restrictPermissions(() => panel.webContents)
    const models = new ModelStore(join(userData, 'models'), (statuses) =>
      panel.broadcastModels(statuses)
    )
    const engine = new LocalVoiceEngine(join(__dirname, 'local-voice-worker.js'))
    const voice = new VoiceService({
      getSettings: () => settings.get(),
      getKey: (kind) => secrets.get(voiceKeyName(kind)),
      onPet: (command) => pet.sendCommand(command),
      onState: (state) => panel.broadcastVoice(state),
      local: {
        isReady: (kind) => models.isReady(kind === 'asr' ? 'sensevoice' : 'kokoro'),
        transcribe: (samples, sampleRate, signal) =>
          engine.transcribe(models.dir('sensevoice'), samples, sampleRate, signal),
        synthesize: (text, sid, speed, signal) =>
          engine.synthesize(models.dir('kokoro'), text, sid, speed, signal)
      }
    })
    const chat = new ChatService({
      getSettings: () => settings.get(),
      getKey: (profileId) => secrets.get(aiKeyName(profileId)),
      createProvider: (profile, key) => createProvider(profile, key),
      history: new ChatHistoryStore(join(userData, 'chat-history.json')),
      onState: (state) => panel.broadcastChat(state),
      onPet: (command) => pet.sendCommand(command),
      presentReply: (reply, readAloud) => void voice.present(reply.text, reply.emotion, readAloud)
    })
    proactiveTimer = setInterval(() => {
      const context = {
        now: Date.now(),
        lastActivity: chat.lastActivity,
        settings: settings.get(),
        petVisible: pet.visible,
        busy: chat.busy
      }
      if (shouldSpeakProactively(context)) {
        void chat.speakProactively().then((result) => {
          if (!result.ok) console.warn(`[chat] proactive line skipped: ${result.kind}`)
        })
      }
    }, PROACTIVE_CHECK_INTERVAL_MS)

    const actions: MenuActions = {
      quit: () => app.quit(),
      openPanel: (route) => panel.open(route)
    }

    settings.onChange((next, previous) => {
      const remaining = new Set(next.ai.profiles.map((p) => p.id))
      for (const { id } of previous.ai.profiles) {
        if (!remaining.has(id)) secrets.delete(aiKeyName(id))
      }
      if (next.persona.keepHistory !== previous.persona.keepHistory) {
        chat.setKeepHistory(next.persona.keepHistory)
      }
      if (next.appearance.theme !== previous.appearance.theme) {
        nativeTheme.themeSource = next.appearance.theme
      }
      if (next.pet.launchAtLogin !== previous.pet.launchAtLogin) {
        applyLaunchAtLogin(next.pet.launchAtLogin)
      }
      if (next.pet.doNotDisturb && !previous.pet.doNotDisturb) voice.stop()
      panel.broadcast(next)
    })

    registerPetIpc(pet, actions, voice)
    registerSettingsIpc({ settings, secrets, pet, panel, chat, voice, models, engine })
    pet.create()
    tray = createTray(pet, actions)

    app.on('second-instance', () => {
      pet.show()
      panel.open()
    })
    app.on('before-quit', () => {
      if (proactiveTimer) clearInterval(proactiveTimer)
      chat.cancel()
      voice.dispose()
      models.cancelAll()
      engine.stop()
      pet.prepareQuit()
      store.flush()
      tray?.destroy()
      tray = null
    })
  })

  // The pet lives in the tray; closing windows must not quit the app.
  app.on('window-all-closed', () => {})
}
