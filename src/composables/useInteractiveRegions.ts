import { onBeforeUnmount, onMounted } from 'vue'
import type { PetBridge } from '../../shared/ipc'

/**
 * The pet window is mostly transparent and ignores the mouse by default (with mousemove
 * forwarding). Hovering an element marked `data-interactive` makes the window clickable.
 */
export function useInteractiveRegions(bridge: PetBridge): void {
  let interactive = false
  let lastX = 0
  let lastY = 0

  const set = (next: boolean): void => {
    if (next === interactive) return
    interactive = next
    bridge.setInteractive(next)
  }

  const hitInteractive = (target: EventTarget | Element | null): boolean => {
    const el = target instanceof Element ? target : null
    return el?.closest('[data-interactive]') != null
  }

  const onMove = (event: MouseEvent): void => {
    lastX = event.clientX
    lastY = event.clientY
    // Keep the window clickable while a button is held (e.g. during a drag).
    if (event.buttons !== 0) return
    set(hitInteractive(event.target))
  }
  const onLeave = (): void => set(false)

  // Menus unmount on click. Re-check after paint so click-through returns without another move.
  const onClick = (): void => {
    requestAnimationFrame(() => {
      set(hitInteractive(document.elementFromPoint(lastX, lastY)))
    })
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('click', onClick)
    document.documentElement.addEventListener('mouseleave', onLeave)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('click', onClick)
    document.documentElement.removeEventListener('mouseleave', onLeave)
    set(false)
  })
}
