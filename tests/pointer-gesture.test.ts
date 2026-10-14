import { describe, expect, it } from 'vitest'
import { DRAG_THRESHOLD_PX, PointerGesture } from '../src/utils/pointer-gesture'

describe('PointerGesture', () => {
  it('reports a tap when released without moving', () => {
    const g = new PointerGesture()
    g.down({ x: 10, y: 10 })
    expect(g.up()).toBe('tap')
  })

  it('treats jitter below the threshold as a tap', () => {
    const g = new PointerGesture()
    g.down({ x: 10, y: 10 })
    expect(g.move({ x: 10 + DRAG_THRESHOLD_PX - 1, y: 10 })).toBeNull()
    expect(g.up()).toBe('tap')
  })

  it('starts a drag once and never reports a tap afterwards', () => {
    const g = new PointerGesture()
    g.down({ x: 0, y: 0 })
    expect(g.move({ x: 0, y: DRAG_THRESHOLD_PX })).toBe('drag-start')
    expect(g.move({ x: 50, y: 50 })).toBeNull()
    expect(g.isDragging).toBe(true)
    expect(g.up()).toBe('drag-end')
    expect(g.up()).toBeNull()
  })

  it('ignores moves without a press', () => {
    expect(new PointerGesture().move({ x: 100, y: 100 })).toBeNull()
  })

  it('ends a drag on cancel', () => {
    const g = new PointerGesture()
    g.down({ x: 0, y: 0 })
    g.move({ x: 20, y: 0 })
    expect(g.cancel()).toBe('drag-end')
    expect(g.isDragging).toBe(false)
  })
})
