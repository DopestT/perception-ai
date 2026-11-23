/** Visual feedback must follow observed client/backend state, not animation timers. */
export type WorkflowVisualState = 'idle' | 'requesting' | 'checking' | 'recorded' | 'attention'

export type WorkflowVisualInput = {
  busy: boolean
  checking: boolean
  hasError: boolean
  responseProjectId: string | null
  currentProjectId: string | null
}

/**
 * A returned project ID confirms a response was recorded in the matching World;
 * it never implies that an objective is realized or independently verified.
 * This function does not poll, dispatch, or infer hidden worker stages.
 */
export function deriveWorkflowVisualState(input: WorkflowVisualInput): WorkflowVisualState {
  if (input.hasError) return 'attention'
  if (input.checking) return 'checking'
  if (input.busy) return 'requesting'
  if (input.responseProjectId && input.responseProjectId === input.currentProjectId) return 'recorded'
  return 'idle'
}
