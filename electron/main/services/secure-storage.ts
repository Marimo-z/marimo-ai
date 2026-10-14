import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type SecretName = 'aiApiKey'

/**
 * Secrets encrypted with Electron safeStorage (DPAPI on Windows, bound to the OS user).
 * Only ciphertext touches the disk; plaintext never leaves the main process and is never logged.
 * Note: any program running as the same OS user can still ask DPAPI to decrypt it.
 */
export class SecureStorage {
  private cache: Partial<Record<SecretName, string>>

  constructor(private readonly filePath: string) {
    this.cache = this.load()
  }

  get available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  has(name: SecretName): boolean {
    return typeof this.cache[name] === 'string'
  }

  get(name: SecretName): string | null {
    const encrypted = this.cache[name]
    if (!encrypted || !this.available) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      console.warn(`[secrets] failed to decrypt ${name}; it may belong to another OS user`)
      return null
    }
  }

  set(name: SecretName, value: string): void {
    if (!this.available) throw new Error('系统加密不可用，无法安全保存密钥')
    this.cache[name] = safeStorage.encryptString(value).toString('base64')
    this.save()
  }

  delete(name: SecretName): void {
    delete this.cache[name]
    this.save()
  }

  private load(): Partial<Record<SecretName, string>> {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as unknown
      if (!raw || typeof raw !== 'object') return {}
      const value = (raw as Record<string, unknown>).aiApiKey
      return typeof value === 'string' ? { aiApiKey: value } : {}
    } catch {
      return {}
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.cache), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tmp, this.filePath)
  }
}
