// Geometry of logo.svg (viewBox 0 0 1024 1024): a filled circle with two capsule-shaped eye cut-outs.
const CIRCLE = { cx: 512, cy: 512, r: 426.7 }
const EYES = [
  { cx: 554.6, top: 320, bottom: 426.65, r: 42.65 },
  { cx: 746.6, top: 320, bottom: 426.65, r: 42.65 }
]
const COLOR = { r: 0x4f, g: 0x68, b: 0xb0 }
const SUPERSAMPLE = 4

function insideLogo(x: number, y: number): boolean {
  const dx = x - CIRCLE.cx
  const dy = y - CIRCLE.cy
  if (dx * dx + dy * dy > CIRCLE.r * CIRCLE.r) return false
  for (const eye of EYES) {
    const nearestY = Math.min(Math.max(y, eye.top), eye.bottom)
    const ex = x - eye.cx
    const ey = y - nearestY
    if (ex * ex + ey * ey <= eye.r * eye.r) return false
  }
  return true
}

/** Rasterizes the logo into a premultiplied BGRA buffer (the layout `nativeImage.createFromBitmap` expects). */
export function renderLogoBitmap(size: number): Buffer {
  const buffer = Buffer.alloc(size * size * 4)
  const unit = 1024 / size
  const samples = SUPERSAMPLE * SUPERSAMPLE

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) * unit
          const y = (py + (sy + 0.5) / SUPERSAMPLE) * unit
          if (insideLogo(x, y)) hits++
        }
      }
      const alpha = hits / samples
      const offset = (py * size + px) * 4
      buffer[offset] = Math.round(COLOR.b * alpha)
      buffer[offset + 1] = Math.round(COLOR.g * alpha)
      buffer[offset + 2] = Math.round(COLOR.r * alpha)
      buffer[offset + 3] = Math.round(255 * alpha)
    }
  }
  return buffer
}
