<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { GameDifficulty } from '../../shared/settings'
import GameShell from '../components/games/GameShell.vue'
import { gameBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import {
  MAX_HP,
  TILE_BRICK,
  TILE_STEEL,
  TankSession,
  type PickupKind,
  type TankInput,
  type TankPickup,
  type TankUnit
} from '../games/tank'

const TILE = 26
const router = useRouter()
const store = useSettingsStore()
const difficulty = ref<GameDifficulty>(store.settings.games.defaultDifficulty)
const canvas = ref<HTMLCanvasElement | null>(null)
const session = new TankSession()
const snap = ref(session.sim)
const pressed = new Set<string>()
let frame = 0
let last = 0

const player = computed(() => snap.value.tanks.find((unit) => unit.side === 'player'))
const enemies = computed(
  () => snap.value.tanks.filter((unit) => unit.side === 'enemy' && unit.alive).length
)
const effects = computed(() => {
  const parts: string[] = []
  if (snap.value.stars >= 2) parts.push('星×2 可破钢')
  else if (snap.value.stars === 1) parts.push('星×1 加速')
  if (snap.value.shield > 0) parts.push('护盾')
  if (snap.value.frozen > 0) parts.push('冻结')
  return parts.join(' · ')
})

function refresh(): void {
  const sim = session.sim
  snap.value = {
    ...sim,
    tiles: sim.tiles.slice(),
    tanks: sim.tanks.map((unit) => ({ ...unit })),
    shots: sim.shots.map((shot) => ({ ...shot })),
    pickups: sim.pickups.map((item) => ({ ...item }))
  }
  draw()
}

function begin(): void {
  session.initialize(null, { difficulty: difficulty.value, first: 'player' })
  session.start()
  last = 0
  refresh()
}

function input(): TankInput {
  return {
    up: pressed.has('arrowup') || pressed.has('w'),
    down: pressed.has('arrowdown') || pressed.has('s'),
    left: pressed.has('arrowleft') || pressed.has('a'),
    right: pressed.has('arrowright') || pressed.has('d'),
    fire: pressed.has(' ')
  }
}

const PICKUP_COLOR: Record<PickupKind, string> = {
  star: '#e2b340',
  helmet: '#6ec8e0',
  clock: '#f0d060',
  grenade: '#e07a3d',
  life: '#6fbf73'
}
const PICKUP_MARK: Record<PickupKind, string> = {
  star: '星',
  helmet: '盔',
  clock: '钟',
  grenade: '雷',
  life: '心'
}

function drawTank(ctx: CanvasRenderingContext2D, unit: TankUnit, shield: boolean): void {
  const size = TILE * 0.62
  ctx.save()
  ctx.translate(unit.x * TILE, unit.y * TILE)
  ctx.rotate(unit.dir * (Math.PI / 2))
  ctx.globalAlpha = unit.side === 'enemy' && snap.value.frozen > 0 ? 0.45 : 1
  ctx.fillStyle = unit.side === 'player' ? '#4f68b0' : '#c45c5c'
  ctx.fillRect(-size / 2, -size / 2, size, size)
  ctx.fillRect(-3, -size / 2 - 10, 6, 12)
  ctx.restore()
  if (!shield) return
  ctx.strokeStyle = '#8fd4ea'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(unit.x * TILE, unit.y * TILE, size * 0.72, 0, Math.PI * 2)
  ctx.stroke()
}

function drawPickup(ctx: CanvasRenderingContext2D, item: TankPickup): void {
  const x = item.x * TILE
  const y = item.y * TILE
  ctx.fillStyle = PICKUP_COLOR[item.kind]
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1b140c'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(PICKUP_MARK[item.kind], x, y + 0.5)
}

function draw(): void {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const sim = session.sim
  el.width = sim.width * TILE
  el.height = sim.height * TILE
  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, el.width, el.height)
  for (let i = 0; i < sim.tiles.length; i++) {
    const tile = sim.tiles[i]
    if (tile === 0) continue
    const x = (i % sim.width) * TILE
    const y = Math.floor(i / sim.width) * TILE
    ctx.fillStyle = tile === TILE_BRICK ? '#a56b52' : tile === TILE_STEEL ? '#2e3648' : '#12151c'
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
    if (tile === TILE_BRICK) {
      ctx.strokeStyle = '#6e4636'
      ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8)
    }
  }
  for (const item of sim.pickups) drawPickup(ctx, item)
  for (const unit of sim.tanks) {
    if (unit.alive) drawTank(ctx, unit, unit.side === 'player' && sim.shield > 0)
  }
  ctx.fillStyle = '#f4f6fb'
  for (const shot of sim.shots) {
    ctx.beginPath()
    ctx.arc(shot.x * TILE, shot.y * TILE, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function loop(now: number): void {
  const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000)
  last = now
  if (session.sim.status === 'playing') session.tick(input(), dt)
  refresh()
  frame = requestAnimationFrame(loop)
}

function onKey(event: KeyboardEvent, down: boolean): void {
  const key = event.key.toLowerCase()
  if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) {
    return
  }
  event.preventDefault()
  if (down) pressed.add(key)
  else pressed.delete(key)
}

const down = (event: KeyboardEvent): void => onKey(event, true)
const up = (event: KeyboardEvent): void => onKey(event, false)

onMounted(() => {
  session.onEvent((event) => {
    refresh()
    void gameBridge.reportEvent(event)
  })
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  begin()
  frame = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', down)
  window.removeEventListener('keyup', up)
  session.destroy()
  void gameBridge.setPlaying(null)
})

watch(difficulty, (level) => {
  session.setDifficulty(level)
  begin()
})

function pause(): void {
  session.pause()
  refresh()
}

function resume(): void {
  session.resume()
  last = 0
  refresh()
}
</script>

<template>
  <GameShell
    title="坦克大战"
    description="消灭全部敌方坦克。地图每次随机。砖墙可打碎，两颗星之后炮弹能打碎钢墙。"
    board-title="战场"
    :show-first="false"
    :difficulty="difficulty"
    :paused="snap.status === 'paused'"
    :over="snap.status === 'over'"
    :thinking="false"
    :outcome="snap.outcome"
    @back="router.push('/games')"
    @pause="pause"
    @resume="resume"
    @restart="begin()"
    @update:difficulty="difficulty = $event"
  >
    <div class="stage">
      <canvas ref="canvas" class="field" tabindex="0" />
      <p class="hud">
        生命 {{ player?.alive ? player.hp : 0 }} / {{ MAX_HP }} · 敌方 {{ enemies }}
        <template v-if="effects"> · {{ effects }}</template>
      </p>
      <p class="hint">
        方向键或 WASD 移动，空格射击。道具：星加速、盔护盾、钟冻结、雷清场、心回血。
      </p>
    </div>
  </GameShell>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.field {
  display: block;
  width: min(100%, 540px);
  height: auto;
  border-radius: 12px;
  outline: none;
  cursor: crosshair;
}

.field:focus {
  box-shadow: 0 0 0 2px var(--mo-accent);
}

.hud {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--mo-text-secondary);
}
</style>
