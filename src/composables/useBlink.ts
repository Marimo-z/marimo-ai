import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

const BLINK_MS = 140
const MIN_GAP_MS = 2500
const MAX_GAP_MS = 6500
const DOUBLE_BLINK_CHANCE = 0.2

/** Random, low-frequency blinking; paused while disabled or the window is hidden. */
export function useBlink(enabled: Ref<boolean>): Ref<boolean> {
  const closed = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    closed.value = false
  }

  const blink = (then: () => void): void => {
    closed.value = true
    timer = setTimeout(() => {
      closed.value = false
      then()
    }, BLINK_MS)
  }

  const schedule = (): void => {
    const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS)
    timer = setTimeout(() => {
      if (document.hidden) return schedule()
      blink(() => {
        if (Math.random() < DOUBLE_BLINK_CHANCE) {
          timer = setTimeout(() => blink(schedule), BLINK_MS)
        } else {
          schedule()
        }
      })
    }, gap)
  }

  watch(
    enabled,
    (on) => {
      clear()
      if (on) schedule()
    },
    { immediate: true }
  )

  onBeforeUnmount(clear)
  return closed
}
