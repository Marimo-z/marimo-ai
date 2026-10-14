import { describe, expect, it } from 'vitest'
import {
  buildTankMap,
  createTankSim,
  IDLE_INPUT,
  MAP_SIZE,
  stepTank,
  TankSession,
  tankPlan,
  TILE_EMPTY
} from '../src/games/tank'

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RANGE = ['#####', '#P.E#', '#B..#', '#...#', '#####']

describe('tank plan', () => {
  it('scales enemy count and health with difficulty', () => {
    expect(tankPlan('easy')).toEqual({ count: 2, hp: 1 })
    expect(tankPlan('hard')).toEqual({ count: 4, hp: 2 })
    expect(createTankSim('easy').tanks.filter((unit) => unit.side === 'enemy')).toHaveLength(2)
    expect(createTankSim('hard').tanks.find((unit) => unit.side === 'enemy')?.hp).toBe(2)
  })
})

describe('tank rules', () => {
  it('breaks bricks, stops on steel, and cannot drive through a wall', () => {
    const sim = createTankSim('easy', RANGE)
    const player = sim.tanks[0]
    expect(player).toBeDefined()
    if (!player) return
    player.dir = 2
    stepTank(sim, { ...IDLE_INPUT, fire: true }, 0.05, 'easy', () => 0)
    expect(sim.tiles[2 * sim.width + 1]).toBe(0)

    player.dir = 3
    const before = player.x
    for (let i = 0; i < 30; i++) stepTank(sim, { ...IDLE_INPUT, left: true }, 0.05, 'easy', () => 0)
    expect(player.x).toBeGreaterThan(1)
    expect(player.x).toBeLessThan(before)

    sim.shots.push({ x: 0.5, y: 1.5, dir: 3, side: 'player' })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 0)
    expect(sim.tiles[1 * sim.width + 0]).toBe(2)
  })

  it('a player shot defeats the last enemy', () => {
    const sim = createTankSim('easy', RANGE)
    const player = sim.tanks[0]
    const enemy = sim.tanks.find((unit) => unit.side === 'enemy')
    expect(player && enemy).toBeTruthy()
    if (!player || !enemy) return
    player.dir = 1
    let notes: string[] = []
    for (let i = 0; i < 12 && enemy.alive; i++) {
      notes = stepTank(sim, { ...IDLE_INPUT, fire: i === 0 }, 0.05, 'easy', () => 0)
    }
    expect(enemy.alive).toBe(false)
    expect(notes).toContain('player_good_move')
    expect(sim.outcome).toBe('win')
  })

  it('enemy shots drain the player and end the match', () => {
    const sim = createTankSim('easy', RANGE)
    const player = sim.tanks[0]
    expect(player).toBeDefined()
    if (!player) return
    for (let i = 0; i < 3; i++) {
      player.hurt = 0
      sim.shots.push({ x: player.x, y: player.y - 0.15, dir: 2, side: 'enemy' })
      stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    }
    expect(player.alive).toBe(false)
    expect(sim.outcome).toBe('lose')
  })
})

