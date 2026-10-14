import type { GameEvent } from '../../shared/game'
import type { GameDifficulty } from '../../shared/settings'
import type { EventHandler, GameAdapter, GameStartOptions, GameStatus } from './adapter'

export const TANK_DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
] as const
export type TankDir = 0 | 1 | 2 | 3

export const TILE_EMPTY = 0
export const TILE_BRICK = 1
export const TILE_STEEL = 2

export const MAP_SIZE = 21
export const PLAYER_HP = 3
export const MAX_HP = 5

const PLAYER_SPEED = 3.1
const PLAYER_FIRE = 0.38
const BULLET_SPEED = 8
const BODY = 0.34
const GAP = BODY * 2
const HURT_TIME = 0.7
const PICKUP_LIFE = 16
const SHIELD_TIME = 8
const FREEZE_TIME = 6

const PLAN: Record<
  GameDifficulty,
  { count: number; hp: number; speed: number; fire: number; aim: number }
> = {
  easy: { count: 2, hp: 1, speed: 1.45, fire: 1.5, aim: 0.4 },
  normal: { count: 3, hp: 1, speed: 2, fire: 1, aim: 0.75 },
  hard: { count: 4, hp: 2, speed: 2.5, fire: 0.62, aim: 1 }
}

export const PICKUP_KINDS = ['star', 'helmet', 'clock', 'grenade', 'life'] as const
export type PickupKind = (typeof PICKUP_KINDS)[number]

export interface TankInput {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  fire: boolean
}

export interface TankUnit {
  x: number
  y: number
  dir: TankDir
  hp: number
  cooldown: number
  hurt: number
  hold: number
  side: 'player' | 'enemy'
  alive: boolean
}

export interface TankShot {
  x: number
  y: number
  dir: TankDir
  side: 'player' | 'enemy'
}

export interface TankPickup {
  x: number
  y: number
  kind: PickupKind
  life: number
}

export interface TankSim {
  width: number
  height: number
  tiles: number[]
  tanks: TankUnit[]
  shots: TankShot[]
  pickups: TankPickup[]
  stars: number
  shield: number
  frozen: number
  status: GameStatus
  outcome: 'win' | 'lose' | null
}

export type TankNotice = 'player_damaged' | 'player_good_move'

export const IDLE_INPUT: TankInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  fire: false
}

export function tankPlan(difficulty: GameDifficulty): { count: number; hp: number } {
  return { count: PLAN[difficulty].count, hp: PLAN[difficulty].hp }
}

/** Random arena: steel border, brick and steel cover, open lanes to every spawn. */
export function buildTankMap(rng: () => number): string[] {
  const n = MAP_SIZE
  const rows = Array.from({ length: n }, () => Array.from({ length: n }, () => '.'))
  for (let i = 0; i < n; i++) {
    rows[0][i] = '#'
    rows[n - 1][i] = '#'
    rows[i][0] = '#'
    rows[i][n - 1] = '#'
  }
  const player = { x: Math.floor(n / 2), y: n - 3 }
  const enemies = [
    { x: 2, y: 2 },
    { x: n - 3, y: 2 },
    { x: Math.floor(n / 2), y: 2 },
    { x: Math.floor(n / 2) - 4, y: 4 }
  ]
  const reserved = new Set<string>()
  const reserve = (cx: number, cy: number): void => {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) reserved.add(`${x},${y}`)
    }
  }
  reserve(player.x, player.y)
  for (const slot of enemies) reserve(slot.x, slot.y)

  for (let k = 0; k < 16; k++) {
    const x = 2 + Math.floor(rng() * (n - 5))
    const y = 2 + Math.floor(rng() * (n - 5))
    const steel = rng() < 0.2
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) stamp(rows, reserved, x + dx, y + dy, steel ? '#' : 'B')
    }
  }
  for (let k = 0; k < 7; k++) {
    const horizontal = rng() < 0.5
    const x = 2 + Math.floor(rng() * (n - 6))
    const y = 2 + Math.floor(rng() * (n - 6))
    const len = 3 + Math.floor(rng() * 3)
    for (let i = 0; i < len; i++) {
      stamp(
        rows,
        reserved,
        horizontal ? x + i : x,
        horizontal ? y : y + i,
        rng() < 0.16 ? '#' : 'B'
      )
    }
  }

  for (const slot of enemies) openPath(rows, slot, player)
  rows[player.y][player.x] = 'P'
  for (const slot of enemies) rows[slot.y][slot.x] = 'E'
  return rows.map((row) => row.join(''))
}

