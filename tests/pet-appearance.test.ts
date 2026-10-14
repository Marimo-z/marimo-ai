import { describe, expect, it } from 'vitest'
import { resolvePetAppearance, type PetAppearanceInput } from '../src/utils/pet-appearance'

const base: PetAppearanceInput = {
  emotion: 'idle',
  isDragging: false,
  isSpeaking: false,
  isPlaying: false,
  pointerNear: false,
  followCursor: true,
  idleAnimation: true
}

describe('resolvePetAppearance', () => {
  it('is idle and floating by default', () => {
    expect(resolvePetAppearance(base)).toEqual({
      state: 'idle',
      expression: 'idle',
      motion: 'float',
      trackCursor: true
    })
  })

  it('becomes curious when the pointer is near', () => {
    expect(resolvePetAppearance({ ...base, pointerNear: true }).expression).toBe('curious')
  })

  it('does not become curious when cursor following is off', () => {
    const r = resolvePetAppearance({ ...base, pointerNear: true, followCursor: false })
    expect(r.expression).toBe('idle')
    expect(r.trackCursor).toBe(false)
  })

  it('keeps an explicit emotion over curiosity', () => {
    expect(resolvePetAppearance({ ...base, emotion: 'angry', pointerNear: true }).expression).toBe(
      'angry'
    )
  })

  it('gives dragging priority and stops tracking while dragging', () => {
    const r = resolvePetAppearance({
      ...base,
      emotion: 'happy',
      isDragging: true,
      isSpeaking: true
    })
    expect(r.state).toBe('dragging')
    expect(r.motion).toBe('drag')
    expect(r.trackCursor).toBe(false)
  })

  it('shows talking while speaking but keeps the emotion as expression', () => {
    const r = resolvePetAppearance({ ...base, emotion: 'sad', isSpeaking: true })
    expect(r.state).toBe('talking')
    expect(r.motion).toBe('talk')
    expect(r.expression).toBe('sad')
  })

  it('reports playing', () => {
    expect(resolvePetAppearance({ ...base, isPlaying: true }).state).toBe('playing')
  })

  it.each(['happy', 'sad', 'thinking'] as const)('disables tracking for %s', (emotion) => {
    expect(resolvePetAppearance({ ...base, emotion }).trackCursor).toBe(false)
  })

  it('stays still when idle animation is disabled', () => {
    expect(resolvePetAppearance({ ...base, idleAnimation: false }).motion).toBe('still')
  })
})
