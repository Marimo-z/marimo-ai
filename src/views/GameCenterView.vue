<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { GameDifficulty, GameSettings } from '../../shared/settings'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'
import RecordList from '../components/games/RecordList.vue'
import { useGameRecords } from '../composables/useGameRecords'

const router = useRouter()
const store = useSettingsStore()
const games = computed(() => store.settings.games)
const set = (patch: Partial<GameSettings>): Promise<boolean> => store.update('games', patch)
const { records } = useGameRecords()
const recent = computed(() => [...records.value].reverse())

const GAMES = [
  {
    id: 'tic-tac-toe',
    name: '井字棋',
    glyph: '#',
    description: '3×3 经典对弈，三档难度，困难模式下桌宠不会输。',
    route: '/games/tic-tac-toe'
  },
  {
    id: 'gomoku',
    name: '五子棋',
    glyph: '●',
    description: '15×15 棋盘，启发式评分 + 搜索剪枝。',
    route: '/games/gomoku'
  },
  {
    id: 'tank',
    name: '坦克大战',
    glyph: '▲',
    description: '2D 俯视角射击，敌方 AI、地图障碍与碰撞。',
    route: null
  }
]

const DIFFICULTY_LABELS: Record<GameDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难'
}
const TAUNT_MARKS = { 0: '温柔', 1: '调侃', 2: '毒舌', 3: '拉满' }
</script>

<template>
  <div class="page">
    <PageHeader title="游戏中心" description="和桌宠下棋，它会根据战况开心、得意或生气" />

    <div class="grid-3">
      <article v-for="game in GAMES" :key="game.id" class="game-card">
        <div class="game-glyph">{{ game.glyph }}</div>
        <h3 class="game-name">{{ game.name }}</h3>
        <p class="game-desc">{{ game.description }}</p>
        <div class="game-footer">
          <el-tag v-if="!game.route" size="small" effect="plain">阶段 6</el-tag>
          <el-button v-if="game.route" size="small" type="primary" @click="router.push(game.route)">
            开始
          </el-button>
          <el-button v-else size="small" type="primary" disabled>即将推出</el-button>
        </div>
      </article>
    </div>

    <SettingsCard title="对局设置">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item label="默认难度">
          <el-radio-group
            :model-value="games.defaultDifficulty"
            @change="(v) => set({ defaultDifficulty: v as GameDifficulty })"
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
        <el-form-item label="游戏中对话">
          <el-switch
            :model-value="games.dialogueEnabled"
            @change="(v) => set({ dialogueEnabled: v as boolean })"
          />
        </el-form-item>
        <el-form-item label="对话频率">
          <el-radio-group
            :model-value="games.dialogueFrequency"
            :disabled="!games.dialogueEnabled"
            @change="(v) => set({ dialogueFrequency: v as GameSettings['dialogueFrequency'] })"
          >
            <el-radio-button value="low">少</el-radio-button>
            <el-radio-button value="normal">适中</el-radio-button>
            <el-radio-button value="high">多</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="嘲讽强度">
          <el-slider
            class="taunt"
            :model-value="games.tauntLevel"
            :min="0"
            :max="3"
            :step="1"
            :marks="TAUNT_MARKS"
            show-stops
            :disabled="!games.dialogueEnabled"
            @change="(v) => set({ tauntLevel: v as number })"
          />
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="最近战绩">
      <RecordList :records="recent" empty="还没有对局记录" />
    </SettingsCard>
  </div>
</template>

<style scoped>
.game-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background: var(--mo-bg-card);
  box-shadow: var(--mo-shadow);
}

.game-glyph {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--mo-accent-soft);
  color: var(--mo-accent);
  font-size: 22px;
  font-weight: 700;
}

.game-name {
  margin: 14px 0 6px;
  font-size: 16px;
}

.game-desc {
  flex: 1;
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mo-text-secondary);
}

.game-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.taunt {
  margin: 0 12px 18px 6px;
}
</style>