function stamp(
  rows: string[][],
  reserved: ReadonlySet<string>,
  x: number,
  y: number,
  tile: '#' | 'B'
): void {
  const n = rows.length
  if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) return
  if (reserved.has(`${x},${y}`)) return
  rows[y][x] = tile
}

function openPath(
  rows: string[][],
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  if (reachable(rows, from, to)) return
  let x = from.x
  let y = from.y
  const guard = rows.length * rows.length
  for (let i = 0; i < guard && (x !== to.x || y !== to.y); i++) {
    clearInterior(rows, x, y)
    if (Math.abs(to.x - x) >= Math.abs(to.y - y)) x += Math.sign(to.x - x)
    else y += Math.sign(to.y - y)
  }
  clearInterior(rows, to.x, to.y)
}

function clearInterior(rows: string[][], x: number, y: number): void {
  const n = rows.length
  if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) return
  rows[y][x] = '.'
}

function reachable(
  rows: readonly string[][],
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  const n = rows.length
  const seen = new Uint8Array(n * n)
  const queue = [from.x + from.y * n]
  seen[from.x + from.y * n] = 1
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ] as const
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] ?? 0
    const x = cur % n
    const y = Math.floor(cur / n)
    if (x === to.x && y === to.y) return true
    for (const [dx, dy] of steps) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue
      const id = nx + ny * n
      if (seen[id]) continue
      const ch = rows[ny]?.[nx]
      if (ch === '#' || ch === 'B') continue
      seen[id] = 1
      queue.push(id)
    }
  }
  return false
}

export function createTankSim(
  difficulty: GameDifficulty,
  map?: readonly string[],
  rng: () => number = Math.random
): TankSim {
  const generated = map === undefined
  const rows = map ?? buildTankMap(rng)
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const tiles: number[] = []
  const slots: Array<{ x: number; y: number }> = []
  let playerAt = { x: 1.5, y: height - 1.5 }
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '#'
      if (ch === 'B') tiles.push(TILE_BRICK)
      else if (ch === '#') tiles.push(TILE_STEEL)
      else tiles.push(TILE_EMPTY)
      if (ch === 'E') slots.push({ x: x + 0.5, y: y + 0.5 })
      if (ch === 'P') playerAt = { x: x + 0.5, y: y + 0.5 }
    }
  }
  const plan = PLAN[difficulty]
  const tanks: TankUnit[] = [unitAt(playerAt.x, playerAt.y, 0, PLAYER_HP, 0, 'player')]
  for (const slot of slots.slice(0, plan.count)) {
    tanks.push(unitAt(slot.x, slot.y, 2, plan.hp, 0.4, 'enemy'))
  }
  const sim: TankSim = {
    width,
    height,
    tiles,
    tanks,
    shots: [],
    pickups: [],
    stars: 0,
    shield: 0,
    frozen: 0,
    status: 'playing',
    outcome: null
  }
  if (generated) placeOpeningPickup(sim, rng)
  return sim
}

function unitAt(
  x: number,
  y: number,
  dir: TankDir,
  hp: number,
  cooldown: number,
  side: TankUnit['side']
): TankUnit {
  return { x, y, dir, hp, cooldown, hurt: 0, hold: 0, side, alive: true }
}

function placeOpeningPickup(sim: TankSim, rng: () => number): void {
  const player = sim.tanks[0]
  if (!player) return
  const spots: Array<{ x: number; y: number }> = []
  for (let y = 1; y < sim.height - 1; y++) {
    for (let x = 1; x < sim.width - 1; x++) {
      if (tileAt(sim, x + 0.5, y + 0.5) !== TILE_EMPTY) continue
      if (Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) < 4) continue
      spots.push({ x: x + 0.5, y: y + 0.5 })
    }
  }
  if (spots.length === 0) return
  const spot = spots[Math.floor(rng() * spots.length) % spots.length]
  if (!spot) return
  sim.pickups.push({ x: spot.x, y: spot.y, kind: pickKind(rng), life: PICKUP_LIFE })
}

