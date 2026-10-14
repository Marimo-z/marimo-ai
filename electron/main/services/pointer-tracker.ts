import { screen } from 'electron'
import type { Point } from './window-bounds'

/**
 * Electron has no global mousemove event, so the cursor is polled.
 * Callbacks only fire when the position actually changes, which keeps IPC traffic at zero while idle.
 */
export class PointerTracker {
  private timer: NodeJS.Timeout | null = null
  private last: Point | null = null

  constructor(
    private readonly intervalMs: number,
    private readonly onMove: (screenPoint: Point) => void
  ) {}

  get running(): boolean {
    return this.timer !== null
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(this.tick, this.intervalMs)
    this.tick()
  }

  /** Forces the next tick to emit, e.g. after the window moved under a still cursor. */
  invalidate(): void {
    this.last = null
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.last = null
  }

  private tick = (): void => {
    const point = screen.getCursorScreenPoint()
    if (this.last && this.last.x === point.x && this.last.y === point.y) return
    this.last = point
    this.onMove(point)
  }
}
