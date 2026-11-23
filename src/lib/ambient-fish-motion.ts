/**
 * Pure motion math for the occasional PERCEPTION creature.
 * No user inputs, persisted tracking, or random data collection.
 */
export type MotionPoint = { x: number; y: number; slope: number; opacity: number }

export function damp(previous: number, target: number, deltaSeconds: number, response = 5): number {
  const delta = Math.max(0, Math.min(deltaSeconds, 0.12))
  return previous + (target - previous) * (1 - Math.exp(-response * delta))
}

/** A long, gently curved, water-current-driven crossing in normalized viewport units. */
export function swimPath(progress: number, passage: number): MotionPoint {
  const p = Math.max(0, Math.min(1, progress))
  const travel = 1.32 * p - 0.16
  const direction = passage % 2 === 0 ? 1 : -1
  const x = direction > 0 ? travel : 1 - travel
  const lane = 0.62 + 0.075 * Math.sin(passage * 2.31)
  const flowA = Math.sin(2.2 * Math.PI * p + passage * 1.73)
  const flowB = Math.sin(4.6 * Math.PI * p + passage * 0.43)
  const y = lane + 0.056 * flowA + 0.012 * flowB
  const dy = 0.056 * 2.2 * Math.PI * Math.cos(2.2 * Math.PI * p + passage * 1.73)
    + 0.012 * 4.6 * Math.PI * Math.cos(4.6 * Math.PI * p + passage * 0.43)
  const slope = Math.atan2(dy, direction * 1.32)
  const opacity = Math.min(1, p * 10, (1 - p) * 10)
  return { x, y, slope, opacity: Math.max(0, opacity) }
}

/** Deliberately irregular spacing so the fish is a discovery, not an animation loop. */
export function encounterDelay(passage: number): number {
  const jitter = Math.sin((passage + 1) * 12.9898) * 43758.5453
  return 20000 + 16000 * (jitter - Math.floor(jitter))
}

export function encounterDuration(passage: number): number {
  return 9500 + 2300 * (0.5 + 0.5 * Math.sin(passage * 2.27))
}