function pickKind(rng: () => number): PickupKind {
  return PICKUP_KINDS[Math.floor(rng() * PICKUP_KINDS.length) % PICKUP_KINDS.length] ?? 'star'
}

function tileAt(sim: TankSim, x: number, y: number): number {
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= sim.width || ty >= sim.height) return TILE_STEEL
  return sim.tiles[ty * sim.width + tx] ?? TILE_STEEL
}

function hitsWall(sim: TankSim, x: number, y: number): boolean {
  return wallPen(sim, x, y) > 0
}

function wallPen(sim: TankSim, x: number, y: number): number {
  const left = x - BODY
  const right = x + BODY
  const top = y - BODY
  const bottom = y + BODY
  const x0 = Math.floor(left + 1e-4)
  const x1 = Math.floor(right - 1e-4)
  const y0 = Math.floor(top + 1e-4)
  const y1 = Math.floor(bottom - 1e-4)
  let pen = 0
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx >= 0 && ty >= 0 && tx < sim.width && ty < sim.height) {
        const tile = sim.tiles[ty * sim.width + tx] ?? TILE_STEEL
        if (tile === TILE_EMPTY) continue
      }
      const ox = Math.min(right, tx + 1) - Math.max(left, tx)
      const oy = Math.min(bottom, ty + 1) - Math.max(top, ty)
      if (ox > 0 && oy > 0) pen += ox * oy
    }
  }
  return pen
}

function overlapAmount(x: number, y: number, other: TankUnit): number {
  const ox = GAP - Math.abs(x - other.x)
  const oy = GAP - Math.abs(y - other.y)
  if (ox <= 0 || oy <= 0) return 0
  return Math.min(ox, oy)
}

function tankBlocks(tanks: readonly TankUnit[], self: TankUnit, x: number, y: number): boolean {
  for (const other of tanks) {
    if (other === self || !other.alive) continue
    const next = overlapAmount(x, y, other)
    if (next <= 0) continue
    const prev = overlapAmount(self.x, self.y, other)
    if (prev <= 0 || next >= prev - 1e-4) return true
  }
  return false
}

function fits(sim: TankSim, unit: TankUnit, x: number, y: number): boolean {
  if (hitsWall(sim, x, y)) {
    if (wallPen(sim, x, y) >= wallPen(sim, unit.x, unit.y) - 1e-4) return false
  }
  return !tankBlocks(sim.tanks, unit, x, y)
}

/**
 * If only one front corner meets a wall, slide sideways onto the open lane.
 * Same idea as Battle City turn-assist: a tank between two tile lines should
 * slip into the gap instead of catching the corner and stopping forever.
 */
function cornerNudge(sim: TankSim, x: number, y: number, dir: TankDir): number {
  const vec = TANK_DIRS[dir]
  const alongX = vec.x !== 0
  const front = alongX ? x + vec.x * BODY : y + vec.y * BODY
  const side = alongX ? y : x
  const solid = (corner: number): boolean => {
    const px = alongX ? front : corner
    const py = alongX ? corner : front
    return tileAt(sim, px, py) !== TILE_EMPTY
  }
  const low = solid(side - BODY)
  const high = solid(side + BODY)
  if (low === high) return 0
  const corner = low ? side - BODY : side + BODY
  const edge = low ? Math.floor(corner) + 1 : Math.floor(corner)
  const need = (low ? edge - corner : corner - edge) + 0.02
  const toward = low ? 1 : -1
  return toward * Math.min(0.45, Math.max(need, 0.04))
}

