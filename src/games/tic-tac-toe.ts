import { PET, PLAYER, type GameEvent, type Piece, type PlayableGameId } from '../../shared/game'
import type { GameDifficulty } from '../../shared/settings'
import type { EventHandler, GameAdapter, GameStartOptions, GameStatus } from './adapter'
import { emptyCells, outcomeOf, pickIndex, place } from './board'

export const TTT_SIZE = 3
export const TTT_CELLS = 9

const LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
]

const CENTER = 4
const CORNERS = [0, 2, 6, 8]

export function tttWinner(board: readonly number[]): Piece {
  for (const line of LINES) {
    const a = board[line[0]]
    if (a !== 0 && a === board[line[1]] && a === board[line[2]]) return a as Piece
  }
  return 0
}

/** Empty cell that would complete a line for `piece`. */
export function tttWinningMove(board: readonly number[], piece: Piece): number | null {
  for (const line of LINES) {
    const cells = line.map((i) => board[i])
    const owned = cells.filter((c) => c === piece).length
    const empty = cells.filter((c) => c === 0).length
    if (owned === 2 && empty === 1) return line[cells.indexOf(0)]
  }
  return null
}

export function tttHasThreat(board: readonly number[], piece: Piece): boolean {
  return tttWinningMove(board, piece) !== null
}

function scoreMinimax(board: readonly number[], turn: Piece): number {
  const winner = tttWinner(board)
  if (winner === PET) return 10
  if (winner === PLAYER) return -10
  const moves = emptyCells(board)
  if (moves.length === 0) return 0
  if (turn === PET) {
    let best = -Infinity
    for (const move of moves) best = Math.max(best, scoreMinimax(place(board, move, PET), PLAYER))
    return best
  }
  let best = Infinity
  for (const move of moves) best = Math.min(best, scoreMinimax(place(board, move, PLAYER), PET))
  return best
}

export function tttPetMove(
  board: readonly number[],
  difficulty: GameDifficulty,
  rng: () => number
): number {
  const moves = emptyCells(board)
  if (moves.length === 0) throw new Error('棋盘已满')

  if (difficulty === 'easy') return pickIndex(moves, rng)

  const win = tttWinningMove(board, PET)
  if (win !== null) return win
  const block = tttWinningMove(board, PLAYER)
  if (block !== null) return block

  if (difficulty === 'normal') {
    if (board[CENTER] === 0) return CENTER
    const corners = CORNERS.filter((i) => board[i] === 0)
    if (corners.length > 0) return pickIndex(corners, rng)
    return pickIndex(moves, rng)
  }

  let bestScore = -Infinity
  const best: number[] = []
  for (const move of moves) {
    const score = scoreMinimax(place(board, move, PET), PLAYER)
    if (score > bestScore) {
      bestScore = score
      best.length = 0
      best.push(move)
    } else if (score === bestScore) best.push(move)
  }
  return pickIndex(best, rng)
}

export interface TicTacToeSnapshot {
  board: number[]
  turn: Piece
  status: GameStatus
  outcome: 'win' | 'lose' | 'draw' | null
}

export class TicTacToeAdapter implements GameAdapter {
  readonly gameId: PlayableGameId = 'tic-tac-toe'
  private difficulty: GameDifficulty = 'normal'
  private first: 'player' | 'pet' = 'player'
  private board: number[] = Array.from({ length: TTT_CELLS }, () => 0)
  private turn: Piece = PLAYER
  private status: GameStatus = 'idle'
  private outcome: 'win' | 'lose' | 'draw' | null = null
  private startedAt = 0
  private handler: EventHandler | null = null
  private petTimer: ReturnType<typeof setTimeout> | null = null
  private readonly rng: () => number
  private readonly delayMs: number

  constructor(rng: () => number = Math.random, delayMs = 320) {
    this.rng = rng
    this.delayMs = delayMs
  }

  get snapshot(): TicTacToeSnapshot {
    return {
      board: this.board.slice(),
      turn: this.turn,
      status: this.status,
      outcome: this.outcome
    }
  }

  initialize(_container: unknown, options: GameStartOptions): void {
    this.difficulty = options.difficulty
    this.first = options.first
  }

  onEvent(handler: EventHandler): void {
    this.handler = handler
  }

  setDifficulty(level: GameDifficulty): void {
    this.difficulty = level
  }

  start(): void {
    this.clearTimer()
    this.board = Array.from({ length: TTT_CELLS }, () => 0)
    this.turn = this.first === 'pet' ? PET : PLAYER
    this.status = 'playing'
    this.outcome = null
    this.startedAt = Date.now()
    this.emit('game_started')
    if (this.turn === PET) this.queuePet()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.clearTimer()
    this.status = 'paused'
    this.emit('game_paused')
  }

  resume(): void {
    if (this.status !== 'paused') return
    this.status = 'playing'
    this.emit('turn_started')
    if (this.turn === PET) this.queuePet()
  }

  restart(): void {
    this.start()
  }

  destroy(): void {
    this.clearTimer()
    this.status = 'idle'
    this.handler = null
  }

  play(index: number): boolean {
    if (this.status !== 'playing' || this.turn !== PLAYER) return false
    if (!Number.isInteger(index) || index < 0 || index >= TTT_CELLS || this.board[index] !== 0) {
      return false
    }
    const missed = tttHasThreat(this.board, PET) && tttWinningMove(this.board, PET) !== index
    this.board = place(this.board, index, PLAYER)
    if (missed) this.emit('player_mistake')
    else if (tttHasThreat(this.board, PLAYER)) this.emit('player_good_move')
    return this.afterMove()
  }

  private afterMove(): boolean {
    const winner = tttWinner(this.board)
    const finished = outcomeOf(winner, emptyCells(this.board).length === 0)
    if (finished) {
      this.outcome = finished
      this.status = 'over'
      if (finished === 'win') this.emit('player_win')
      else if (finished === 'lose') this.emit('player_lose')
      this.emit('game_over')
      return true
    }
    this.turn = this.turn === PLAYER ? PET : PLAYER
    this.emit('turn_started')
    if (this.turn === PET) this.queuePet()
    return true
  }

  private queuePet(): void {
    this.clearTimer()
    if (this.delayMs <= 0) {
      this.doPetMove()
      return
    }
    this.petTimer = setTimeout(() => this.doPetMove(), this.delayMs)
  }

  private doPetMove(): void {
    this.petTimer = null
    if (this.status !== 'playing' || this.turn !== PET) return
    const move = tttPetMove(this.board, this.difficulty, this.rng)
    this.board = place(this.board, move, PET)
    this.afterMove()
  }

  private clearTimer(): void {
    if (this.petTimer) clearTimeout(this.petTimer)
    this.petTimer = null
  }

  private emit(type: GameEvent['type']): void {
    this.handler?.({
      type,
      gameId: this.gameId,
      difficulty: this.difficulty,
      first: this.first,
      startedAt: this.startedAt,
      ...(type === 'game_over' && this.outcome ? { outcome: this.outcome } : {})
    })
  }
}
