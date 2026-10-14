import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import type { ChatState } from '../../../shared/chat'
import type { GameRecord } from '../../../shared/game'
import { IPC } from '../../../shared/ipc'
import type { AppSettings } from '../../../shared/settings'
import { PANEL_CHROME, PANEL_TITLE_BAR_HEIGHT } from '../../../shared/theme'
import type { LocalModelStatus, VoiceState } from '../../../shared/voice'

export const PANEL_ROUTES = [
  '/overview',
  '/chat',
  '/ai',
  '/persona',
  '/voice',
  '/pet',
  '/games'
] as const
export type PanelRoute = (typeof PANEL_ROUTES)[number]

function chrome(): (typeof PANEL_CHROME)['light' | 'dark'] {
  return nativeTheme.shouldUseDarkColors ? PANEL_CHROME.dark : PANEL_CHROME.light
}

/** Control panel. Closing it destroys the window but never quits the app (the pet keeps running). */
export class SettingsWindow {
  private win: BrowserWindow | null = null

  constructor() {
    nativeTheme.on('updated', () => this.applyChrome())
  }

  get webContents(): Electron.WebContents | null {
    return this.win?.webContents ?? null
  }

  open(route: PanelRoute = '/overview'): void {
    const existing = this.win
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      existing.webContents.send(IPC.panelNavigate, route)
      return
    }
    this.create(route)
  }

  broadcast(settings: AppSettings): void {
    this.win?.webContents.send(IPC.settingsChanged, settings)
  }

  broadcastChat(state: ChatState): void {
    this.win?.webContents.send(IPC.chatChanged, state)
  }

  broadcastVoice(state: VoiceState): void {
    this.win?.webContents.send(IPC.voiceChanged, state)
  }

  broadcastModels(statuses: LocalModelStatus[]): void {
    this.win?.webContents.send(IPC.voiceModelsChanged, statuses)
  }

  broadcastRecords(records: GameRecord[]): void {
    this.win?.webContents.send(IPC.gameRecordsChanged, records)
  }

  get window(): BrowserWindow | null {
    return this.win
  }

  private create(route: PanelRoute): void {
    const colors = chrome()
    const win = new BrowserWindow({
      width: 1040,
      height: 700,
      minWidth: 880,
      minHeight: 580,
      show: false,
      title: 'Marimo 控制面板',
      backgroundColor: colors.background,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: colors.titleBar,
        symbolColor: colors.symbol,
        height: PANEL_TITLE_BAR_HEIGHT
      },
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })
    this.win = win

    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      this.win = null
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!app.isPackaged && devUrl) {
      void win.loadURL(`${devUrl}/settings.html#${route}`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/settings.html'), { hash: route })
    }
  }

  private applyChrome(): void {
    const win = this.win
    if (!win) return
    const colors = chrome()
    win.setBackgroundColor(colors.background)
    win.setTitleBarOverlay({ color: colors.titleBar, symbolColor: colors.symbol })
  }
}
