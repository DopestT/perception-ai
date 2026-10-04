import { describe, expect, it } from 'vitest'
import {
  PERCEPTION_SOVEREIGN_PROVIDER_NOTICE,
  providerStateIsAuthoritative,
  providerStorageDirectives,
  providerSystemPrompt,
} from '../../supabase/functions/_shared/provider-boundary'

describe('Perception sovereign provider boundary', () => {
  it('marks all provider state as non-authoritative', () => {
    expect(providerStateIsAuthoritative()).toBe(false)
  })

  it('forces OpenAI requests to avoid persistent application state', () => {
    expect(providerStorageDirectives({ provider: 'openai' }, 'responses')).toEqual({ store: false })
    expect(providerStorageDirectives({ provider: 'openai' }, 'chat_completions')).toEqual({ store: false })
  })

  it('does not send OpenAI-specific storage flags to compatible or local endpoints', () => {
    expect(providerStorageDirectives({ provider: 'openai_compatible' }, 'responses')).toEqual({})
    expect(providerStorageDirectives({ provider: 'local' }, 'chat_completions')).toEqual({})
  })

  it('adds the sovereign-storage rule to bounded provider prompts', () => {
    const prompt = providerSystemPrompt('Do bounded work.')
    expect(prompt).toContain('Do bounded work.')
    expect(prompt).toContain(PERCEPTION_SOVEREIGN_PROVIDER_NOTICE)
    expect(prompt).toContain('non-authoritative')
  })
})
