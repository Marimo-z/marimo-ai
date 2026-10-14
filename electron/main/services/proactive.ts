import type { AppSettings } from '../../../shared/settings'

export const PROACTIVE_CHECK_INTERVAL_MS = 60_000

export interface ProactiveContext {
  now: number
  lastActivity: number
  settings: AppSettings
  petVisible: boolean
  busy: boolean
}

/** The pet only starts talking when allowed, visible, not in a quiet mode and idle long enough. */
export function shouldSpeakProactively({
  now,
  lastActivity,
  settings,
  petVisible,
  busy
}: ProactiveContext): boolean {
  const { persona, pet, ai } = settings
  if (!persona.proactive || ai.activeProfileId === null) return false
  if (!petVisible || busy || pet.doNotDisturb || pet.clickThrough) return false
  return now - lastActivity >= persona.proactiveIntervalMin * 60_000
}
