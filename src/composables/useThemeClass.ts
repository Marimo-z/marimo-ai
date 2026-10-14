import { onBeforeUnmount, watch, type Ref } from 'vue'
import type { ThemeMode } from '../../shared/settings'

/** Toggles `html.dark` (used by Element Plus and panel.css) from the chosen theme mode. */
export function useThemeClass(mode: Ref<ThemeMode>): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const dark = mode.value === 'system' ? query.matches : mode.value === 'dark'
    document.documentElement.classList.toggle('dark', dark)
  }
  watch(mode, apply, { immediate: true })
  query.addEventListener('change', apply)
  onBeforeUnmount(() => query.removeEventListener('change', apply))
}
