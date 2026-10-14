import type { CursorPoint, PetBridge, PetCommand, PetViewSettings } from '../../../shared/ipc'
import { DEFAULT_PET_SETTINGS } from '../../../shared/pet'

/**
 * Stand-in used only when the page is opened in a normal browser during development
 * (no Electron preload). Cursor tracking falls back to in-page mouse events.
 */
function createBrowserPreviewBridge(): PetBridge {
  const noop = (): void => {}
  return {
    getSettings: async (): Promise<PetViewSettings> => ({
      ...DEFAULT_PET_SETTINGS,
      petName: 'Marimo'
    }),
    setInteractive: noop,
    openPanel: () => console.info('[preview] the control panel opens in Electron'),
    startDrag: noop,
    endDrag: noop,
    showContextMenu: () => console.info('[preview] context menu is native in Electron'),
    reportSpeech: noop,
    onCursor(listener: (point: CursorPoint) => void) {
      const handler = (e: MouseEvent): void => listener({ x: e.clientX, y: e.clientY })
      window.addEventListener('mousemove', handler)
      return () => window.removeEventListener('mousemove', handler)
    },
    onSettings: () => noop,
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
