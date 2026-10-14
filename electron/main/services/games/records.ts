import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  GAME_OUTCOMES,
  GAME_RECORDS_MAX,
  GAME_SIDES,
  PLAYABLE_GAME_IDS,
  type GameRecord
} from '../../../../shared/game'
import { GAME_DIFFICULTIES } from '../../../../shared/settings'

const recordSchema = z.object({
  id: z.string().min(1).max(80),
  gameId: z.enum(PLAYABLE_GAME_IDS),
  difficulty: z.enum(GAME_DIFFICULTIES),
  first: z.enum(GAME_SIDES),
  outcome: z.enum(GAME_OUTCOMES),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative()
})

/** Finished games only. Invalid entries are skipped. */
export class GameRecordStore {
  constructor(private readonly filePath: string) {}

  list(): GameRecord[] {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8').replace(/^\uFEFF/, ''))
    } catch {
      return []
    }
    const list = (raw as { records?: unknown } | null)?.records
    if (!Array.isArray(list)) return []
    return list
      .map((item) => recordSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data)
      .slice(-GAME_RECORDS_MAX)
  }

  append(record: GameRecord): GameRecord[] {
    const next = [...this.list(), record].slice(-GAME_RECORDS_MAX)
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, records: next }), 'utf-8')
    renameSync(tmp, this.filePath)
    return next
  }
}
