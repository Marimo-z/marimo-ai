import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace(/^enc:/, '')
  }
}))

const { SecureStorage, aiKeyName } = await import('../electron/main/services/secure-storage')

describe('SecureStorage', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marimo-secrets-'))
    file = join(dir, 'secrets.json')
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('stores one key per AI profile and never writes plaintext', () => {
    const storage = new SecureStorage(file)
    storage.set(aiKeyName('a'), 'sk-aaa')
    storage.set(aiKeyName('b'), 'sk-bbb')

    expect(storage.aiProfileIds().sort()).toEqual(['a', 'b'])
    expect(storage.get(aiKeyName('b'))).toBe('sk-bbb')
    expect(readFileSync(file, 'utf-8')).not.toContain('sk-')

    storage.delete(aiKeyName('a'))
    expect(new SecureStorage(file).aiProfileIds()).toEqual(['b'])
  })

  it('migrates the legacy single key to the default profile', () => {
    writeFileSync(file, JSON.stringify({ aiApiKey: Buffer.from('enc:sk-old').toString('base64') }))
    const storage = new SecureStorage(file)
    expect(storage.get(aiKeyName('default'))).toBe('sk-old')
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toHaveProperty(['ai:default'])
  })

  it('rejects invalid names and ignores unknown entries on disk', () => {
    writeFileSync(file, JSON.stringify({ 'ai:ok': 'x', 'ai:BAD ID': 'y', other: 'z' }))
    const storage = new SecureStorage(file)
    expect(storage.aiProfileIds()).toEqual(['ok'])
    expect(() => storage.set('ai:../evil', 'k')).toThrow()
  })
})
