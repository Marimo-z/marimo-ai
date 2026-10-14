import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GameService } from '../electron/main/services/games/game-service'
import { GameRecordStore } from '../electron/main/services/games/records'
import type { PetCommand } from '../shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings'

describe('GameService', () => {
  const dirs: string[] = []
  afterEach(() => {
    dirs.length = 0
  })

  function setup(patch?: (settings: AppSettings) => void) {
    const dir = mkdtempSync(join(tmpdir(), 'marimo-games-'))
    dirs.push(dir)
    const settings = structuredClone(DEFAULT_SETTINGS)
    patch?.(settings)
    const pet: PetCommand[] = []
    const presented: Array<{ text: string; speak: boolean }> = []
    const service = new GameService(new GameRecordStore(join(dir, 'records.json')), {
      getSettings: () => settings,
      onPet: (command) => pet.push(command),
      present: (text, _emotion, speak) => presented.push({ text, speak }),
      onRecords: () => {}
    })
    return { service, pet, presented, settings }
  }

  it('marks the pet as playing and writes a record on game_over', () => {
    const { service, pet } = setup()
    expect(
      service.report({
        type: 'game_started',
        gameId: 'tic-tac-toe',
        difficulty: 'normal',
        first: 'player'
      }).ok
    ).toBe(true)
    expect(pet.at(-1)).toEqual({ type: 'play', playing: true, game: 'tic-tac-toe' })
    expect(
      service.report({
        type: 'game_over',
        gameId: 'tic-tac-toe',
        difficulty: 'normal',
        first: 'player',
        outcome: 'win',
        startedAt: 1
      }).ok
    ).toBe(true)
    expect(service.list()).toHaveLength(1)
    expect(service.list()[0]?.outcome).toBe('win')
  })

  it('stays quiet when game dialogue is off', () => {
    const { service, presented } = setup((s) => {
      s.games.dialogueEnabled = false
    })
    service.report({
      type: 'game_started',
      gameId: 'gomoku',
      difficulty: 'easy',
      first: 'pet'
    })
    expect(presented).toEqual([])
  })

  it('rejects a malformed event', () => {
    const { service } = setup()
    expect(service.report({ type: 'nope' }).ok).toBe(false)
  })
})
