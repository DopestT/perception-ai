import { describe, expect, it } from 'vitest'
import { makeFreeStarter } from './free-starter'

describe('free-first Perception starter', () => {
  it('returns an immediate honest plan without account or model input', () => {
    const result = makeFreeStarter('  Help me organize a neighborhood cleanup  ', 'perceive')
    expect(result.statement).toBe('Help me organize a neighborhood cleanup')
    expect(result.nextSteps).toHaveLength(3)
    expect(result.limitation).toContain('does not create a Project World')
  })
  it('does not invent sources or pretend live search was performed', () => {
    const result = makeFreeStarter('Find reporting on a claim', 'search')
    expect(result.limitation).toContain('No live search')
    expect(result.nextSteps.some((step) => step.includes('source'))).toBe(true)
  })
  it('does not invent a forecast probability', () => {
    const result = makeFreeStarter('Will this happen?', 'forecast', '2026-12-13')
    expect(result.deadline).toBe('2026-12-13')
    expect(result.limitation).toContain('No forecast probability')
  })
  it('requires an actual user goal and known mode', () => {
    expect(() => makeFreeStarter(' ', 'discover')).toThrow('A goal is required')
    expect(() => makeFreeStarter('real goal', 'unknown' as 'discover')).toThrow('Unknown starter')
  })
  it('never silently truncates a lengthy objective into a token quota', () => {
    const longGoal = 'Understand my goals and priorities. '.repeat(200)
    expect(makeFreeStarter(longGoal, 'discover').statement).toBe(longGoal.trim())
  })
})
