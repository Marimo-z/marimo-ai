<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { REPLY_LENGTHS, type ReplyLength } from '../../shared/settings'
import PageHeader from '../components/common/PageHeader.vue'
import SettingsCard from '../components/common/SettingsCard.vue'
import { useSectionDraft } from '../composables/useSectionDraft'

const { draft, dirty, saving, save, revert } = useSectionDraft('persona')

const LENGTH_LABELS: Record<ReplyLength, string> = { short: '简短', medium: '适中', long: '详细' }
const TRAIT_SUGGESTIONS = ['好奇', '温柔', '傲娇', '毒舌', '话痨', '高冷', '元气', '呆萌', '认真']

async function onSave(): Promise<void> {
  if (!draft.value.name.trim()) {
    ElMessage.warning('宠物名字不能为空')
    return
  }
  if (await save()) ElMessage.success('人设已保存')
}
</script>

<template>
  <div class="page">
    <PageHeader title="人设与记忆" description="结构化保存，由 AI 服务层组装成提示词">
      <el-button :disabled="!dirty" @click="revert">撤销修改</el-button>
      <el-button type="primary" :disabled="!dirty" :loading="saving" @click="onSave">
        保存
      </el-button>
    </PageHeader>

    <SettingsCard title="基本人设">
      <el-form label-position="top" @submit.prevent>
        <div class="grid-2">
          <el-form-item label="宠物名字">
            <el-input v-model="draft.name" maxlength="20" show-word-limit />
          </el-form-item>
          <el-form-item label="口头禅">
            <el-input v-model="draft.catchphrase" maxlength="50" placeholder="例如：嘿嘿～" />
          </el-form-item>
        </div>
        <el-form-item label="性格关键词（最多 8 个，可自定义输入）">
          <el-select
            v-model="draft.traits"
            multiple
            filterable
            allow-create
            default-first-option
            :multiple-limit="8"
            placeholder="选择或输入后回车"
          >
            <el-option v-for="t in TRAIT_SUGGESTIONS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="说话风格">
          <el-input
            v-model="draft.speakingStyle"
            maxlength="200"
            placeholder="例如：口语化、简短"
          />
        </el-form-item>
        <el-form-item label="背景故事">
          <el-input
            v-model="draft.backstory"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            maxlength="1000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="回复长度偏好">
          <el-radio-group v-model="draft.replyLength">
            <el-radio-button v-for="len in REPLY_LENGTHS" :key="len" :value="len">
              {{ LENGTH_LABELS[len] }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </SettingsCard>

    <SettingsCard title="互动与记忆" description="以下选项在阶段 3 接入 AI 对话后生效">
      <el-form label-position="left" label-width="160px" @submit.prevent>
        <el-form-item label="允许主动发起对话">
          <el-switch v-model="draft.proactive" />
        </el-form-item>
        <el-form-item label="主动互动间隔（分钟）">
          <el-input-number
            v-model="draft.proactiveIntervalMin"
            :min="5"
            :max="240"
            :step="5"
            :disabled="!draft.proactive"
          />
        </el-form-item>
        <el-form-item label="保存对话历史">
          <el-switch v-model="draft.keepHistory" />
        </el-form-item>
        <el-form-item label="聊天历史">
          <el-tooltip content="目前还没有聊天记录（阶段 3 启用）" placement="top">
            <span><el-button disabled>清空聊天历史</el-button></span>
          </el-tooltip>
        </el-form-item>
      </el-form>
    </SettingsCard>
  </div>
</template>

<style scoped>
.el-select {
  width: 100%;
}
</style>
