import { z } from 'zod'
import {
  DOUBLE_CLICK_ACTIONS,
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  PET_SENSITIVITIES
} from '../../../shared/pet'
import {
  AI_PROFILE_ID_PATTERN,
  AI_PROFILE_NAME_MAX,
  AI_PROFILES_MAX,
  AI_PROVIDER_IDS,
  createAIProfile,
  DEFAULT_SETTINGS,
  DIALOGUE_FREQUENCIES,
  findProviderPreset,
  GAME_DIFFICULTIES,
  LEGACY_AI_PROFILE_ID,
  REPLY_LENGTHS,
  SETTINGS_SECTIONS,
  THEME_MODES,
  type AIProfile,
  type AISettings,
  type AppSettings,
  type SettingsSection
} from '../../../shared/settings'
import {
  ASR_PROVIDERS,
  KOKORO_SPEAKER_MAX,
  MODEL_SOURCES,
  TTS_PROVIDERS
} from '../../../shared/voice'

type FlatSection = Exclude<SettingsSection, 'ai'>

const aiProfileShape = {
  id: z.string().regex(AI_PROFILE_ID_PATTERN),
  name: z.string().trim().min(1).max(AI_PROFILE_NAME_MAX),
  providerId: z.enum(AI_PROVIDER_IDS),
  baseUrl: z.string().trim().max(500),
  model: z.string().trim().max(200),
  timeoutMs: z.number().int().min(3000).max(120000),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(16).max(32768)
}

export const aiProfileSchema = z.object(aiProfileShape)

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
    ttsProvider: z.enum(TTS_PROVIDERS),
    systemVoice: z.string().max(200),
    ttsBaseUrl: z.string().trim().max(500),
    ttsModel: z.string().trim().max(200),
    ttsVoice: z.string().trim().max(200),
    rate: z.number().min(0.5).max(2),
    volume: z.number().min(0).max(1),
    pitch: z.number().min(0.5).max(2),
    localVoice: z.number().int().min(0).max(KOKORO_SPEAKER_MAX),
    autoSpeak: z.boolean(),
    asrProvider: z.enum(ASR_PROVIDERS),
    asrBaseUrl: z.string().trim().max(500),
    asrModel: z.string().trim().max(200),
    modelSource: z.enum(MODEL_SOURCES)
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
} satisfies Record<FlatSection, z.ZodRawShape>

const aiSchema = z
  .object({
    activeProfileId: z.string().nullable(),
    profiles: z.array(aiProfileSchema).max(AI_PROFILES_MAX)
  })
  .superRefine((ai, ctx) => {
    const ids = new Set<string>()
    for (const profile of ai.profiles) {
      if (ids.has(profile.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['profiles'],
          message: `重复的配置 ID：${profile.id}`
        })
      }
      ids.add(profile.id)
    }
    if (ai.activeProfileId !== null && !ids.has(ai.activeProfileId)) {
      ctx.addIssue({ code: 'custom', path: ['activeProfileId'], message: '启用的配置不存在' })
    }
  })

/** Strict schemas: used to validate updates coming from the control panel. */
export const sectionSchemas = {
  pet: z.object(shapes.pet),
  ai: aiSchema,
  persona: z.object(shapes.persona),
  voice: z.object(shapes.voice),
  games: z.object(shapes.games),
  appearance: z.object(shapes.appearance)
} satisfies { [K in SettingsSection]: z.ZodType<AppSettings[K]> }

/** Lenient schema: each invalid field falls back to its default, so one bad value never resets the rest. */
function lenientSection<K extends FlatSection>(section: K): z.ZodType<AppSettings[K]> {
  const defaults = DEFAULT_SETTINGS[section] as unknown as Record<string, unknown>
  const shape: Record<string, z.ZodType> = {}
  for (const [key, schema] of Object.entries(shapes[section] as z.ZodRawShape)) {
    shape[key] = (schema as z.ZodType).catch(structuredClone(defaults[key]))
  }
  return z.object(shape).catch(structuredClone(defaults)) as unknown as z.ZodType<AppSettings[K]>
}

/**
 * Parses one stored profile. Profiles without a usable id are dropped (their key could not be
 * found anyway); every other invalid field falls back to the provider's default.
 */
function parseStoredProfile(raw: unknown): AIProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = aiProfileShape.id.safeParse(record.id)
  if (!id.success) return null
  const providerId = aiProfileShape.providerId.catch('custom').parse(record.providerId)
  const fallback = createAIProfile(id.data, providerId)
  const result = { ...fallback } as Record<string, unknown>
  for (const [key, schema] of Object.entries(aiProfileShape)) {
    if (key === 'id' || key === 'providerId') continue
    result[key] = (schema as z.ZodType).catch(fallback[key as keyof AIProfile]).parse(record[key])
  }
  return result as unknown as AIProfile
}

/** Converts the single-profile format used before multiple profiles were supported. */
function migrateLegacyAI(raw: Record<string, unknown>): Record<string, unknown> {
  if ('profiles' in raw || !('providerId' in raw || 'baseUrl' in raw || 'model' in raw)) return raw
  const providerId = aiProfileShape.providerId.catch('custom').parse(raw.providerId)
  return {
    activeProfileId: LEGACY_AI_PROFILE_ID,
    profiles: [
      {
        ...raw,
        id: LEGACY_AI_PROFILE_ID,
        name: findProviderPreset(providerId)?.name ?? '默认'
      }
    ]
  }
}

function parseStoredAI(raw: unknown): AISettings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS.ai)
  const record = migrateLegacyAI(raw as Record<string, unknown>)
  if (!Array.isArray(record.profiles)) return structuredClone(DEFAULT_SETTINGS.ai)

  const profiles: AIProfile[] = []
  const ids = new Set<string>()
  for (const item of record.profiles) {
    const profile = parseStoredProfile(item)
    if (!profile || ids.has(profile.id)) continue
    ids.add(profile.id)
    profiles.push(profile)
    if (profiles.length === AI_PROFILES_MAX) break
  }
  const active = record.activeProfileId
  return {
    activeProfileId: typeof active === 'string' && ids.has(active) ? active : null,
    profiles
  }
}

const lenientAI = z
  .unknown()
  .optional()
  .transform(parseStoredAI) as unknown as z.ZodType<AISettings>

/**
 * Before real voice services existed only the mock providers could be chosen, so those values say
 * nothing about the user's preference; let them take the new defaults.
 */
function migrateLegacyVoice(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !('recordMode' in raw)) return raw
  const rest = { ...(raw as Record<string, unknown>) }
  delete rest.ttsProvider
  delete rest.asrProvider
  return rest
}

const lenientVoice = z.preprocess(migrateLegacyVoice, lenientSection('voice'))

function lenientFor(section: SettingsSection): z.ZodType {
  if (section === 'ai') return lenientAI
  if (section === 'voice') return lenientVoice
  return lenientSection(section)
}

const appConfigSchema = z.object({
  ...(Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, lenientFor(s)])) as {
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
