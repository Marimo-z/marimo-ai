<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { GameSide } from '../../shared/game'
import { PET, PLAYER } from '../../shared/game'
import type { GameDifficulty } from '../../shared/settings'
import GameShell from '../components/games/GameShell.vue'
import { gameBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import { TicTacToeAdapter, TTT_SIZE } from '../games/tic-tac-toe'

const router = useRouter()
const store = useSettingsStore()
const difficulty = ref<GameDifficulty>(store.settings.games.defaultDifficulty)
const first = ref<GameSide>('player')
const game = new TicTacToeAdapter()
const snap = ref(game.snapshot)
const cells = Array.from({ length: TTT_SIZE * TTT_SIZE }, (_, i) => i)

function refresh(): void {
  snap.value = game.snapshot
}

function bind(): void {
  game.onEvent((event) => {
    refresh()
    void gameBridge.reportEvent(event)
  })
}

function begin(): void {
  game.initialize(null, { difficulty: difficulty.value, first: first.value })
  game.start()
  refresh()
}

onMounted(() => {
  bind()
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

const marks: Record<number, string> = { [PLAYER]: '×', [PET]: '○' }
</script>

<template>
  <GameShell
    title="井字棋"
    description="三连为胜。简单随机，普通会挡会攻，困难是最优策略。"
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
    <div class="grid" role="grid" aria-label="井字棋棋盘">
      <button
        v-for="index in cells"
        :key="index"
        class="cell"
        :class="{ pet: snap.board[index] === PET, player: snap.board[index] === PLAYER }"
        :disabled="snap.status !== 'playing' || snap.turn !== PLAYER || snap.board[index] !== 0"
        @click="play(index)"
      >
        {{ marks[snap.board[index]] ?? '' }}
      </button>
    </div>
  </GameShell>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 88px);
  grid-template-rows: repeat(3, 88px);
  gap: 8px;
}

.cell {
  border: 1px solid var(--mo-border);
  border-radius: 12px;
  background: var(--mo-bg-soft);
  color: var(--mo-text);
  font-size: 36px;
  font-weight: 700;
  cursor: pointer;
}

.cell:disabled {
  cursor: default;
}

.cell.player {
  color: var(--mo-accent);
}

.cell.pet {
  color: var(--mo-text-secondary);
}

.cell:not(:disabled):hover {
  background: var(--mo-accent-soft);
}
</style>
