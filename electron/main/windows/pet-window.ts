import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC, type PetCommand, type PetViewSettings } from '../../../shared/ipc'
import { petWindowSize, type PetSettings } from '../../../shared/pet'
import type { AppSettings } from '../../../shared/settings'
import type { ConfigStore } from '../services/config-store'
import { PointerTracker } from '../services/pointer-tracker'
import type { SettingsService } from '../services/settings-service'
import { defaultPosition, ensureVisible, type Point, type Rect } from '../services/window-bounds'

const CURSOR_POLL_MS = 33
const DRAG_POLL_MS = 16

function workAreas(): Rect[] {
  const primary = screen.getPrimaryDisplay()
  const others = screen.getAllDisplays().filter((d) => d.id !== primary.id)
  return [primary, ...others].map((d) => d.workArea)
}

export class PetWindow {
  private win: BrowserWindow | null = null
  private interactive = false
  private allowClose = false
  private dragOffset: Point | null = null
  private dragTimer: NodeJS.Timeout | null = null
  private readonly tracker = new PointerTracker(CURSOR_POLL_MS, (p) => this.sendCursor(p))
  private readonly changeListeners = new Set<() => void>()

  constructor(
    private readonly store: ConfigStore,
    private readonly settingsService: SettingsService
  ) {
    settingsService.onChange((next, previous) => this.applySettings(next, previous))
  }

  get settings(): PetSettings {
    return this.store.get().pet
  }

  get viewSettings(): PetViewSettings {
    const config = this.store.get()
    return { ...config.pet, petName: config.persona.name }
  }

  get webContents(): Electron.WebContents | null {
    return this.win?.webContents ?? null
  }

  get visible(): boolean {
    return this.win?.isVisible() ?? false
  }

  /** Notifies menus/tray that visibility or settings changed. */
  onChange(listener: () => void): void {
    this.changeListeners.add(listener)
  }

