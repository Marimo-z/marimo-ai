import type { GameDifficulty } from './settings'

export const PLAYABLE_GAME_IDS = ['tic-tac-toe', 'gomoku'] as const
export type PlayableGameId = (typeof PLAYABLE_GAME_IDS)[number]

export const GAME_EVENT_TYPES = [
  'game_started',
  'turn_started',
  'player_good_move',
  'player_mistake',
  'player_win',
  'player_lose',
  'game_paused',
  'game_over'
] as const
export type GameEventType = (typeof GAME_EVENT_TYPES)[number]

export const GAME_OUTCOMES = ['win', 'lose', 'draw'] as const
export type GameOutcome = (typeof GAME_OUTCOMES)[number]

export const GAME_SIDES = ['player', 'pet'] as const
export type GameSide = (typeof GAME_SIDES)[number]

/** Event sent from the game view to the main process. */
export interface GameEvent {
  type: GameEventType
  gameId: PlayableGameId
  difficulty: GameDifficulty
  first: GameSide
  /** Required for `game_over`. From the player's point of view. */
  outcome?: GameOutcome
  startedAt?: number
}

export interface GameRecord {
  id: string
  gameId: PlayableGameId
  difficulty: GameDifficulty
  first: GameSide
  outcome: GameOutcome
  startedAt: number
  endedAt: number
}

export const GAME_NAMES: Record<PlayableGameId, string> = {
  'tic-tac-toe': '井字棋',
  gomoku: '五子棋'
}

export const GAME_OUTCOME_LABELS: Record<GameOutcome, string> = {
  win: '胜',
  lose: '负',
  draw: '平'
}

export const GAME_RECORDS_MAX = 50

export const PLAYER = 1
export const PET = 2
export type Piece = 0 | typeof PLAYER | typeof PET

export function isPlayableGameId(value: unknown): value is PlayableGameId {
  return typeof value === 'string' && (PLAYABLE_GAME_IDS as readonly string[]).includes(value)
}

export function isGameEventType(value: unknown): value is GameEventType {
  return typeof value === 'string' && (GAME_EVENT_TYPES as readonly string[]).includes(value)
}
