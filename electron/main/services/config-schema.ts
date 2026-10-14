import { z } from 'zod'
import {
  DOUBLE_CLICK_ACTIONS,
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  PET_SENSITIVITIES
} from '../../../shared/pet'
import {
  AI_PROVIDER_IDS,
  ASR_PROVIDERS,
  DEFAULT_SETTINGS,
  DIALOGUE_FREQUENCIES,
  GAME_DIFFICULTIES,
  RECORD_MODES,
  REPLY_LENGTHS,
  SETTINGS_SECTIONS,
  THEME_MODES,
  TTS_PROVIDERS,
  type AppSettings,
  type SettingsSection
} from '../../../shared/settings'

const shapes = {
  pet: {
    alwaysOnTop: z.boolean(),
    followCursor: z.boolean(),
    idleAnimation: z.boolean(),
    clickThrough: z.boolean(),
    scale: z.number().min(PET_SCALE_MIN).max(PET_SCALE_MAX),
    bubbleDurationMs: z.number().int().min(1000).max(60000),
    launchAtLogin: z.boolean(),
    doNotDisturb: z.boolean(),
    sensitivity: z.enum(PET_SENSITIVITIES),
    doubleClickAction: z.enum(DOUBLE_CLICK_ACTIONS)
  },
  ai: {
    providerId: z.enum(AI_PROVIDER_IDS),
    baseUrl: z.string().trim().max(500),
    model: z.string().trim().max(200),
    timeoutMs: z.number().int().min(3000).max(120000),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().min(16).max(32768)
  },
  persona: {
    name: z.string().trim().min(1).max(20),
    traits: z.array(z.string().trim().min(1).max(12)).max(8),
    backstory: z.string().max(1000),
    speakingStyle: z.string().max(200),
    catchphrase: z.string().max(50),
    replyLength: z.enum(REPLY_LENGTHS),
    proactive: z.boolean(),
    proactiveIntervalMin: z.number().int().min(5).max(240),
    keepHistory: z.boolean()
  },
  voice: {
    asrProvider: z.enum(ASR_PROVIDERS),
    ttsProvider: z.enum(TTS_PROVIDERS),
    voiceId: z.string().max(100),
    rate: z.number().min(0.5).max(2),
    volume: z.number().min(0).max(1),
    pitch: z.number().min(0.5).max(2),
    autoSpeak: z.boolean(),
    recordMode: z.enum(RECORD_MODES)
  },
  games: {
    dialogueEnabled: z.boolean(),
    dialogueFrequency: z.enum(DIALOGUE_FREQUENCIES),
    tauntLevel: z.number().int().min(0).max(3),
    defaultDifficulty: z.enum(GAME_DIFFICULTIES)
  },
  appearance: {
    theme: z.enum(THEME_MODES)
  }
} satisfies Record<SettingsSection, z.ZodRawShape>

/** Strict schemas: used to validate updates coming from the control panel. */
export const sectionSchemas = {
  pet: z.object(shapes.pet),
  ai: z.object(shapes.ai),
  persona: z.object(shapes.persona),
  voice: z.object(shapes.voice),
  games: z.object(shapes.games),
  appearance: z.object(shapes.appearance)
} satisfies { [K in SettingsSection]: z.ZodType<AppSettings[K]> }

/** Lenient schema: each invalid field falls back to its default, so one bad value never resets the rest. */
function lenientSection<K extends SettingsSection>(section: K): z.ZodType<AppSettings[K]> {
  const defaults = DEFAULT_SETTINGS[section] as unknown as Record<string, unknown>
  const shape: Record<string, z.ZodType> = {}
  for (const [key, schema] of Object.entries(shapes[section] as z.ZodRawShape)) {
    shape[key] = (schema as z.ZodType).catch(structuredClone(defaults[key]))
  }
  return z.object(shape).catch(structuredClone(defaults)) as unknown as z.ZodType<AppSettings[K]>
}

const appConfigSchema = z.object({
  ...(Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, lenientSection(s)])) as {
    [K in SettingsSection]: z.ZodType<AppSettings[K]>
  }),
  petWindowPosition: z.object({ x: z.number().int(), y: z.number().int() }).nullable().catch(null)
})

export type AppConfig = AppSettings & { petWindowPosition: { x: number; y: number } | null }

export function parseConfig(raw: unknown): AppConfig {
  return appConfigSchema.parse(raw && typeof raw === 'object' ? raw : {}) as AppConfig
}

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}
