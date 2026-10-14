import { describe, expect, it } from 'vitest'
import { pickGameLine, shouldSpeakGameEvent } from '../shared/game-dialogue'

describe('shouldSpeakGameEvent', () => {
  it('always allows start and results, and throttles the rest', () => {
    const last = new Map()
    expect(shouldSpeakGameEvent('player_win', 'low', last, 0)).toBe(true)
    expect(shouldSpeakGameEvent('player_good_move', 'low', last, 1000)).toBe(true)
    expect(shouldSpeakGameEvent('player_good_move', 'low', last, 2000)).toBe(false)
    expect(shouldSpeakGameEvent('player_good_move', 'low', last, 16_000)).toBe(true)
  })
})

describe('pickGameLine', () => {
  it('uses the taunt bucket and skips result game_over (already spoken)', () => {
    expect(pickGameLine('player_win', 0, undefined, () => 0)?.text).toContain('赢')
    expect(pickGameLine('player_lose', 3, undefined, () => 0)?.emotion).toBe('angry')
    expect(pickGameLine('game_over', 1, 'win', () => 0)).toBeNull()
    expect(pickGameLine('game_over', 0, 'draw', () => 0)?.text).toContain('平')
  })
})
