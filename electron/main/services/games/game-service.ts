import { z } from 'zod'
import { pickGameLine, shouldSpeakGameEvent } from '../../../../shared/game-dialogue'
import {
  GAME_EVENT_TYPES,
  GAME_OUTCOMES,
  GAME_SIDES,
  PLAYABLE_GAME_IDS,
  isPlayableGameId,
  type GameEventType,
  type GameRecord,
  type PlayableGameId
} from '../../../../shared/game'
import type { PetCommand, Result } from '../../../../shared/ipc'
import type { PetEmotion } from '../../../../shared/pet'
import { GAME_DIFFICULTIES, type AppSettings } from '../../../../shared/settings'
import type { GameRecordStore } from './records'

const eventSchema = z.object({
  type: z.enum(GAME_EVENT_TYPES),
  gameId: z.enum(PLAYABLE_GAME_IDS),
  difficulty: z.enum(GAME_DIFFICULTIES),
  first: z.enum(GAME_SIDES),
  outcome: z.enum(GAME_OUTCOMES).optional(),
  startedAt: z.number().int().nonnegative().optional()
})

export interface GameServiceDeps {
  getSettings(): AppSettings
  onPet(command: PetCommand): void
  present(text: string, emotion: PetEmotion | undefined, speak: boolean): void
  onRecords(records: GameRecord[]): void
}

/** Routes board-game events to the pet and the record file. Never waits on TTS or chat. */
export class GameService {
  private active: PlayableGameId | null = null
  private readonly lastAt = new Map<GameEventType, number>()

  constructor(
    private readonly records: GameRecordStore,
    private readonly deps: GameServiceDeps
  ) {}

  list(): GameRecord[] {
    return this.records.list()
  }

  get playing(): PlayableGameId | null {
    return this.active
  }

  setPlaying(gameId: PlayableGameId | null): void {
    this.active = gameId
    this.deps.onPet({ type: 'play', playing: gameId !== null, game: gameId ?? undefined })
    if (!gameId) this.lastAt.clear()
  }

  report(raw: unknown): Result<null> {
    const parsed = eventSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: '无效的游戏事件' }
    const event = parsed.data

    if (event.type === 'game_started') this.setPlaying(event.gameId)

    if (event.type === 'game_over' && event.outcome) {
      const startedAt = event.startedAt && event.startedAt > 0 ? event.startedAt : Date.now()
      const next = this.records.append({
        id: crypto.randomUUID(),
        gameId: event.gameId,
        difficulty: event.difficulty,
        first: event.first,
        outcome: event.outcome,
        startedAt,
        endedAt: Date.now()
      })
      this.deps.onRecords(next)
    }

    const games = this.deps.getSettings().games
    if (!games.dialogueEnabled) return { ok: true, data: null }
    if (!shouldSpeakGameEvent(event.type, games.dialogueFrequency, this.lastAt, Date.now())) {
      return { ok: true, data: null }
    }
    const line = pickGameLine(
      event.type,
      games.tauntLevel,
      event.outcome,
      Math.random,
      event.gameId
    )
    if (!line) return { ok: true, data: null }
    const speak = this.deps.getSettings().voice.autoSpeak
    this.deps.present(line.text, line.emotion, speak)
    return { ok: true, data: null }
  }
}

/** `null` stops playing; `undefined` means the payload was invalid. */
export function parsePlayingId(value: unknown): PlayableGameId | null | undefined {
  if (value === null) return null
  if (isPlayableGameId(value)) return value
  return undefined
}
