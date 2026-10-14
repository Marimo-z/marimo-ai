import { describe, expect, it } from 'vitest'
import { IDLE_FLOAT_PERIOD_MS, idleFloatLift } from '../src/utils/idle-float'

describe('idleFloatLift', () => {
  it('starts and ends each period at rest', () => {
    expect(idleFloatLift(0)).toBeCloseTo(0)
    expect(idleFloatLift(IDLE_FLOAT_PERIOD_MS)).toBeCloseTo(0)
  })

  it('peaks halfway through the period', () => {
    expect(idleFloatLift(IDLE_FLOAT_PERIOD_MS / 2)).toBeCloseTo(1)
  })

  it('stays within 0..1, including negative elapsed time', () => {
    for (const t of [-5000, 123, 4567, 99999]) {
      const v = idleFloatLift(t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
