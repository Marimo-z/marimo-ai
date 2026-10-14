import { DEFAULT_SETTINGS, type AppSettings, type SettingsSection } from '../../../shared/settings'
import { formatIssues, sectionSchemas } from './config-schema'
import type { ConfigStore } from './config-store'

export type SettingsListener = (next: AppSettings, previous: AppSettings) => void

export class SettingsValidationError extends Error {}

/** Owns the non-secret user settings; every change goes through validation and notifies listeners. */
export class SettingsService {
  private readonly listeners = new Set<SettingsListener>()

  constructor(private readonly store: ConfigStore) {}

  get(): AppSettings {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { petWindowPosition, ...settings } = this.store.get()
    return structuredClone(settings)
  }

  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update<K extends SettingsSection>(section: K, patch: Partial<AppSettings[K]>): AppSettings {
    const previous = this.get()
    const merged = { ...previous[section], ...patch }
    const parsed = sectionSchemas[section].safeParse(merged)
    if (!parsed.success) throw new SettingsValidationError(formatIssues(parsed.error))

    this.store.update((config) => ({ ...config, [section]: parsed.data }))
    return this.emit(previous)
  }

  /** Resets one section, or every section when omitted. The window position is kept. */
  reset(section?: SettingsSection): AppSettings {
    const previous = this.get()
    this.store.update((config) =>
      section
        ? { ...config, [section]: structuredClone(DEFAULT_SETTINGS[section]) }
        : { ...config, ...structuredClone(DEFAULT_SETTINGS) }
    )
    return this.emit(previous)
  }

  private emit(previous: AppSettings): AppSettings {
    const next = this.get()
    for (const listener of this.listeners) listener(next, previous)
    return next
  }
}
