<script setup lang="ts">
import { ArrowLeft, RefreshRight, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import type { GameDifficulty } from '../../../shared/settings'
import type { GameOutcome, GameSide } from '../../../shared/game'
import PageHeader from '../common/PageHeader.vue'
import SettingsCard from '../common/SettingsCard.vue'

withDefaults(
  defineProps<{
    title: string
    description: string
    difficulty: GameDifficulty
    first?: GameSide
    showFirst?: boolean
    boardTitle?: string
    paused: boolean
    over: boolean
    thinking: boolean
    outcome: GameOutcome | null
  }>(),
  { first: 'player', showFirst: true, boardTitle: '棋盘' }
)

const emit = defineEmits<{
  back: []
  pause: []
  resume: []
  restart: []
  'update:difficulty': [GameDifficulty]
  'update:first': [GameSide]
}>()

const DIFFICULTY_LABELS: Record<GameDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难'
}

const OUTCOME_TEXT: Record<GameOutcome, string> = {
  win: '你赢了',
  lose: '桌宠赢了',
  draw: '平局'
}
</script>

<template>
  <div class="page">
    <PageHeader :title="title" :description="description">
      <el-button :icon="ArrowLeft" @click="emit('back')">返回游戏中心</el-button>
    </PageHeader>

    <div class="layout">
      <SettingsCard :title="boardTitle">
        <div class="board-wrap">
          <slot />
          <div v-if="paused" class="overlay">已暂停</div>
          <div v-else-if="over && outcome" class="overlay over">{{ OUTCOME_TEXT[outcome] }}</div>
          <div v-else-if="thinking" class="overlay thinking">桌宠思考中…</div>
        </div>
      </SettingsCard>

      <SettingsCard title="对局">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="难度">
            <el-radio-group
              :model-value="difficulty"
              @change="(v) => emit('update:difficulty', v as GameDifficulty)"
            >
              <el-radio-button
                v-for="(label, value) in DIFFICULTY_LABELS"
                :key="value"
                :value="value"
              >
                {{ label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="showFirst" label="先手">
            <el-radio-group
              :model-value="first"
              @change="(v) => emit('update:first', v as GameSide)"
            >
              <el-radio-button value="player">我先手</el-radio-button>
              <el-radio-button value="pet">桌宠先手</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <div class="actions">
            <el-button v-if="!paused && !over" :icon="VideoPause" @click="emit('pause')"
              >暂停</el-button
            >
            <el-button v-else-if="paused" type="primary" :icon="VideoPlay" @click="emit('resume')"
              >继续</el-button
            >
            <el-button :icon="RefreshRight" @click="emit('restart')">重开</el-button>
          </div>
        </el-form>
      </SettingsCard>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
  align-items: start;
}

.board-wrap {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 280px;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--mo-bg-card) 78%, transparent);
  font-size: 18px;
  font-weight: 650;
  color: var(--mo-text);
}

.overlay.thinking {
  font-size: 14px;
  font-weight: 500;
  color: var(--mo-text-secondary);
  background: transparent;
  align-items: end;
  padding-bottom: 8px;
  pointer-events: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
