<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import {
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  PET_SKINS,
  PET_SKIN_LABELS,
  type DoubleClickAction,
  type PetSensitivity,
  type PetSettings,
  type PetSkin
} from '../../shared/pet'
import PetPreview from '../components/pet/PetPreview.vue'
import { settingsBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingSlider from '../components/common/SettingSlider.vue'
import SettingsCard from '../components/common/SettingsCard.vue'

const store = useSettingsStore()
const pet = computed(() => store.settings.pet)
const set = (patch: Partial<PetSettings>): Promise<boolean> => store.update('pet', patch)
const packaged = ref(true)
const SKIN_NOTES: Record<PetSkin, string> = {
  orb: '蓝色机器人',
  planet: '星环会转，卫星绕行'
}

async function resetPosition(): Promise<void> {
  await settingsBridge.resetPetPosition()
  ElMessage.success('桌宠已回到主屏幕右下角')
}

onMounted(async () => {
  packaged.value = (await settingsBridge.getAppInfo()).packaged
})
</script>

<template>
  <div class="page">
    <PageHeader title="桌宠设置" description="形象、大小和互动。滑块松开后才会记住。">
      <el-button @click="store.reset('pet')">恢复本页默认</el-button>
    </PageHeader>

    <SettingsCard title="外观与动作">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item label="形象">
          <div class="skins" role="radiogroup" aria-label="形象">
            <button
              v-for="id in PET_SKINS"
              :key="id"
              type="button"
              class="skin"
              role="radio"
              :aria-checked="pet.skin === id"
              :class="{ active: pet.skin === id }"
              @click="set({ skin: id })"
            >
              <PetPreview :size="96" :skin="id" :idle-animation="pet.idleAnimation" />
              <span class="skin-name">{{ PET_SKIN_LABELS[id] }}</span>
              <span class="skin-note">{{ SKIN_NOTES[id] }}</span>
            </button>
          </div>
        </el-form-item>
        <el-form-item>
          <SettingSlider
            label="大小"
            :model-value="pet.scale"
            :min="PET_SCALE_MIN"
            :max="PET_SCALE_MAX"
            :step="0.05"
            :format="(v) => `${Math.round(v * 100)}%`"
            @commit="(v) => set({ scale: v })"
          />
        </el-form-item>
        <el-form-item label="待机动画">
          <el-switch
            :model-value="pet.idleAnimation"
            @change="(v) => set({ idleAnimation: v as boolean })"
          />
          <p class="hint inline">圆球会轻轻浮起。关掉后，星球的星环和卫星也会停下。</p>
        </el-form-item>
        <el-form-item label="眼睛跟随鼠标">
          <el-switch
            :model-value="pet.followCursor"
            @change="(v) => set({ followCursor: v as boolean })"
          />
        </el-form-item>
        <el-form-item label="互动灵敏度">
          <el-radio-group
            :model-value="pet.sensitivity"
            :disabled="!pet.followCursor"
            @change="(v) => set({ sensitivity: v as PetSensitivity })"
          >
            <el-radio-button value="low">低</el-radio-button>
            <el-radio-button value="normal">中</el-radio-button>
            <el-radio-button value="high">高</el-radio-button>
          </el-radio-group>
          <p class="hint inline">鼠标靠得越近，它越容易看向你。</p>
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="窗口">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item label="始终置顶">
          <el-switch
            :model-value="pet.alwaysOnTop"
            @change="(v) => set({ alwaysOnTop: v as boolean })"
          />
        </el-form-item>
        <el-form-item label="鼠标穿透">
          <el-switch
            :model-value="pet.clickThrough"
            @change="(v) => set({ clickThrough: v as boolean })"
          />
          <p class="hint inline">点击会穿过桌宠，落到它后面的窗口。托盘或这里都能关掉。</p>
        </el-form-item>
        <el-form-item label="位置">
          <el-button @click="resetPosition">重置到主屏幕右下角</el-button>
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="互动">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item>
          <SettingSlider
            label="气泡停留"
            :model-value="pet.bubbleDurationMs"
            :min="1000"
            :max="15000"
            :step="500"
            :format="(v) => `${(v / 1000).toFixed(1)} 秒`"
            @commit="(v) => set({ bubbleDurationMs: v })"
          />
          <p class="hint">句子长的时候，会按字数再多留一会儿。</p>
        </el-form-item>
        <el-form-item label="双击桌宠">
          <el-radio-group
            :model-value="pet.doubleClickAction"
            @change="(v) => set({ doubleClickAction: v as DoubleClickAction })"
          >
            <el-radio-button value="panel">打开快捷菜单</el-radio-button>
            <el-radio-button value="none">无操作</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="勿扰模式">
          <el-switch
            :model-value="pet.doNotDisturb"
            @change="(v) => set({ doNotDisturb: v as boolean })"
          />
          <p class="hint inline">它不再主动开口。你点它的时候，仍会回应。</p>
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="系统">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item label="开机自动启动">
          <el-switch
            :model-value="pet.launchAtLogin"
            @change="(v) => set({ launchAtLogin: v as boolean })"
          />
          <p v-if="!packaged" class="hint inline">现在只会记住这个选择，安装版才会真正开机启动。</p>
        </el-form-item>
      </el-form>
    </SettingsCard>
  </div>
</template>

<style scoped>
.hint.inline {
  margin: 0 0 0 12px;
}

.skins {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.skin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 156px;
  padding: 14px 10px 12px;
  border: 1px solid var(--mo-border);
  border-radius: 22px;
  background: var(--mo-bg-soft);
  color: var(--mo-text);
  cursor: pointer;
}

.skin.active {
  border-color: transparent;
  background:
    linear-gradient(var(--mo-bg-card), var(--mo-bg-card)) padding-box,
    linear-gradient(145deg, var(--mo-accent), var(--mo-ring)) border-box;
  box-shadow: 0 8px 20px var(--mo-accent-soft);
}

.skin-name {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 650;
}

.skin-note {
  font-size: 12px;
  color: var(--mo-text-secondary);
}
</style>
