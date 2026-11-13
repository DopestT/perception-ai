import { describe, expect, it } from 'vitest'
import { damp, encounterDelay, encounterDuration, swimPath } from './ambient-fish-motion'

describe('ambient fish: organic but bounded movement', () => {
  it('remains in a viewport-sized corridor, entering and leaving off-screen', () => {
    for (let p = 0; p <= 1; p += 0.01) {
      for (const passage of [0, 1, 4, 19, 27]) {
        const result = swimPath(p, passage)
        expect(result.x).toBeGreaterThanOrEqual(-0.17)
        expect(result.x).toBeLessThanOrEqual(1.17)
        expect(result.y).toBeGreaterThan(0.40)
        expect(result.y).toBeLessThan(0.83)
        expect(result.opacity).toBeGreaterThanOrEqual(0)
        expect(result.opacity).toBeLessThanOrEqual(1)
        expect(Number.isFinite(result.slope)).toBe(true)
      }
    }
  })

  it('alternates the swimming direction on separate encounters', () => {
    expect(swimPath(0, 0).x).toBeLessThan(0)
    expect(swimPath(1, 0).x).toBeGreaterThan(1)
    expect(swimPath(0, 1).x).toBeGreaterThan(1)
    expect(swimPath(1, 1).x).toBeLessThan(0)
  })

  it('varies the spacing between rare appearances and keeps durations bounded', () => {
    const waits = Array.from({ length: 15 }, (_, i) => encounterDelay(i))
    expect(new Set(waits.map(Math.floor)).size).toBeGreaterThan(10)
    for (let i = 0; i < 20; i++) {
      expect(encounterDelay(i)).toBeGreaterThanOrEqual(20000)
      expect(encounterDelay(i)).toBeLessThan(36000)
      expect(encounterDuration(i)).toBeGreaterThanOrEqual(9500)
      expect(encounterDuration(i)).toBeLessThanOrEqual(11800)
    }
  })

  it('uses frame-rate independent exponential damping for organic transitions', () => {
    const sixtyFrames = Array.from({ length: 60 }).reduce((n) => damp(n, 1, 1 / 60), 0)
    const thirtyFrames = Array.from({ length: 30 }).reduce((n) => damp(n, 1, 1 / 30), 0)
    expect(sixtyFrames).toBeCloseTo(thirtyFrames, 6)
    expect(damp(0, 1, -12)).toBe(0)
  })
})
