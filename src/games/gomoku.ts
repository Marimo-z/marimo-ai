import { PET, PLAYER, type GameEvent, type Piece, type PlayableGameId } from '../../shared/game'
import type { GameDifficulty } from '../../shared/settings'
import type { EventHandler, GameAdapter, GameStartOptions, GameStatus } from './adapter'
import { cell, emptyCells, lineWinner, outcomeOf, pickIndex, place } from './board'

export const GOMOKU_SIZE = 15
export const GOMOKU_WIN = 5
export const GOMOKU_CELLS = GOMOKU_SIZE * GOMOKU_SIZE
const CENTER = 7 * GOMOKU_SIZE + 7
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
] as const

export function gomokuWinner(board: readonly number[]): Piece {
  return lineWinner(board, GOMOKU_SIZE, GOMOKU_WIN)
}

export function gomokuNeighbors(board: readonly number[], reach = 2): number[] {
  const seen = new Set<number>()
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) continue
    const x = i % GOMOKU_SIZE
    const y = (i - x) / GOMOKU_SIZE
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GOMOKU_SIZE || ny >= GOMOKU_SIZE) continue
        const n = ny * GOMOKU_SIZE + nx
        if (board[n] === 0) seen.add(n)
      }
    }
  }
  return [...seen]
}

function runLength(
  board: readonly number[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  piece: Piece
): { count: number; open: number } {
  let count = 1
  let open = 0
  let px = x + dx
  let py = y + dy
  while (cell(board, GOMOKU_SIZE, px, py) === piece) {
    count++
    px += dx
    py += dy
  }
  if (cell(board, GOMOKU_SIZE, px, py) === 0) open++
  px = x - dx
  py = y - dy
  while (cell(board, GOMOKU_SIZE, px, py) === piece) {
    count++
    px -= dx
    py -= dy
  }
  if (cell(board, GOMOKU_SIZE, px, py) === 0) open++
  return { count, open }
}

function patternScore(count: number, open: number): number {
  if (count >= 5) return 100_000
  if (count === 4 && open === 2) return 12_000
  if (count === 4 && open === 1) return 2_000
  if (count === 3 && open === 2) return 1_200
  if (count === 3 && open === 1) return 150
  if (count === 2 && open === 2) return 80
  if (count === 2 && open === 1) return 10
  if (count === 1 && open === 2) return 8
  return 0
}

/** Score for placing `piece` at `index` (attack only). */
export function gomokuCellScore(board: readonly number[], index: number, piece: Piece): number {
  const x = index % GOMOKU_SIZE
  const y = (index - x) / GOMOKU_SIZE
  let score = 0
  for (const [dx, dy] of DIRS) {
    const { count, open } = runLength(board, x, y, dx, dy, piece)
    score += patternScore(count, open)
  }
  return score
}

export function gomokuEval(board: readonly number[], index: number): number {
  return (
    gomokuCellScore(board, index, PET) + Math.floor(gomokuCellScore(board, index, PLAYER) * 1.1)
  )
}

function candidates(board: readonly number[]): number[] {
  const near = gomokuNeighbors(board)
  return near.length > 0 ? near : [CENTER]
}

function rankedMoves(board: readonly number[], limit: number): number[] {
  return candidates(board)
    .map((index) => ({ index, score: gomokuEval(board, index) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.index)
}

export function gomokuPetMove(
  board: readonly number[],
  difficulty: GameDifficulty,
  rng: () => number
): number {
  if (emptyCells(board).length === GOMOKU_CELLS) return CENTER
  const immediate = rankedMoves(board, 16)
  for (const move of immediate) {
    if (gomokuWinner(place(board, move, PET)) === PET) return move
  }
  for (const move of immediate) {
    if (gomokuWinner(place(board, move, PLAYER)) === PLAYER) return move
  }

  if (difficulty === 'easy') {
    const pool = rankedMoves(board, 8)
    return pickIndex(pool.length > 0 ? pool : candidates(board), rng)
  }

  if (difficulty === 'normal') return rankedMoves(board, 1)[0] ?? CENTER

  let bestScore = -Infinity
  const best: number[] = []
  const petMoves = rankedMoves(board, 10)
  for (const move of petMoves) {
    const afterPet = place(board, move, PET)
    if (gomokuWinner(afterPet) === PET) return move
    let worst = Infinity
    const replies = rankedMoves(afterPet, 8)
    for (const reply of replies) {
      const after = place(afterPet, reply, PLAYER)
      if (gomokuWinner(after) === PLAYER) {
        worst = -50_000
        break
      }
      const replyScore = gomokuEval(after, reply)
      if (replyScore < worst) worst = replyScore
    }
    const score = gomokuEval(afterPet, move) - (Number.isFinite(worst) ? worst : 0)
    if (score > bestScore) {
      bestScore = score
      best.length = 0
      best.push(move)
    } else if (score === bestScore) best.push(move)
  }
  return pickIndex(best.length > 0 ? best : petMoves, rng)
}

export interface GomokuSnapshot {
  board: number[]
  turn: Piece
  status: GameStatus
  outcome: 'win' | 'lose' | 'draw' | null
  lastMove: number | null
}

export class GomokuAdapter implements GameAdapter {
  readonly gameId: PlayableGameId = 'gomoku'
  private difficulty: GameDifficulty = 'normal'
  private first: 'player' | 'pet' = 'player'
  private board: number[] = Array.from({ length: GOMOKU_CELLS }, () => 0)
  private turn: Piece = PLAYER
  private status: GameStatus = 'idle'
  private outcome: 'win' | 'lose' | 'draw' | null = null
  private lastMove: number | null = null
  private startedAt = 0
  private handler: EventHandler | null = null
  private petTimer: ReturnType<typeof setTimeout> | null = null
  private readonly rng: () => number
  private readonly delayMs: number

  constructor(rng: () => number = Math.random, delayMs = 220) {
    this.rng = rng
    this.delayMs = delayMs
  }

  get snapshot(): GomokuSnapshot {
    return {
      board: this.board.slice(),
      turn: this.turn,
      status: this.status,
      outcome: this.outcome,
      lastMove: this.lastMove
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
    this.board = Array.from({ length: GOMOKU_CELLS }, () => 0)
    this.turn = this.first === 'pet' ? PET : PLAYER
    this.status = 'playing'
    this.outcome = null
    this.lastMove = null
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
    if (!Number.isInteger(index) || index < 0 || index >= GOMOKU_CELLS || this.board[index] !== 0) {
      return false
    }
    this.board = place(this.board, index, PLAYER)
    this.lastMove = index
    if (gomokuCellScore(this.board, index, PLAYER) >= 1_200) this.emit('player_good_move')
    return this.afterMove()
  }

  private afterMove(): boolean {
    const winner = gomokuWinner(this.board)
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
    const move = gomokuPetMove(this.board, this.difficulty, this.rng)
    this.board = place(this.board, move, PET)
    this.lastMove = move
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
