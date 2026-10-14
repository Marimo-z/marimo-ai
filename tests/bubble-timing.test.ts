import { describe, expect, it } from 'vitest'
import {
  BUBBLE_MAX_HOLD_MS,
  BUBBLE_MS_PER_CHAR,
  bubbleHoldMs,
  textLength
} from '../src/utils/bubble-timing'

describe('bubble timing', () => {
  it('counts unicode characters, not UTF-16 units', () => {
    expect(textLength('你好😀')).toBe(3)
  })

  it('keeps longer text visible longer', () => {
    expect(bubbleHoldMs('一二三四五六七八九十', 4000)).toBeGreaterThan(bubbleHoldMs('一', 4000))
    expect(bubbleHoldMs('一', 4000)).toBe(4000 + BUBBLE_MS_PER_CHAR)
  })

  it('caps very long text', () => {
    expect(bubbleHoldMs('字'.repeat(1000), 4000)).toBe(BUBBLE_MAX_HOLD_MS)
  })

  it('never goes below the configured base duration', () => {
    expect(bubbleHoldMs('', 30000)).toBe(30000)
  })
})
