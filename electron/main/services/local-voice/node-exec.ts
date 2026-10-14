import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Electron 44 rejects N-API external ArrayBuffers (`External buffers are not allowed`,
 * `TTS settlement failed`). Kokoro returns samples that way, so the worker must run in
 * a real Node process, not inside Electron.
 */
export function resolveNodeExecutable(): string {
  const candidates = [process.env.ELECTRON_NODE_BINARY, process.env.npm_node_execpath]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
      encoding: 'utf8',
      timeout: 5000
    })
      .trim()
      .split(/\r?\n/)
      .find((line) => line && existsSync(line))
    if (found) return found
  } catch {
    // PATH lookup failed
  }
  throw new Error(
    '找不到系统 Node.js。Electron 无法直接运行本地语音合成，请确认 Node 已安装并在 PATH 中。'
  )
}