function tryMove(sim: TankSim, unit: TankUnit, dir: TankDir, dist: number): boolean {
  const vec = TANK_DIRS[dir]
  unit.dir = dir
  const nx = unit.x + vec.x * dist
  const ny = unit.y + vec.y * dist
  if (fits(sim, unit, nx, ny)) {
    unit.x = nx
    unit.y = ny
    return true
  }
  const nudge = cornerNudge(sim, nx, ny, dir)
  if (nudge !== 0) {
    const px = unit.x + (vec.x === 0 ? nudge : 0)
    const py = unit.y + (vec.y === 0 ? nudge : 0)
    if (fits(sim, unit, px, py)) {
      unit.x = px
      unit.y = py
      const fx = unit.x + vec.x * dist
      const fy = unit.y + vec.y * dist
      if (fits(sim, unit, fx, fy)) {
        unit.x = fx
        unit.y = fy
      }
      return true
    }
  }
  return false
}

function separateTanks(sim: TankSim): void {
  const tanks = sim.tanks.filter((unit) => unit.alive)
  for (let i = 0; i < tanks.length; i++) {
    for (let j = i + 1; j < tanks.length; j++) {
      const a = tanks[i]
      const b = tanks[j]
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const ox = GAP - Math.abs(dx)
      const oy = GAP - Math.abs(dy)
      if (ox <= 0 || oy <= 0) continue
      if (ox < oy) {
        const sign = dx === 0 ? 1 : Math.sign(dx)
        shove(sim, a, b, -sign * (ox / 2 + 0.01), 0)
      } else {
        const sign = dy === 0 ? 1 : Math.sign(dy)
        shove(sim, a, b, 0, -sign * (oy / 2 + 0.01))
      }
    }
  }
}

function shove(sim: TankSim, a: TankUnit, b: TankUnit, dx: number, dy: number): void {
  const ax = a.x + dx
  const ay = a.y + dy
  const bx = b.x - dx
  const by = b.y - dy
  const aOk = !hitsWall(sim, ax, ay)
  const bOk = !hitsWall(sim, bx, by)
  if (aOk && bOk) {
    a.x = ax
    a.y = ay
    b.x = bx
    b.y = by
    return
  }
  if (aOk && !hitsWall(sim, a.x + dx * 2, a.y + dy * 2)) {
    a.x += dx * 2
    a.y += dy * 2
    return
  }
  if (bOk && !hitsWall(sim, b.x - dx * 2, b.y - dy * 2)) {
    b.x -= dx * 2
    b.y -= dy * 2
  }
}

function pushOutOfWalls(sim: TankSim, unit: TankUnit): void {
  const step = 0.05
  const options = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step]
  ] as const
  for (let n = 0; n < 8; n++) {
    const current = wallPen(sim, unit.x, unit.y)
    if (current <= 0) return
    let best = current
    let bx = unit.x
    let by = unit.y
    for (const [dx, dy] of options) {
      const pen = wallPen(sim, unit.x + dx, unit.y + dy)
      if (pen < best) {
        best = pen
        bx = unit.x + dx
        by = unit.y + dy
      }
    }
    if (best >= current) return
    unit.x = bx
    unit.y = by
  }
}

function dirFromInput(input: TankInput, current: TankDir): TankDir | null {
  if (input.up) return 0
  if (input.right) return 1
  if (input.down) return 2
  if (input.left) return 3
  return input.fire ? current : null
}

function shoot(sim: TankSim, unit: TankUnit): void {
  const vec = TANK_DIRS[unit.dir]
  sim.shots.push({
    x: unit.x + vec.x * 0.45,
    y: unit.y + vec.y * 0.45,
    dir: unit.dir,
    side: unit.side
  })
}

function lineOfSight(sim: TankSim, from: TankUnit, to: TankUnit): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const horizontal = Math.abs(dy) < 0.55
  const vertical = Math.abs(dx) < 0.55
  if (!horizontal && !vertical) return false
  const steps = Math.ceil(Math.hypot(dx, dy) * 2)
  for (let i = 1; i < steps; i++) {
    const x = from.x + (dx * i) / steps
    const y = from.y + (dy * i) / steps
    if (tileAt(sim, x, y) !== TILE_EMPTY) return false
  }
  return true
}

function face(from: TankUnit, to: TankUnit): TankDir {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3
  return dy > 0 ? 2 : 0
}

