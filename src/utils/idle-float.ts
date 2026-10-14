export const IDLE_FLOAT_PERIOD_MS = 7200
/**
 * Transparent windows on Windows are re-composited as a whole on every frame, so a 60 fps
 * CSS animation costs a large share of a CPU core. The idle float is therefore stepped at a
 * low frame rate; the movement is only a few pixels, so it still looks smooth.
 */
export const IDLE_FLOAT_FPS = 10

/** 0 at rest, 1 at the top of the float, following a cosine curve. */
export function idleFloatLift(elapsedMs: number, periodMs = IDLE_FLOAT_PERIOD_MS): number {
  const phase = (((elapsedMs % periodMs) + periodMs) % periodMs) / periodMs
  return (1 - Math.cos(phase * 2 * Math.PI)) / 2
}
