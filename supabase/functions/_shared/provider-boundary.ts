import type { ModelProtocol, ModelTarget } from './token-efficiency.ts'

export const PERCEPTION_SOVEREIGN_PROVIDER_NOTICE =
  'Perception is the system of record. This request contains a bounded, non-authoritative working copy. Do not rely on provider memory, conversation history, threads, vector stores, assistants, or persistent provider state to preserve project truth. Return the requested result only; Perception will decide what becomes canonical after verification.'

export function providerSystemPrompt(base: string): string {
  const prompt = base.trim()
  return prompt
    ? `${prompt}\n\n${PERCEPTION_SOVEREIGN_PROVIDER_NOTICE}`
    : PERCEPTION_SOVEREIGN_PROVIDER_NOTICE
}

export function providerStorageDirectives(
  target: Pick<ModelTarget, 'provider'>,
  _protocol: ModelProtocol,
): Record<string, boolean> {
  // OpenAI Responses stores application state by default unless store=false.
  // OpenAI Chat Completions also accepts store=false. Do not send this option
  // to generic compatible/local endpoints because they may reject it.
  return target.provider === 'openai' ? { store: false } : {}
}

export function providerStateIsAuthoritative(): false {
  return false
}
