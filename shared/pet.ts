/** Emotions that may be set by the app, games or (later) validated AI replies. */
export const PET_EMOTIONS = ['idle', 'curious', 'happy', 'angry', 'sad', 'thinking'] as const
export type PetEmotion = (typeof PET_EMOTIONS)[number]

/**
 * The nine visual states from the spec. Activity states (talking / playing / dragging)
 * are derived from flags and are never stored as an emotion.
 */
export type PetVisualState = PetEmotion | 'talking' | 'playing' | 'dragging'

export const PET_EMOTION_LABELS: Record<PetEmotion, string> = {
  idle: '平静',
  curious: '好奇',
  happy: '开心',
  angry: '生气',
  sad: '难过',
  thinking: '思考'
}

export function isPetEmotion(value: unknown): value is PetEmotion {
  return typeof value === 'string' && (PET_EMOTIONS as readonly string[]).includes(value)
}

export interface PetSettings {
  alwaysOnTop: boolean
  followCursor: boolean
  idleAnimation: boolean
  clickThrough: boolean
  scale: number
  bubbleDurationMs: number
}

export const DEFAULT_PET_SETTINGS: PetSettings = {
  alwaysOnTop: true,
  followCursor: true,
  idleAnimation: true,
  clickThrough: false,
  scale: 1,
  bubbleDurationMs: 4000
}

export const PET_SCALE_MIN = 0.6
export const PET_SCALE_MAX = 1.6

/** Pet window size at scale 1; the orb sits at the bottom, the bubble uses the space above. */
export const PET_WINDOW_BASE_SIZE = { width: 280, height: 340 } as const
export const PET_ORB_BASE_SIZE = 140

export function petWindowSize(scale: number): { width: number; height: number } {
  return {
    width: Math.round(PET_WINDOW_BASE_SIZE.width * scale),
    height: Math.round(PET_WINDOW_BASE_SIZE.height * scale)
  }
}
