import { describe, expect, it } from 'vitest'
import { PET, PLAYER } from '../shared/game'
import {
  TicTacToeAdapter,
  tttHasThreat,
  tttPetMove,
  tttWinner,
  tttWinningMove
} from '../src/games/tic-tac-toe'

const X = PLAYER
const O = PET

describe('tic-tac-toe rules', () => {
  it('detects rows, columns and diagonals', () => {
    expect(tttWinner([X, X, X, 0, O, 0, 0, O, 0])).toBe(X)
    expect(tttWinner([X, O, 0, X, O, 0, X, 0, 0])).toBe(X)
    expect(tttWinner([O, 0, X, 0, O, X, 0, 0, O])).toBe(O)
    expect(tttWinner([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0)
  })

  it('finds a winning block', () => {
    expect(tttWinningMove([X, X, 0, 0, O, 0, 0, 0, 0], X)).toBe(2)
    expect(tttHasThreat([X, X, 0, 0, O, 0, 0, 0, 0], X)).toBe(true)
  })
})

describe('tic-tac-toe AI', () => {
  it('easy only plays empty cells', () => {
    const board = [X, 0, O, 0, X, 0, 0, 0, O]
    for (let i = 0; i < 20; i++) {
      const move = tttPetMove(board, 'easy', () => i / 20)
      expect(board[move]).toBe(0)
    }
  })

  it('normal wins and blocks', () => {
    expect(tttPetMove([O, O, 0, X, X, 0, 0, 0, 0], 'normal', () => 0)).toBe(2)
    expect(tttPetMove([X, X, 0, 0, O, 0, 0, 0, 0], 'normal', () => 0)).toBe(2)
  })

  it('hard never loses against a random player', () => {
    for (let seed = 0; seed < 40; seed++) {
      let rngState = seed + 1
      const rng = (): number => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
        return rngState / 0x7fffffff
      }
      const game = new TicTacToeAdapter(rng, 0)
      game.initialize(null, { difficulty: 'hard', first: seed % 2 === 0 ? 'player' : 'pet' })
      game.start()
      let guard = 0
      while (game.snapshot.status === 'playing' && guard++ < 20) {
        const empties = game.snapshot.board
          .map((cell, index) => (cell === 0 ? index : -1))
          .filter((index) => index >= 0)
        game.play(empties[Math.floor(rng() * empties.length)] ?? empties[0])
      }
      expect(game.snapshot.outcome).not.toBe('win')
    }
  })
})

describe('TicTacToeAdapter', () => {
  it('starts, pauses, resumes and ignores moves while paused', () => {
    const events: string[] = []
    const game = new TicTacToeAdapter(() => 0, 0)
    game.onEvent((event) => events.push(event.type))
    game.initialize(null, { difficulty: 'easy', first: 'player' })
    game.start()
    game.pause()
    expect(game.snapshot.status).toBe('paused')
    expect(game.play(0)).toBe(false)
    game.resume()
    expect(game.play(0)).toBe(true)
    expect(game.snapshot.board[0]).toBe(PLAYER)
    expect(events).toEqual(expect.arrayContaining(['game_started', 'game_paused', 'turn_started']))
  })
})