function maybeDrop(sim: TankSim, tx: number, ty: number, rng: () => number): void {
  if (rng() > 0.16 || sim.pickups.length >= 2) return
  const x = tx + 0.5
  const y = ty + 0.5
  if (sim.tanks.some((unit) => unit.alive && Math.hypot(unit.x - x, unit.y - y) < 0.8)) return
  sim.pickups.push({ x, y, kind: pickKind(rng), life: PICKUP_LIFE })
}

function advanceShot(
  sim: TankSim,
  shot: TankShot,
  distance: number,
  notices: TankNotice[],
  rng: () => number
): boolean {
  const vec = TANK_DIRS[shot.dir]
  let left = distance
  while (left > 0) {
    const step = Math.min(0.2, left)
    shot.x += vec.x * step
    shot.y += vec.y * step
    left -= step
    const tx = Math.floor(shot.x)
    const ty = Math.floor(shot.y)
    if (tx < 0 || ty < 0 || tx >= sim.width || ty >= sim.height) return false
    const index = ty * sim.width + tx
    const tile = sim.tiles[index]
    if (tile === TILE_STEEL) {
      if (shot.side === 'player' && sim.stars >= 2) sim.tiles[index] = TILE_EMPTY
      return false
    }
    if (tile === TILE_BRICK) {
      sim.tiles[index] = TILE_EMPTY
      maybeDrop(sim, tx, ty, rng)
      return false
    }
    for (const unit of sim.tanks) {
      if (!unit.alive || unit.side === shot.side) continue
      if (Math.hypot(unit.x - shot.x, unit.y - shot.y) > 0.4) continue
      if (unit.side === 'player' && (unit.hurt > 0 || sim.shield > 0)) return false
      unit.hp -= 1
      if (unit.side === 'player') {
        unit.hurt = HURT_TIME
        notices.push('player_damaged')
      }
      if (unit.hp <= 0) {
        unit.alive = false
        if (unit.side === 'enemy') notices.push('player_good_move')
      }
      return false
    }
  }
  return true
}

function applyPickup(sim: TankSim, kind: PickupKind, notices: TankNotice[]): void {
  const player = sim.tanks.find((unit) => unit.side === 'player' && unit.alive)
  if (!player) return
  if (kind === 'star') sim.stars = Math.min(2, sim.stars + 1)
  else if (kind === 'helmet') sim.shield = SHIELD_TIME
  else if (kind === 'clock') sim.frozen = FREEZE_TIME
  else if (kind === 'life') player.hp = Math.min(MAX_HP, player.hp + 1)
  else {
    for (const unit of sim.tanks) {
      if (unit.side !== 'enemy' || !unit.alive) continue
      unit.hp = 0
      unit.alive = false
      notices.push('player_good_move')
    }
  }
}

function collectPickups(sim: TankSim, slice: number, notices: TankNotice[]): void {
  const player = sim.tanks.find((unit) => unit.side === 'player' && unit.alive)
  sim.pickups = sim.pickups.filter((item) => {
    item.life -= slice
    if (item.life <= 0) return false
    if (player && Math.hypot(player.x - item.x, player.y - item.y) < 0.48) {
      applyPickup(sim, item.kind, notices)
      return false
    }
    return true
  })
}

function enemyDir(sim: TankSim, unit: TankUnit, dir: TankDir): TankDir {
  const turn = [1, 3, 2] as const
  for (const offset of turn) {
    const next = ((dir + offset) % 4) as TankDir
    const vec = TANK_DIRS[next]
    if (fits(sim, unit, unit.x + vec.x * 0.2, unit.y + vec.y * 0.2)) return next
  }
  return ((dir + 2) % 4) as TankDir
}

