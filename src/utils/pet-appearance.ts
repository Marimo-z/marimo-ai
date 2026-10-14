import type { PetEmotion, PetVisualState } from '../../shared/pet'

export type PetMotion = 'float' | 'talk' | 'drag' | 'play' | 'still'

export interface PetAppearanceInput {
  emotion: PetEmotion
  isDragging: boolean
  isSpeaking: boolean
  isPlaying: boolean
  pointerNear: boolean
  followCursor: boolean
  idleAnimation: boolean
}

export interface PetAppearance {
  /** Single label for the current visual state (exposed as `data-state`). */
  state: PetVisualState
  /** Drives the eye shape. */
  expression: PetEmotion
  /** Drives the body animation. */
  motion: PetMotion
  /** Whether eyes may follow the cursor; off while another animation owns the eyes. */
  trackCursor: boolean
}

/** Expressions with their own eye animation, which cursor tracking would fight with. */
const EXPRESSIONS_WITHOUT_TRACKING: readonly PetEmotion[] = ['happy', 'sad', 'thinking']

export function resolvePetAppearance(input: PetAppearanceInput): PetAppearance {
  const expression: PetEmotion =
    input.emotion === 'idle' && input.pointerNear && input.followCursor ? 'curious' : input.emotion

  const state: PetVisualState = input.isDragging
    ? 'dragging'
    : input.isSpeaking
      ? 'talking'
      : input.isPlaying
        ? 'playing'
        : expression

  const motion: PetMotion = input.isDragging
    ? 'drag'
    : input.isSpeaking
      ? 'talk'
      : input.isPlaying
        ? 'play'
        : input.idleAnimation
          ? 'float'
          : 'still'

  return {
    state,
    expression,
    motion,
    trackCursor:
      input.followCursor && !input.isDragging && !EXPRESSIONS_WITHOUT_TRACKING.includes(expression)
  }
}
