import type { CursorPoint, PetBridge, PetCommand } from '../../../shared/ipc'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '../../../shared/pet'

/**
 * Stand-in used only when the page is opened in a normal browser during development
 * (no Electron preload). Cursor tracking falls back to in-page mouse events.
 */
function createBrowserPreviewBridge(): PetBridge {
  const noop = (): void => {}
  return {
    getSettings: async (): Promise<PetSettings> => ({ ...DEFAULT_PET_SETTINGS }),
    setInteractive: noop,
    startDrag: noop,
    endDrag: noop,
    showContextMenu: () => console.info('[preview] context menu is native in Electron'),
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
