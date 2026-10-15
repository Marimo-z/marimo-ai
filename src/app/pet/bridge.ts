import type { CursorPoint, PetBridge, PetCommand, PetViewSettings } from '../../../shared/ipc'
import type { SystemSample } from '../../../shared/monitor'
import { DEFAULT_PET_SETTINGS } from '../../../shared/pet'

/**
 * Stand-in used only when the page is opened in a normal browser during development
 * (no Electron preload). Cursor tracking falls back to in-page mouse events.
 */
function createBrowserPreviewBridge(): PetBridge {
  const noop = (): void => {}
  let settings: PetViewSettings = {
    ...DEFAULT_PET_SETTINGS,
    petName: 'Marimo',
    autoSpeak: false,
    interruptSpeech: false
  }
  const listeners = new Set<(next: PetViewSettings) => void>()
  const monitorListeners = new Set<(sample: SystemSample) => void>()
  let monitorTimer: ReturnType<typeof setInterval> | undefined
  const emit = (): void => listeners.forEach((listener) => listener({ ...settings }))
  return {
    getSettings: async () => ({ ...settings }),
    setInteractive: noop,
    openPanel: () => console.info('[preview] the control panel opens in Electron'),
    setAutoSpeak(enabled) {
      settings = { ...settings, autoSpeak: enabled }
      emit()
    },
    setChatDock: noop,
    setMonitor(enabled) {
      if (monitorTimer) clearInterval(monitorTimer)
      monitorTimer = undefined
      if (!enabled) return
      let tick = 0
      const push = (): void => {
        tick += 1
        const sample: SystemSample = {
          cpu: 0.28 + 0.12 * Math.sin(tick / 2),
          memory: 0.61,
          gpu: 0.18 + 0.1 * Math.cos(tick / 3)
        }
        monitorListeners.forEach((listener) => listener(sample))
      }
      push()
      monitorTimer = setInterval(push, 1000)
    },
    onMonitor(listener) {
      monitorListeners.add(listener)
      return () => monitorListeners.delete(listener)
    },
    startDrag: noop,
    endDrag: noop,
    showContextMenu: () => console.info('[preview] context menu is native in Electron'),
    reportSpeech: noop,
    onCursor(listener: (point: CursorPoint) => void) {
      const handler = (e: MouseEvent): void => listener({ x: e.clientX, y: e.clientY })
      window.addEventListener('mousemove', handler)
      return () => window.removeEventListener('mousemove', handler)
    },
    onSettings(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onCommand(listener: (command: PetCommand) => void) {
      const w = window as unknown as { petCommand?: (c: PetCommand) => void }
      w.petCommand = listener
      return () => delete w.petCommand
    }
  }
}

function resolveBridge(): PetBridge {
  if (window.marimo?.pet) return window.marimo.pet
  if (import.meta.env.DEV) return createBrowserPreviewBridge()
  throw new Error('Marimo preload bridge is unavailable')
}

export const petBridge = resolveBridge()
