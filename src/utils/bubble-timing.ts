export const TYPEWRITER_MS_PER_CHAR = 45
export const BUBBLE_MS_PER_CHAR = 120
export const BUBBLE_MAX_HOLD_MS = 20000

export function textLength(text: string): number {
  return Array.from(text).length
}

/** How long a bubble stays after its text is fully shown; longer text stays longer. */
export function bubbleHoldMs(text: string, baseMs: number): number {
  const scaled = baseMs + textLength(text) * BUBBLE_MS_PER_CHAR
  return Math.min(Math.max(scaled, baseMs), Math.max(baseMs, BUBBLE_MAX_HOLD_MS))
}
