import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { IDLE_FLOAT_FPS, idleFloatLift } from '../utils/idle-float'

/** Returns the current float lift (0..1), updated at a low frame rate while enabled. */
export function useIdleFloat(enabled: Ref<boolean>): Ref<number> {
  const lift = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null
  let start = 0

  const stop = (): void => {
    if (timer) clearInterval(timer)
    timer = null
    lift.value = 0
  }

  watch(
    enabled,
    (on) => {
      stop()
      if (!on) return
      start = performance.now()
      timer = setInterval(() => {
        if (!document.hidden) lift.value = idleFloatLift(performance.now() - start)
      }, 1000 / IDLE_FLOAT_FPS)
    },
    { immediate: true }
  )

  onBeforeUnmount(stop)
  return lift
}
