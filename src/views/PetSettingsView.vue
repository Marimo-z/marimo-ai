<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import {
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  type DoubleClickAction,
  type PetSensitivity,
  type PetSettings
} from '../../shared/pet'
import { settingsBridge } from '../app/settings/bridge'
import { useSettingsStore } from '../app/stores/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'

const store = useSettingsStore()
const pet = computed(() => store.settings.pet)
const set = (patch: Partial<PetSettings>): Promise<boolean> => store.update('pet', patch)
const packaged = ref(true)

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
    <PageHeader title="桌宠设置" description="修改后立即生效">
      <el-button @click="store.reset('pet')">恢复本页默认</el-button>
    </PageHeader>

    <SettingsCard title="外观与动作">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item :label="`大小 ${Math.round(pet.scale * 100)}%`">
          <el-slider
            :model-value="pet.scale"
            :min="PET_SCALE_MIN"
            :max="PET_SCALE_MAX"
            :step="0.05"
            :format-tooltip="(v: number) => `${Math.round(v * 100)}%`"
            @change="(v) => set({ scale: v as number })"
          />
        </el-form-item>
        <el-form-item label="待机动画">
          <el-switch
            :model-value="pet.idleAnimation"
            @change="(v) => set({ idleAnimation: v as boolean })"
          />
          <p class="hint inline">轻微上下浮动；在没有 GPU 加速的环境下关闭可降低 CPU 占用</p>
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
          <p class="hint inline">鼠标多近时桌宠会“注意到”你</p>
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
          <p class="hint inline">开启后桌宠不再响应点击，可在托盘菜单或这里关闭</p>
        </el-form-item>
        <el-form-item label="位置">
          <el-button @click="resetPosition">重置到主屏幕右下角</el-button>
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="互动">
      <el-form label-position="left" label-width="140px" @submit.prevent>
        <el-form-item :label="`气泡停留 ${(pet.bubbleDurationMs / 1000).toFixed(0)} 秒`">
          <el-slider
            :model-value="pet.bubbleDurationMs"
            :min="1000"
            :max="15000"
            :step="500"
            :format-tooltip="(v: number) => `${(v / 1000).toFixed(1)} 秒`"
            @change="(v) => set({ bubbleDurationMs: v as number })"
          />
          <p class="hint">长文本会在此基础上按字数自动延长</p>
        </el-form-item>
        <el-form-item label="双击桌宠">
          <el-radio-group
            :model-value="pet.doubleClickAction"
            @change="(v) => set({ doubleClickAction: v as DoubleClickAction })"
          >
            <el-radio-button value="panel">打开控制面板</el-radio-button>
            <el-radio-button value="none">无操作</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="勿扰模式">
          <el-switch
            :model-value="pet.doNotDisturb"
            @change="(v) => set({ doNotDisturb: v as boolean })"
          />
          <p class="hint inline">不主动弹出气泡和语音，点击桌宠时仍会回应</p>
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
          <p v-if="!packaged" class="hint inline">开发模式下仅保存设置，安装版中生效</p>
        </el-form-item>
      </el-form>
    </SettingsCard>
  </div>
</template>

<style scoped>
.hint.inline {
  margin: 0 0 0 12px;
}
</style>
