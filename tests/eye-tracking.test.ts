import { describe, expect, it } from 'vitest'
import { computeEyeOffset, DEFAULT_EYE_TRACKING } from '../src/utils/eye-tracking'

const center = { x: 100, y: 100 }
const max = DEFAULT_EYE_TRACKING.maxOffset

describe('computeEyeOffset', () => {
  it('centres the eyes when the cursor is on the orb centre', () => {
    expect(computeEyeOffset(center, center)).toEqual({ x: 0, y: 0, near: true })
  })

  it('points toward the cursor with full strength when near', () => {
    const r = computeEyeOffset({ x: 300, y: 100 }, center)
    expect(r.x).toBeCloseTo(max)
    expect(r.y).toBeCloseTo(0)
    expect(r.near).toBe(true)
  })

  it('never exceeds the maximum radius', () => {
    for (const cursor of [
      { x: 101, y: 900 },
      { x: -5000, y: -5000 },
      { x: 250, y: 250 }
    ]) {
      const r = computeEyeOffset(cursor, center)
      expect(Math.hypot(r.x, r.y)).toBeLessThanOrEqual(max + 1e-9)
    }
  })

  it('reduces vertical travel', () => {
    const r = computeEyeOffset({ x: 100, y: 300 }, center)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(max * 0.8)
  })

  it('eases toward the centre when the cursor is inside the orb', () => {
    const half = DEFAULT_EYE_TRACKING.orbRadius / 2
    const r = computeEyeOffset({ x: 100 + half, y: 100 }, center)
    expect(r.x).toBeCloseTo(max / 2)
  })

  it('tracks weakly and is not "near" when the cursor is far away', () => {
    const r = computeEyeOffset({ x: 100 + 5000, y: 100 }, center)
    expect(r.x).toBeCloseTo(max * DEFAULT_EYE_TRACKING.farStrength)
    expect(r.near).toBe(false)
  })
})
