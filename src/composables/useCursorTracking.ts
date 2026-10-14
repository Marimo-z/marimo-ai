import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'
import type { PetBridge } from '../../shared/ipc'
import { usePetStore } from '../app/stores/pet'
import { computeEyeOffset, DEFAULT_EYE_TRACKING, type Vec2 } from '../utils/eye-tracking'

/** Converts global cursor updates from the main process into an eye offset (CSS px). */
export function useCursorTracking(
  bridge: PetBridge,
  anchor: Ref<HTMLElement | null>
): ComputedRef<Vec2> {
  const store = usePetStore()
  const raw = ref<Vec2>({ x: 0, y: 0 })

  const unsubscribe = bridge.onCursor((point) => {
    const el = anchor.value
    if (!el || typeof point?.x !== 'number' || typeof point?.y !== 'number') return
    const rect = el.getBoundingClientRect()
    const scale = store.settings.scale
    const result = computeEyeOffset(
      point,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      {
        ...DEFAULT_EYE_TRACKING,
        maxOffset: DEFAULT_EYE_TRACKING.maxOffset * scale,
        orbRadius: rect.width / 2,
        nearRadius: DEFAULT_EYE_TRACKING.nearRadius * scale
      }
    )
    // Quantise so tiny cursor moves far away do not trigger a repaint of the eyes.
    const x = Math.round(result.x * 4) / 4
    const y = Math.round(result.y * 4) / 4
    if (x !== raw.value.x || y !== raw.value.y) raw.value = { x, y }
    if (store.pointerNear !== result.near) store.pointerNear = result.near
  })

  onBeforeUnmount(unsubscribe)

  return computed(() => (store.appearance.trackCursor ? raw.value : { x: 0, y: 0 }))
}
