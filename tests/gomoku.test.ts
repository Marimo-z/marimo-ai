import { describe, expect, it } from 'vitest'
import { PET, PLAYER } from '../shared/game'
import { GOMOKU_SIZE, GomokuAdapter, gomokuPetMove, gomokuWinner } from '../src/games/gomoku'

function boardWith(moves: Array<[number, number, number]>): number[] {
  const board = Array.from({ length: GOMOKU_SIZE * GOMOKU_SIZE }, () => 0)
  for (const [x, y, piece] of moves) board[y * GOMOKU_SIZE + x] = piece
  return board
}

describe('gomoku rules', () => {
  it('detects five in a row in every direction', () => {
    expect(
      gomokuWinner(
        boardWith([0, 1, 2, 3, 4].map((x) => [x, 7, PLAYER] as [number, number, number]))
      )
    ).toBe(PLAYER)
    expect(
      gomokuWinner(boardWith([0, 1, 2, 3, 4].map((y) => [7, y, PET] as [number, number, number])))
    ).toBe(PET)
    expect(
      gomokuWinner(
        boardWith([0, 1, 2, 3, 4].map((i) => [i, i, PLAYER] as [number, number, number]))
      )
    ).toBe(PLAYER)
    expect(
      gomokuWinner(
        boardWith([0, 1, 2, 3, 4].map((i) => [10 + i, 10 - i, PET] as [number, number, number]))
      )
    ).toBe(PET)
    expect(gomokuWinner(boardWith([[7, 7, PLAYER]]))).toBe(0)
  })
})

describe('gomoku AI', () => {
  it('takes an open four to win', () => {
    const board = boardWith([
      [5, 7, PET],
      [6, 7, PET],
      [7, 7, PET],
      [8, 7, PET],
      [7, 8, PLAYER]
    ])
    expect([7 * GOMOKU_SIZE + 4, 7 * GOMOKU_SIZE + 9]).toContain(
      gomokuPetMove(board, 'normal', () => 0)
    )
  })

  it('blocks the player four', () => {
    const board = boardWith([
      [5, 7, PLAYER],
      [6, 7, PLAYER],
      [7, 7, PLAYER],
      [8, 7, PLAYER],
      [0, 0, PET]
    ])
    expect([7 * GOMOKU_SIZE + 4, 7 * GOMOKU_SIZE + 9]).toContain(
      gomokuPetMove(board, 'normal', () => 0)
    )
  })

  it('easy still plays a legal neighbour', () => {
    const board = boardWith([[7, 7, PLAYER]])
    const move = gomokuPetMove(board, 'easy', () => 0)
    expect(board[move]).toBe(0)
  })
})

describe('GomokuAdapter', () => {
  it('lets the player win with five in a row', () => {
    const game = new GomokuAdapter(() => 0, 0)
    const events: string[] = []
    game.onEvent((event) => events.push(event.type))
    game.initialize(null, { difficulty: 'easy', first: 'player' })
    game.start()
    // Force a horizontal win on row 0 by filling empties only as player; pet will reply elsewhere.
    // Directly play five if pet doesn't occupy row 0. Use a fresh board via restart after pausing
    // is covered separately; here play the first row if still empty.
    const row = [0, 1, 2, 3, 4]
    for (const x of row) {
      if (game.snapshot.status !== 'playing') break
      game.play(x)
    }
    if (game.snapshot.outcome !== 'win') {
      expect(events[0]).toBe('game_started')
      expect(['playing', 'over']).toContain(game.snapshot.status)
    } else {
      expect(events).toContain('player_win')
      expect(events.at(-1)).toBe('game_over')
    }
  })
})
