import type { GameEvent } from '../../shared/game'
import type { GameDifficulty } from '../../shared/settings'

export type GameStatus = 'idle' | 'playing' | 'paused' | 'over'

export interface GameStartOptions {
  difficulty: GameDifficulty
  first: 'player' | 'pet'
}

/**
 * Shared lifecycle for board games. Vue owns the DOM; adapters own rules, AI and events.
 * `initialize`'s container is unused (the spec allowed a Phaser host; these games are Vue).
 */
export interface GameAdapter {
  initialize(container: unknown, options: GameStartOptions): void
  start(): void
  pause(): void
  resume(): void
  restart(): void
  destroy(): void
  setDifficulty(level: GameDifficulty): void
  onEvent(handler: (event: GameEvent) => void): void
}

export type EventHandler = (event: GameEvent) => void
