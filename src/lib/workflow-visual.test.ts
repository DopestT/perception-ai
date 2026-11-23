import { describe, expect, it } from 'vitest'
import { deriveWorkflowVisualState, type WorkflowVisualInput } from './workflow-visual'

const idle: WorkflowVisualInput = {
  busy: false,
  checking: false,
  hasError: false,
  responseProjectId: null,
  currentProjectId: null,
}

describe('evidence-reactive plasma state', () => {
  it('shows idle without recorded evidence or in-flight work', () => {
    expect(deriveWorkflowVisualState(idle)).toBe('idle')
  })

  it('uses the observable request and read-only check states', () => {
    expect(deriveWorkflowVisualState({ ...idle, busy: true })).toBe('requesting')
    expect(deriveWorkflowVisualState({ ...idle, checking: true })).toBe('checking')
    expect(deriveWorkflowVisualState({ ...idle, checking: true, busy: true })).toBe('checking')
  })

  it('never implies evidence from another project is this response', () => {
    expect(deriveWorkflowVisualState({ ...idle, responseProjectId: 'p-one', currentProjectId: 'p-two' })).toBe('idle')
    expect(deriveWorkflowVisualState({ ...idle, responseProjectId: 'p-one', currentProjectId: 'p-one' })).toBe('recorded')
  })

  it('keeps active work and errors ahead of an older recorded result', () => {
    const recorded: WorkflowVisualInput = { ...idle, responseProjectId: 'p-one', currentProjectId: 'p-one' }
    expect(deriveWorkflowVisualState({ ...recorded, busy: true })).toBe('requesting')
    expect(deriveWorkflowVisualState({ ...recorded, hasError: true })).toBe('attention')
  })
})
