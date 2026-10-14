import { describe, expect, it } from 'vitest'
import {
  defaultPosition,
  ensureVisible,
  intersectionArea
} from '../electron/main/services/window-bounds'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }
const secondary = { x: 1920, y: 0, width: 1280, height: 984 }
const size = { width: 280, height: 340 }

describe('window bounds', () => {
  it('computes intersection area', () => {
    expect(
      intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })
    ).toBe(25)
    expect(
      intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 })
    ).toBe(0)
  })

  it('keeps a visible window where it is', () => {
    const bounds = { x: 100, y: 100, ...size }
    expect(ensureVisible(bounds, [primary, secondary])).toEqual(bounds)
  })

  it('allows a partly off-screen window when mostly visible', () => {
    const bounds = { x: -50, y: 100, ...size }
    expect(ensureVisible(bounds, [primary])).toEqual(bounds)
  })

  it('moves a window from a disconnected monitor back to the primary display', () => {
    const bounds = { x: 4000, y: 300, ...size }
    expect(ensureVisible(bounds, [primary])).toEqual({ x: 1920 - 280, y: 300, ...size })
  })

  it('clamps into the display it overlaps most', () => {
    const bounds = { x: 1920 + 1200, y: 900, ...size }
    const r = ensureVisible(bounds, [primary, secondary])
    expect(r.x).toBe(1920 + 1280 - 280)
    expect(r.y).toBe(984 - 340)
  })

  it('places the default position at the bottom-right of the work area', () => {
    expect(defaultPosition(primary, size, 24)).toEqual({ x: 1920 - 280 - 24, y: 1040 - 340 - 24 })
  })
})
