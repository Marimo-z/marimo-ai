import { z } from 'zod'
import {
  DEFAULT_PET_SETTINGS,
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  type PetSettings
} from '../../../shared/pet'

const d = DEFAULT_PET_SETTINGS

// Field-level fallbacks: a single corrupted value must not reset the rest of the config.
const petSettingsSchema = z.object({
  alwaysOnTop: z.boolean().catch(d.alwaysOnTop),
  followCursor: z.boolean().catch(d.followCursor),
  idleAnimation: z.boolean().catch(d.idleAnimation),
  clickThrough: z.boolean().catch(d.clickThrough),
  scale: z.number().min(PET_SCALE_MIN).max(PET_SCALE_MAX).catch(d.scale),
  bubbleDurationMs: z.number().int().min(1000).max(60000).catch(d.bubbleDurationMs)
}) satisfies z.ZodType<PetSettings>

const appConfigSchema = z.object({
  pet: petSettingsSchema.catch({ ...d }),
  petWindowPosition: z.object({ x: z.number().int(), y: z.number().int() }).nullable().catch(null)
})

export type AppConfig = z.infer<typeof appConfigSchema>

export function parseConfig(raw: unknown): AppConfig {
  return appConfigSchema.parse(raw && typeof raw === 'object' ? raw : {})
}
