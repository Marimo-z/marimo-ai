import type { PetEmotion, PetSettings } from './pet'

export const IPC = {
  petGetSettings: 'pet:get-settings',
  petSettingsChanged: 'pet:settings-changed',
  petCursor: 'pet:cursor',
  petCommand: 'pet:command',
  petSetInteractive: 'pet:set-interactive',
  petDragStart: 'pet:drag-start',
  petDragEnd: 'pet:drag-end',
  petShowContextMenu: 'pet:show-context-menu'
} as const

/** Cursor position relative to the pet window's top-left corner, in DIP. */
export interface CursorPoint {
  x: number
  y: number
}

export type PetCommand = { type: 'say'; text?: string } | { type: 'emotion'; emotion: PetEmotion }

export type Unsubscribe = () => void

export interface PetBridge {
  getSettings(): Promise<PetSettings>
  setInteractive(interactive: boolean): void
  startDrag(): void
  endDrag(): void
  showContextMenu(): void
  onCursor(listener: (point: CursorPoint) => void): Unsubscribe
  onSettings(listener: (settings: PetSettings) => void): Unsubscribe
  onCommand(listener: (command: PetCommand) => void): Unsubscribe
}

export interface MarimoBridge {
  pet: PetBridge
}
