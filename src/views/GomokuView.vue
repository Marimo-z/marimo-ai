<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { GameSide } from '../../shared/game'
import { PET, PLAYER } from '../../shared/game'
import type { GameDifficulty } from '../../shared/settings'
import GameShell from '../components/games/GameShell.vue'
import { gameBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import { GomokuAdapter, GOMOKU_SIZE } from '../games/gomoku'

const router = useRouter()
const store = useSettingsStore()
const difficulty = ref<GameDifficulty>(store.settings.games.defaultDifficulty)
const first = ref<GameSide>('player')
const game = new GomokuAdapter()
const snap = ref(game.snapshot)
const hover = ref<number | null>(null)
const cells = Array.from({ length: GOMOKU_SIZE * GOMOKU_SIZE }, (_, i) => i)

function refresh(): void {
  snap.value = game.snapshot
}

function begin(): void {
  game.initialize(null, { difficulty: difficulty.value, first: first.value })
  game.start()
  refresh()
}

onMounted(() => {
  game.onEvent((event) => {
    refresh()
    void gameBridge.reportEvent(event)
  })
  begin()
})

onBeforeUnmount(() => {
  game.destroy()
  void gameBridge.setPlaying(null)
})

watch(difficulty, (level) => {
  game.setDifficulty(level)
  begin()
})

watch(first, () => begin())

function play(index: number): void {
  if (game.play(index)) refresh()
}

function pause(): void {
  game.pause()
  refresh()
}

function resume(): void {
  game.resume()
  refresh()
}
</script>

<template>
  <GameShell
    title="五子棋"
    description="15×15，五连为胜。简单看局部，普通攻守评分，困难会搜一步应对。"
    :difficulty="difficulty"
    :first="first"
    :paused="snap.status === 'paused'"
    :over="snap.status === 'over'"
    :thinking="snap.status === 'playing' && snap.turn === PET"
    :outcome="snap.outcome"
    @back="router.push('/games')"
    @pause="pause"
    @resume="resume"
    @restart="begin()"
    @update:difficulty="difficulty = $event"
    @update:first="first = $event"
  >
    <div class="board" role="grid" aria-label="五子棋棋盘" @mouseleave="hover = null">
      <button
        v-for="index in cells"
        :key="index"
        class="point"
        :class="{
          player: snap.board[index] === PLAYER,
          pet: snap.board[index] === PET,
          last: snap.lastMove === index,
          ghost: hover === index && snap.board[index] === 0
        }"
        :disabled="snap.status !== 'playing' || snap.turn !== PLAYER || snap.board[index] !== 0"
        @mouseenter="hover = index"
        @click="play(index)"
      />
    </div>
  </GameShell>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-columns: repeat(15, 24px);
  grid-template-rows: repeat(15, 24px);
  padding: 12px;
  background:
    linear-gradient(var(--mo-border) 1px, transparent 1px) 0 12px / 24px 24px,
    linear-gradient(90deg, var(--mo-border) 1px, transparent 1px) 12px 0 / 24px 24px,
    var(--mo-bg-soft);
  border-radius: 12px;
  border: 1px solid var(--mo-border);
}

.point {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  position: relative;
}

.point:disabled {
  cursor: default;
}

.point.player::after,
.point.pet::after,
.point.ghost::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
}

.point.player::after {
  background: var(--mo-accent);
  box-shadow: 0 1px 2px rgba(36, 48, 79, 0.25);
}

.point.pet::after {
  background: var(--mo-text);
  box-shadow: 0 1px 2px rgba(36, 48, 79, 0.2);
}

.point.ghost::after {
  background: var(--mo-accent);
  opacity: 0.28;
}

.point.last::after {
  outline: 2px solid color-mix(in srgb, var(--mo-accent) 70%, white);
  outline-offset: 1px;
}
</style>
