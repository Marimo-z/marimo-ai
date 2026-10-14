import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseConfig, type AppConfig } from './config-schema'

const SAVE_DELAY_MS = 300

/** Plain (non-secret) settings stored as JSON. API keys must never go through this store. */
export class ConfigStore {
  private data: AppConfig
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly filePath: string) {
    this.data = this.load()
  }

  get(): Readonly<AppConfig> {
    return this.data
  }

  update(mutate: (current: AppConfig) => AppConfig): void {
    this.data = parseConfig(mutate(structuredClone(this.data)))
    this.scheduleSave()
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (error) {
      console.error('[config] failed to save config:', (error as Error).message)
    }
  }

  private load(): AppConfig {
    try {
      // Strip a BOM: editors such as Windows PowerShell 5 add one when saving UTF-8.
      const text = readFileSync(this.filePath, 'utf-8').replace(/^\uFEFF/, '')
      return parseConfig(JSON.parse(text))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[config] invalid config file, using defaults:', (error as Error).message)
      }
      return parseConfig({})
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
  }
}
