import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { AI_PROFILE_ID_PATTERN, LEGACY_AI_PROFILE_ID } from '../../../shared/settings'
import { VOICE_KEY_KINDS, type VoiceKeyKind } from '../../../shared/voice'

const AI_KEY_PREFIX = 'ai:'
const LEGACY_AI_KEY = 'aiApiKey'
const VOICE_KEY_NAMES = new Set(VOICE_KEY_KINDS.map(voiceKeyName))

export function aiKeyName(profileId: string): string {
  return `${AI_KEY_PREFIX}${profileId}`
}

export function voiceKeyName(kind: VoiceKeyKind): string {
  return `voice:${kind}`
}

function isValidName(name: string): boolean {
  if (VOICE_KEY_NAMES.has(name)) return true
  return (
    name.startsWith(AI_KEY_PREFIX) && AI_PROFILE_ID_PATTERN.test(name.slice(AI_KEY_PREFIX.length))
  )
}

/**
 * Secrets encrypted with Electron safeStorage (DPAPI on Windows, bound to the OS user).
 * Only ciphertext touches the disk; plaintext never leaves the main process and is never logged.
 * Note: any program running as the same OS user can still ask DPAPI to decrypt it.
 */
export class SecureStorage {
  private cache: Record<string, string>

  constructor(private readonly filePath: string) {
    this.cache = this.load()
  }

  get available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  has(name: string): boolean {
    return typeof this.cache[name] === 'string'
  }

  get(name: string): string | null {
    const encrypted = this.cache[name]
    if (!encrypted || !this.available) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      console.warn(`[secrets] failed to decrypt ${name}; it may belong to another OS user`)
      return null
    }
  }

  set(name: string, value: string): void {
    if (!isValidName(name)) throw new Error('无效的密钥名称')
    if (!this.available) throw new Error('系统加密不可用，无法安全保存密钥')
    this.cache[name] = safeStorage.encryptString(value).toString('base64')
    this.save()
  }

  delete(name: string): void {
    if (!(name in this.cache)) return
    delete this.cache[name]
    this.save()
  }

  /** Profile ids that currently have an AI key stored. */
  aiProfileIds(): string[] {
    return Object.keys(this.cache)
      .filter((name) => name.startsWith(AI_KEY_PREFIX))
      .map((name) => name.slice(AI_KEY_PREFIX.length))
  }

  private load(): Record<string, string> {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch {
      return {}
    }
    if (!raw || typeof raw !== 'object') return {}

    const result: Record<string, string> = {}
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && isValidName(name)) result[name] = value
    }
    const legacy = (raw as Record<string, unknown>)[LEGACY_AI_KEY]
    const migrated = aiKeyName(LEGACY_AI_PROFILE_ID)
    if (typeof legacy === 'string' && !(migrated in result)) {
      result[migrated] = legacy
      this.cache = result
      this.save()
    }
    return result
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.cache), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tmp, this.filePath)
  }
}
