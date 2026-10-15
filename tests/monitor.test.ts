import { describe, expect, it } from 'vitest'
import { cpuUsage, memoryUsage, parseGpuLine, type CpuTimes } from '../shared/monitor'

const times = (idle: number, busy: number): CpuTimes => ({
  user: busy,
  nice: 0,
  sys: 0,
  idle,
  irq: 0
})

describe('system sample math', () => {
  it('measures how much CPU time was not idle', () => {
    expect(cpuUsage([times(10, 10)], [times(20, 30)])).toBeCloseTo(0.666, 2)
    expect(cpuUsage([times(5, 5)], [times(5, 5)])).toBe(0)
  })

  it('turns free memory into a used ratio', () => {
    expect(memoryUsage(25, 100)).toBeCloseTo(0.75)
    expect(memoryUsage(0, 0)).toBe(0)
  })

  it('reads a GPU counter line and ignores a missing counter', () => {
    expect(parseGpuLine(' 42 ')).toBeCloseTo(0.42)
    expect(parseGpuLine('140')).toBe(1)
    expect(parseGpuLine('-1')).toBeNull()
    expect(parseGpuLine('')).toBeNull()
  })
})