export function stepTank(
  sim: TankSim,
  input: TankInput,
  dt: number,
  difficulty: GameDifficulty,
  rng: () => number
): TankNotice[] {
  if (sim.status !== 'playing') return []
  const notices: TankNotice[] = []
  const plan = PLAN[difficulty]
  const player = sim.tanks.find((unit) => unit.side === 'player' && unit.alive)
  const slice = Math.min(Math.max(dt, 0), 0.05)
  sim.shield = Math.max(0, sim.shield - slice)
  sim.frozen = Math.max(0, sim.frozen - slice)

  for (const unit of sim.tanks) {
    if (!unit.alive) continue
    unit.cooldown = Math.max(0, unit.cooldown - slice)
    unit.hurt = Math.max(0, unit.hurt - slice)
    if (unit.side === 'player') {
      const dir = dirFromInput(input, unit.dir)
      const moving = input.up || input.down || input.left || input.right
      if (dir !== null && moving) {
        const speed = PLAYER_SPEED * (1 + sim.stars * 0.2)
        tryMove(sim, unit, dir, speed * slice)
      } else if (dir !== null) unit.dir = dir
      if (input.fire && unit.cooldown <= 0) {
        shoot(sim, unit)
        unit.cooldown = PLAYER_FIRE * (sim.stars > 0 ? 0.7 : 1)
      }
      continue
    }
    if (!player || sim.frozen > 0) continue
    unit.hold = Math.max(0, unit.hold - slice)
    const sees = lineOfSight(sim, unit, player)
    if (sees && unit.cooldown <= 0) {
      unit.dir = face(unit, player)
      if (rng() < plan.aim) {
        shoot(sim, unit)
        unit.cooldown = plan.fire
      } else unit.cooldown = 0.25
    }
    const dir = unit.hold > 0 ? unit.dir : sees ? unit.dir : face(unit, player)
    if (!tryMove(sim, unit, dir, plan.speed * slice)) {
      unit.hold = 0.45 + rng() * 0.55
      unit.dir = enemyDir(sim, unit, dir)
    }
  }

  separateTanks(sim)
  for (const unit of sim.tanks) if (unit.alive) pushOutOfWalls(sim, unit)
  sim.shots = sim.shots.filter((shot) => advanceShot(sim, shot, BULLET_SPEED * slice, notices, rng))
  collectPickups(sim, slice, notices)

  const playerAlive = sim.tanks.some((unit) => unit.side === 'player' && unit.alive)
  const enemyAlive = sim.tanks.some((unit) => unit.side === 'enemy' && unit.alive)
  if (!playerAlive) {
    sim.status = 'over'
    sim.outcome = 'lose'
  } else if (!enemyAlive) {
    sim.status = 'over'
    sim.outcome = 'win'
  }
  return notices
}

export class TankSession implements GameAdapter {
  sim: TankSim = createTankSim('normal', undefined, () => 0)
  private difficulty: GameDifficulty = 'normal'
  private first: 'player' | 'pet' = 'player'
  private handler: EventHandler | null = null
  private startedAt = 0
  private readonly rng: () => number

  constructor(rng: () => number = Math.random) {
    this.rng = rng
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
    this.sim = createTankSim(this.difficulty, undefined, this.rng)
    this.startedAt = Date.now()
    this.emit('game_started')
  }

  pause(): void {
    if (this.sim.status !== 'playing') return
    this.sim.status = 'paused'
    this.emit('game_paused')
  }

  resume(): void {
    if (this.sim.status !== 'paused') return
    this.sim.status = 'playing'
  }

  restart(): void {
    this.start()
  }

  destroy(): void {
    this.sim.status = 'idle'
    this.handler = null
  }

  tick(input: TankInput, dt: number): void {
    const before = this.sim.status
    const notices = stepTank(this.sim, input, dt, this.difficulty, this.rng)
    for (const notice of notices) this.emit(notice)
    if (before === 'playing' && this.sim.status === 'over' && this.sim.outcome) {
      this.emit(this.sim.outcome === 'win' ? 'player_win' : 'player_lose')
      this.emit('game_over')
    }
  }

  private emit(type: GameEvent['type']): void {
    if (type === 'game_over' && this.handler && this.sim.outcome) {
      this.handler({
        type,
        gameId: 'tank',
        difficulty: this.difficulty,
        first: this.first,
        startedAt: this.startedAt,
        outcome: this.sim.outcome
      })
      return
    }
    this.handler?.({
      type,
      gameId: 'tank',
      difficulty: this.difficulty,
      first: this.first,
      startedAt: this.startedAt
    })
  }
}
