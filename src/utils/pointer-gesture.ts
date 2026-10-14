import type { Vec2 } from './eye-tracking'

export const DRAG_THRESHOLD_PX = 4

/**
 * Separates a tap from a drag: movement beyond the threshold turns the press into a drag,
 * and a press that became a drag never reports a tap on release.
 */
export class PointerGesture {
  private origin: Vec2 | null = null
  private dragging = false

  constructor(private readonly threshold = DRAG_THRESHOLD_PX) {}

  get isDragging(): boolean {
    return this.dragging
  }

  down(point: Vec2): void {
    this.origin = point
    this.dragging = false
  }

  move(point: Vec2): 'drag-start' | null {
    if (!this.origin || this.dragging) return null
    if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) < this.threshold) return null
    this.dragging = true
    return 'drag-start'
  }

  up(): 'drag-end' | 'tap' | null {
    if (!this.origin) return null
    const result = this.dragging ? 'drag-end' : 'tap'
    this.reset()
    return result
  }

  cancel(): 'drag-end' | null {
    const wasDragging = this.dragging
    this.reset()
    return wasDragging ? 'drag-end' : null
  }

  private reset(): void {
    this.origin = null
    this.dragging = false
  }
}
