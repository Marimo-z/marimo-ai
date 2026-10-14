import { onBeforeUnmount, onMounted } from 'vue'
import type { PetBridge } from '../../shared/ipc'

/**
 * The pet window is mostly transparent and ignores the mouse by default (with mousemove
 * forwarding). Hovering an element marked `data-interactive` makes the window clickable.
 */
export function useInteractiveRegions(bridge: PetBridge): void {
  let interactive = false

  const set = (next: boolean): void => {
    if (next === interactive) return
    interactive = next
    bridge.setInteractive(next)
  }

  const onMove = (event: MouseEvent): void => {
    // Keep the window clickable while a button is held (e.g. during a drag).
    if (event.buttons !== 0) return
    const target = event.target instanceof Element ? event.target : null
    set(target?.closest('[data-interactive]') != null)
  }
  const onLeave = (): void => set(false)

  onMounted(() => {
    document.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onMove)
    document.documentElement.removeEventListener('mouseleave', onLeave)
    set(false)
  })
}
