export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  width: number
  height: number
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Keeps a window reachable: if less than `minVisibleRatio` of it lies on any work area,
 * it is moved fully into the work area it overlaps most (or the first one, i.e. the primary).
 */
export function ensureVisible(
  bounds: Rect,
  workAreas: readonly Rect[],
  minVisibleRatio = 0.5
): Rect {
  if (workAreas.length === 0) return bounds

  let best = workAreas[0]
  let bestArea = 0
  for (const area of workAreas) {
    const overlap = intersectionArea(bounds, area)
    if (overlap > bestArea) {
      best = area
      bestArea = overlap
    }
  }

  if (bestArea >= bounds.width * bounds.height * minVisibleRatio) return bounds

  return {
    x: Math.round(clamp(bounds.x, best.x, best.x + best.width - bounds.width)),
    y: Math.round(clamp(bounds.y, best.y, best.y + best.height - bounds.height)),
    width: bounds.width,
    height: bounds.height
  }
}

/** Bottom-right corner of the work area, with a small margin. */
export function defaultPosition(
  workArea: Rect,
  size: { width: number; height: number },
  margin = 24
): Point {
  return {
    x: Math.round(workArea.x + workArea.width - size.width - margin),
    y: Math.round(workArea.y + workArea.height - size.height - margin)
  }
}
