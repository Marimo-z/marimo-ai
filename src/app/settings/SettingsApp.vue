<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import logoUrl from '../../../logo.svg'
import { useRoute, useRouter } from 'vue-router'
import { PANEL_TITLE_BAR_HEIGHT } from '../../../shared/theme'
import { THEME_MODES, type ThemeMode } from '../../../shared/settings'
import { useThemeClass } from '../../composables/useThemeClass'
import { isNavPath, NAV_ITEMS } from '../router'
import { useSettingsStore } from '../stores/settings'
import { settingsBridge } from './bridge'

const store = useSettingsStore()
const route = useRoute()
const router = useRouter()

const themeMode = computed<ThemeMode>(() =>
  store.loaded ? store.settings.appearance.theme : 'system'
)
useThemeClass(themeMode)

const THEME_LABELS: Record<ThemeMode, string> = { system: '系统', light: '浅色', dark: '深色' }
const themeOptions = THEME_MODES.map((value) => ({ value, label: THEME_LABELS[value] }))

function setTheme(value: string | number | boolean): void {
  void store.update('appearance', { theme: value as ThemeMode })
}

const offNavigate = settingsBridge.onNavigate((path) => {
  if (isNavPath(path)) void router.push(path)
})
onMounted(() => void store.load())
onBeforeUnmount(offNavigate)
</script>

<template>
  <div class="shell" :style="{ '--title-bar-height': `${PANEL_TITLE_BAR_HEIGHT}px` }">
    <header class="title-bar">
      <img class="title-logo" :src="logoUrl" alt="" />
      <span class="title-text">Marimo 控制面板</span>
    </header>

    <aside class="sidebar">
      <nav class="nav">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{
            active:
              item.path === '/games' ? route.path.startsWith('/games') : route.path === item.path
          }"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </RouterLink>
      </nav>
      <div class="theme-switch">
        <span class="theme-label">外观</span>
        <el-segmented
          :model-value="themeMode"
          :options="themeOptions"
          size="small"
          block
          :disabled="!store.loaded"
          @change="setTheme"
        />
      </div>
    </aside>

    <main class="content">
      <RouterView v-if="store.loaded" v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
      <div v-else v-loading="true" class="loading" element-loading-background="transparent" />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 208px 1fr;
  grid-template-rows: var(--title-bar-height) 1fr;
  height: 100vh;
}

.title-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--mo-border);
  background:
    linear-gradient(90deg, rgba(198, 161, 90, 0.16), transparent 28%),
    var(--mo-bg-header);
  -webkit-app-region: drag;
  user-select: none;
}

.title-logo {
  width: 22px;
  height: 22px;
}

.title-text {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 12px 14px;
  border-right: 1px solid var(--mo-border);
  background: var(--mo-bg-sidebar);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 14px;
  border-radius: 999px;
  color: var(--mo-text-secondary);
  text-decoration: none;
  transition:
    background 150ms ease,
    color 150ms ease;
}

.nav-item:hover {
  background: var(--mo-bg-soft);
  color: var(--mo-text);
}

.nav-item.active {
  background: var(--mo-accent-soft);
  box-shadow: inset 0 0 0 1px rgba(198, 161, 90, 0.45);
  color: var(--mo-accent);
  font-weight: 650;
}

.theme-switch {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-label {
  padding-left: 4px;
  font-size: 12px;
  color: var(--mo-text-secondary);
}

.content {
  overflow-y: auto;
  min-width: 0;
}

.loading {
  height: 100%;
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
}
</style>
