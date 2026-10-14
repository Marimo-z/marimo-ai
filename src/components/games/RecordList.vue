<script setup lang="ts">
import { GAME_NAMES, GAME_OUTCOME_LABELS, type GameRecord } from '../../../shared/game'

defineProps<{
  records: GameRecord[]
  empty: string
}>()

const DIFFICULTY: Record<GameRecord['difficulty'], string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难'
}

function when(at: number): string {
  return new Date(at).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <ul v-if="records.length" class="records">
    <li v-for="item in records" :key="item.id">
      <span class="name">{{ GAME_NAMES[item.gameId] }}</span>
      <span class="meta">{{ DIFFICULTY[item.difficulty] }} · {{ when(item.endedAt) }}</span>
      <span class="result" :data-outcome="item.outcome">{{
        GAME_OUTCOME_LABELS[item.outcome]
      }}</span>
    </li>
  </ul>
  <el-empty v-else :description="empty" :image-size="64" />
</template>

<style scoped>
.records {
  margin: 0;
  padding: 0;
  list-style: none;
}

.records li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--mo-border);
  font-size: 13px;
}

.records li:last-child {
  border-bottom: 0;
}

.meta {
  color: var(--mo-text-secondary);
}

.result {
  width: 28px;
  text-align: center;
  font-weight: 650;
}

.result[data-outcome='win'] {
  color: var(--mo-accent);
}

.result[data-outcome='lose'] {
  color: #c45c5c;
}
</style>
