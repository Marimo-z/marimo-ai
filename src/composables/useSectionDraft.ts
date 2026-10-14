import { computed, ref, watch, type Ref } from 'vue'
import type { AppSettings, SettingsSection } from '../../shared/settings'
import { useSettingsStore } from '../app/stores/settings'
import { plainClone } from '../utils/plain-clone'

/**
 * Editable copy of one settings section for forms with explicit save/revert.
 * External changes (e.g. "restore defaults") are picked up while there are no local edits.
 */
export function useSectionDraft<K extends SettingsSection>(section: K) {
  const store = useSettingsStore()
  const saved = computed(() => store.settings[section])
  const draft = ref(plainClone(saved.value)) as Ref<AppSettings[K]>
  const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value))
  const saving = ref(false)

  let lastSaved = JSON.stringify(saved.value)
  watch(saved, (next) => {
    const wasClean = JSON.stringify(draft.value) === lastSaved
    lastSaved = JSON.stringify(next)
    if (wasClean) draft.value = plainClone(next)
  })

  async function save(): Promise<boolean> {
    saving.value = true
    try {
      return await store.update(section, draft.value)
    } finally {
      saving.value = false
    }
  }

  function revert(): void {
    draft.value = plainClone(saved.value)
  }

  return { draft, dirty, saving, save, revert }
}
