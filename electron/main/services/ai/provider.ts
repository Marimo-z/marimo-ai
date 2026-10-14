import type { ConnectionTestResult } from '../../../../shared/ipc'
import { MOCK_PROVIDER_ID, type AIProfile } from '../../../../shared/settings'
import { MockProvider } from './mock-provider'
import { OpenAICompatibleProvider } from './openai-compatible'

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  /** Aborted when the user cancels; the provider adds its own timeout. */
  signal: AbortSignal
}

/** One model service. Components never talk to a provider directly; ChatService does. */
export interface AIProvider {
  testConnection(): Promise<ConnectionTestResult>
  /** Returns the raw text content of the reply; throws AIRequestError on failure. */
  chat(messages: ProviderMessage[], options: ChatOptions): Promise<string>
}

export function createProvider(
  profile: AIProfile,
  apiKey: string | null,
  fetchImpl: typeof fetch = fetch
): AIProvider {
  if (profile.providerId === MOCK_PROVIDER_ID) return new MockProvider()
  return new OpenAICompatibleProvider(profile, apiKey, fetchImpl)
}
