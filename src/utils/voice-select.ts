export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
}

/** The named voice if installed, otherwise a Chinese voice (local ones first), otherwise null. */
export function pickSystemVoice<T extends VoiceLike>(voices: readonly T[], name: string): T | null {
  if (name) {
    const exact = voices.find((v) => v.name === name)
    if (exact) return exact
  }
  const chinese = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('zh'))
  return chinese.find((v) => v.localService !== false) ?? chinese[0] ?? null
}