describe('tank arena', () => {
  it('builds a larger map whose spawns stay connected', () => {
    for (const seed of [1, 7, 42]) {
      const rows = buildTankMap(mulberry32(seed))
      expect(rows).toHaveLength(MAP_SIZE)
      expect(rows[0]?.startsWith('#')).toBe(true)
      expect(rows.some((row) => row.includes('B'))).toBe(true)
      const player = findChar(rows, 'P')
      const enemies = findAll(rows, 'E')
      expect(player).toBeTruthy()
      expect(enemies.length).toBeGreaterThanOrEqual(4)
      for (const slot of enemies) expect(openTo(rows, player!, slot)).toBe(true)
    }
  })

  it('slides past a brick corner instead of sticking', () => {
    const map = ['#######', '#.....#', '#.....#', '#..B..#', '#.....#', '#P....#', '#######']
    const sim = createTankSim('easy', map)
    const player = sim.tanks[0]
    expect(player).toBeDefined()
    if (!player) return
    player.x = 2.15
    player.y = 3.2
    sim.tanks.push({
      ...player,
      side: 'enemy',
      x: 5.5,
      y: 1.5,
      hp: 3,
      alive: true
    })
    sim.frozen = 30
    const start = player.x
    for (let i = 0; i < 40; i++) {
      stepTank(sim, { ...IDLE_INPUT, right: true }, 0.05, 'easy', () => 1)
    }
    expect(player.x).toBeGreaterThan(start + 1.2)
    expect(player.alive).toBe(true)
  })

  it('lets overlapping tanks move apart', () => {
    const sim = createTankSim('easy', RANGE)
    const player = sim.tanks[0]
    const enemy = sim.tanks.find((unit) => unit.side === 'enemy')
    expect(player && enemy).toBeTruthy()
    if (!player || !enemy) return
    enemy.x = player.x + 0.2
    enemy.y = player.y
    const before = Math.abs(enemy.x - player.x)
    for (let i = 0; i < 8; i++) stepTank(sim, { ...IDLE_INPUT, left: true }, 0.05, 'easy', () => 1)
    expect(Math.abs(enemy.x - player.x)).toBeGreaterThan(before + 0.3)
  })

  it('applies star, shield, freeze, life, and grenade pickups', () => {
    const sim = createTankSim('easy', RANGE)
    const player = sim.tanks[0]
    const enemy = sim.tanks.find((unit) => unit.side === 'enemy')
    expect(player && enemy).toBeTruthy()
    if (!player || !enemy) return
    sim.pickups.push({ x: player.x, y: player.y, kind: 'star', life: 10 })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    expect(sim.stars).toBe(1)

    sim.pickups.push({ x: player.x, y: player.y, kind: 'helmet', life: 10 })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    expect(sim.shield).toBeGreaterThan(7)
    sim.shots.push({ x: player.x, y: player.y - 0.15, dir: 2, side: 'enemy' })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    expect(player.hp).toBe(3)

    sim.shield = 0
    sim.pickups.push({ x: player.x, y: player.y, kind: 'clock', life: 10 })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 0)
    expect(sim.frozen).toBeGreaterThan(5)
    const frozenAt = enemy.x
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 0)
    expect(enemy.x).toBe(frozenAt)

    sim.frozen = 0
    sim.pickups.push({ x: player.x, y: player.y, kind: 'life', life: 10 })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    expect(player.hp).toBe(4)

    sim.pickups.push({ x: player.x, y: player.y, kind: 'grenade', life: 10 })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    expect(enemy.alive).toBe(false)
    expect(sim.outcome).toBe('win')
  })

  it('pushes a tank back out of a wall', () => {
    const sim = createTankSim('easy', RANGE)
    const player = sim.tanks[0]
    expect(player).toBeDefined()
    if (!player) return
    player.x = 0.7
    stepTank(sim, { ...IDLE_INPUT, right: true }, 0.05, 'easy', () => 1)
    expect(player.x).toBeGreaterThan(1)
  })

  it('lets a two-star shell break steel', () => {
    const sim = createTankSim('easy', RANGE)
    sim.stars = 2
    sim.shots.push({ x: 0.5, y: 1.5, dir: 3, side: 'player' })
    stepTank(sim, IDLE_INPUT, 0.05, 'easy', () => 1)
    expect(sim.tiles[1 * sim.width + 0]).toBe(TILE_EMPTY)
  })
})

function findChar(rows: readonly string[], ch: string): { x: number; y: number } | null {
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y]?.indexOf(ch) ?? -1
    if (x >= 0) return { x, y }
  }
  return null
}

function findAll(rows: readonly string[], ch: string): Array<{ x: number; y: number }> {
  const found: Array<{ x: number; y: number }> = []
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < row.length; x++) if (row[x] === ch) found.push({ x, y })
  }
  return found
}

function openTo(
  rows: readonly string[],
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  const n = rows.length
  const seen = new Uint8Array(n * n)
  const queue = [from.x + from.y * n]
  seen[from.x + from.y * n] = 1
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] ?? 0
    const x = cur % n
    const y = Math.floor(cur / n)
    if (x === to.x && y === to.y) return true
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue
      const id = nx + ny * n
      if (seen[id]) continue
      const cell = rows[ny]?.[nx]
      if (cell === '#' || cell === 'B') continue
      seen[id] = 1
      queue.push(id)
    }
  }
  return false
}

describe('TankSession', () => {
  it('ignores input while paused and reports the result once', () => {
    const events: string[] = []
    const game = new TankSession(() => 1)
    game.onEvent((event) => events.push(event.type))
    game.initialize(null, { difficulty: 'easy', first: 'player' })
    game.start()
    game.pause()
    const x = game.sim.tanks[0]?.x
    game.tick({ ...IDLE_INPUT, right: true }, 0.05)
    expect(game.sim.tanks[0]?.x).toBe(x)
    game.sim.tanks.forEach((unit) => {
      if (unit.side === 'enemy') unit.alive = false
    })
    game.resume()
    game.tick(IDLE_INPUT, 0.05)
    game.tick(IDLE_INPUT, 0.05)
    expect(events.filter((type) => type === 'game_over')).toHaveLength(1)
    expect(events.at(-1)).toBe('game_over')
  })
})
