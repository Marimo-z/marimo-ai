import { describe, expect, it } from 'vitest'
import { renderLogoBitmap } from '../electron/main/services/logo-bitmap'

function pixel(buf: Buffer, size: number, x: number, y: number) {
  const o = (y * size + x) * 4
  return { b: buf[o], g: buf[o + 1], r: buf[o + 2], a: buf[o + 3] }
}

describe('renderLogoBitmap', () => {
  const size = 64
  const buf = renderLogoBitmap(size)

  it('produces a BGRA buffer of the right length', () => {
    expect(buf.length).toBe(size * size * 4)
  })

  it('is transparent in the corners and opaque logo blue in the body', () => {
    expect(pixel(buf, size, 0, 0).a).toBe(0)
    expect(pixel(buf, size, 32, 52)).toEqual({ r: 0x4f, g: 0x68, b: 0xb0, a: 255 })
  })

  it('cuts out the eyes', () => {
    // Left eye centre in logo space is (554.6, 373) -> (34.7, 23.3) at 64 px.
    expect(pixel(buf, size, 34, 23).a).toBe(0)
  })

  it('stores premultiplied colour channels', () => {
    for (let i = 0; i < buf.length; i += 4) {
      expect(buf[i]).toBeLessThanOrEqual(buf[i + 3])
      expect(buf[i + 2]).toBeLessThanOrEqual(buf[i + 3])
    }
  })
})