  create(): void {
    const settings = this.settings
    const size = petWindowSize(settings.scale)
    const saved = this.store.get().petWindowPosition
    const areas = workAreas()
    const position = saved
      ? ensureVisible({ ...saved, ...size }, areas)
      : defaultPosition(areas[0], size)

    const win = new BrowserWindow({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: settings.alwaysOnTop,
      title: 'Marimo',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })
    this.win = win
    this.applyMouseMode()

    win.once('ready-to-show', () => win.showInactive())
    win.on('show', () => this.handleVisibility())
    win.on('hide', () => this.handleVisibility())
    win.on('close', (event) => {
      if (!this.allowClose) {
        event.preventDefault()
        win.hide()
      }
    })
    win.on('closed', () => {
      this.tracker.stop()
      this.win = null
    })

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!app.isPackaged && devUrl) {
      void win.loadURL(`${devUrl}/pet.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/pet.html'))
    }

    screen.on('display-removed', this.ensureOnScreen)
    screen.on('display-metrics-changed', this.ensureOnScreen)
  }

  show(): void {
    this.win?.showInactive()
  }

  hide(): void {
    this.win?.hide()
  }

  toggle(): void {
    if (this.visible) this.hide()
    else this.show()
  }

  /** Must be called before quitting; otherwise closing only hides the window. */
  prepareQuit(): void {
    this.allowClose = true
    this.stopDrag(false)
    this.tracker.stop()
    screen.off('display-removed', this.ensureOnScreen)
    screen.off('display-metrics-changed', this.ensureOnScreen)
  }

  updateSettings(patch: Partial<PetSettings>): void {
    this.settingsService.update('pet', patch)
  }

  /** Moves the pet back to the default corner of the primary display. */
  resetPosition(): void {
    const win = this.win
    if (!win) return
    const size = petWindowSize(this.settings.scale)
    win.setBounds({ ...defaultPosition(workAreas()[0], size), ...size })
    this.savePosition()
    this.tracker.invalidate()
    this.show()
  }

  private applySettings(nextAll: AppSettings, previousAll: AppSettings): void {
    const next = nextAll.pet
    const previous = previousAll.pet
    const win = this.win

    if (win) {
      if (next.alwaysOnTop !== previous.alwaysOnTop) win.setAlwaysOnTop(next.alwaysOnTop)
      if (next.scale !== previous.scale) this.resizeKeepingBottomCenter(next.scale)
      if (next.clickThrough !== previous.clickThrough) {
        this.interactive = false
        this.applyMouseMode()
      }
      win.webContents.send(IPC.petSettingsChanged, this.viewSettings)
    }
    this.syncTracker()
    this.emitChange()
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive
    this.applyMouseMode()
  }

  sendCommand(command: PetCommand): void {
    this.win?.webContents.send(IPC.petCommand, command)
  }

  startDrag(): void {
    const win = this.win
    if (!win || this.dragTimer || this.settings.clickThrough) return
    const cursor = screen.getCursorScreenPoint()
    const [x, y] = win.getPosition()
    this.dragOffset = { x: cursor.x - x, y: cursor.y - y }
    this.dragTimer = setInterval(this.dragTick, DRAG_POLL_MS)
    this.applyMouseMode()
  }

  endDrag(): void {
    this.stopDrag(true)
  }

  private stopDrag(savePosition: boolean): void {
    if (!this.dragTimer) return
    clearInterval(this.dragTimer)
    this.dragTimer = null
    this.dragOffset = null
    if (savePosition) this.savePosition()
    this.applyMouseMode()
  }

  private dragTick = (): void => {
    const win = this.win
    if (!win || !this.dragOffset) return
    const cursor = screen.getCursorScreenPoint()
    const size = petWindowSize(this.settings.scale)
    // Always pass an explicit size: moving a transparent window across monitors with
    // different DPI scaling otherwise makes Windows grow or shrink it.
    win.setBounds({
      x: cursor.x - this.dragOffset.x,
      y: cursor.y - this.dragOffset.y,
      width: size.width,
      height: size.height
    })
  }

  private applyMouseMode(): void {
    const win = this.win
    if (!win) return
    if (this.settings.clickThrough) {
      win.setIgnoreMouseEvents(true)
    } else if (this.interactive || this.dragTimer) {
      win.setIgnoreMouseEvents(false)
    } else {
      // Transparent areas pass clicks through; `forward` keeps mousemove flowing so the
      // renderer can tell when the pointer enters the orb or bubble again.
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  private sendCursor(screenPoint: Point): void {
    const win = this.win
    if (!win) return
    const bounds = win.getBounds()
    win.webContents.send(IPC.petCursor, {
      x: screenPoint.x - bounds.x,
      y: screenPoint.y - bounds.y
    })
  }

  private syncTracker(): void {
    if (this.visible && this.settings.followCursor) this.tracker.start()
    else this.tracker.stop()
  }

  private handleVisibility(): void {
    this.syncTracker()
    this.emitChange()
  }

  private ensureOnScreen = (): void => {
    const win = this.win
    if (!win) return
    const bounds = win.getBounds()
    const next = ensureVisible(bounds, workAreas())
    if (next.x !== bounds.x || next.y !== bounds.y) {
      win.setBounds(next)
      this.savePosition()
      this.tracker.invalidate()
    }
  }

  private resizeKeepingBottomCenter(scale: number): void {
    const win = this.win
    if (!win) return
    const bounds = win.getBounds()
    const size = petWindowSize(scale)
    const next = ensureVisible(
      {
        x: Math.round(bounds.x + (bounds.width - size.width) / 2),
        y: bounds.y + bounds.height - size.height,
        ...size
      },
      workAreas()
    )
    win.setBounds(next)
    this.savePosition()
  }

  private savePosition(): void {
    const win = this.win
    if (!win) return
    const [x, y] = win.getPosition()
    this.store.update((config) => ({ ...config, petWindowPosition: { x, y } }))
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) listener()
  }
}
