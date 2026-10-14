import { onBeforeUnmount } from 'vue'
import type { PetBridge } from '../../shared/ipc'
import { PointerGesture } from '../utils/pointer-gesture'

const DOUBLE_TAP_MS = 260

export interface PetGestureHandlers {
  /** Immediate visual feedback on every completed tap. */
  onPress(): void
  onTap(): void
  onDoubleTap(): void
  onDragChange(dragging: boolean): void
}

export function usePetGestures(bridge: PetBridge, handlers: PetGestureHandlers) {
  const gesture = new PointerGesture()
  let pendingTap: ReturnType<typeof setTimeout> | null = null

  const endDrag = (): void => {
    bridge.endDrag()
    handlers.onDragChange(false)
  }

  const resolveTap = (): void => {
    handlers.onPress()
    if (pendingTap) {
      clearTimeout(pendingTap)
      pendingTap = null
      handlers.onDoubleTap()
      return
    }
    pendingTap = setTimeout(() => {
      pendingTap = null
      handlers.onTap()
    }, DOUBLE_TAP_MS)
  }

  function onPointerdown(event: PointerEvent): void {
    if (event.button !== 0) return
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    gesture.down({ x: event.screenX, y: event.screenY })
  }

  function onPointermove(event: PointerEvent): void {
    if (gesture.move({ x: event.screenX, y: event.screenY }) === 'drag-start') {
      bridge.startDrag()
      handlers.onDragChange(true)
    }
  }

  function onPointerup(event: PointerEvent): void {
    if (event.button !== 0) return
    const result = gesture.up()
    if (result === 'drag-end') endDrag()
    else if (result === 'tap') resolveTap()
  }

  function onPointercancel(): void {
    if (gesture.cancel() === 'drag-end') endDrag()
  }

  function onContextmenu(event: MouseEvent): void {
    event.preventDefault()
    if (gesture.isDragging) return
    bridge.showContextMenu()
  }

  onBeforeUnmount(() => {
    if (pendingTap) clearTimeout(pendingTap)
    onPointercancel()
  })

  // Keys are DOM event names so the object can be bound with `v-on="..."`.
  return {
    pointerdown: onPointerdown,
    pointermove: onPointermove,
    pointerup: onPointerup,
    pointercancel: onPointercancel,
    lostpointercapture: onPointercancel,
    contextmenu: onContextmenu
  }
}
