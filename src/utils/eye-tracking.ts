export interface Vec2 {
  x: number
  y: number
}

export interface EyeTrackingOptions {
  /** Maximum eye offset in CSS px. */
  maxOffset: number
  /** Inside this radius the eyes ease back toward the centre instead of going cross-eyed. */
  orbRadius: number
  /** Within this distance the pet tracks fully and counts as "pointer near". */
  nearRadius: number
  /** Beyond this distance tracking settles at `farStrength`. */
  farRadius: number
  farStrength: number
}

export interface EyeOffset extends Vec2 {
  near: boolean
}

export const DEFAULT_EYE_TRACKING: EyeTrackingOptions = {
  maxOffset: 6,
  orbRadius: 70,
  nearRadius: 360,
  farRadius: 1400,
  farStrength: 0.45
}

/** Eyes have more horizontal than vertical room, so vertical travel is reduced. */
const VERTICAL_FACTOR = 0.8

export function computeEyeOffset(
  cursor: Vec2,
  center: Vec2,
  options: EyeTrackingOptions = DEFAULT_EYE_TRACKING
): EyeOffset {
  const dx = cursor.x - center.x
  const dy = cursor.y - center.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return { x: 0, y: 0, near: true }

  let strength: number
  if (distance <= options.orbRadius) {
    strength = distance / options.orbRadius
  } else if (distance <= options.nearRadius) {
    strength = 1
  } else if (distance >= options.farRadius) {
    strength = options.farStrength
  } else {
    const t = (distance - options.nearRadius) / (options.farRadius - options.nearRadius)
    strength = 1 - (1 - options.farStrength) * t
  }

  const magnitude = options.maxOffset * strength
  return {
    x: (dx / distance) * magnitude,
    y: (dy / distance) * magnitude * VERTICAL_FACTOR,
    near: distance <= options.nearRadius
  }
}
