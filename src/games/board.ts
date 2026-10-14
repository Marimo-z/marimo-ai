import { PET, PLAYER, type Piece } from '../../shared/game'

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
] as const

export function cell(board: readonly number[], size: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= size || y >= size) return -1
  return board[y * size + x]
}

/** First piece that occupies `need` consecutive cells in any direction. */
export function lineWinner(board: readonly number[], size: number, need: number): Piece {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const piece = cell(board, size, x, y)
      if (piece !== PLAYER && piece !== PET) continue
      for (const [dx, dy] of DIRS) {
        let n = 1
        let px = x + dx
        let py = y + dy
        while (cell(board, size, px, py) === piece) {
          n++
          if (n >= need) return piece
          px += dx
          py += dy
        }
      }
    }
  }
  return 0
}

export function emptyCells(board: readonly number[]): number[] {
  const moves: number[] = []
  for (let i = 0; i < board.length; i++) if (board[i] === 0) moves.push(i)
  return moves
}

export function place(board: readonly number[], index: number, piece: Piece): number[] {
  const next = board.slice()
  next[index] = piece
  return next
}

export function outcomeOf(winner: Piece, full: boolean): 'win' | 'lose' | 'draw' | null {
  if (winner === PLAYER) return 'win'
  if (winner === PET) return 'lose'
  if (full) return 'draw'
  return null
}

export function pickIndex(items: readonly number[], rng: () => number): number {
  if (items.length === 0) throw new Error('no moves')
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}
