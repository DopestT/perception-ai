import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
const plasmaSource = readFileSync(new URL('./PlasmaPortal.tsx', import.meta.url), 'utf8')

function section(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  if (from < 0 || to < 0) return ''
  return source.slice(from, to + end.length)
}

describe('consumer homepage contract', () => {
  it('keeps operator and account setup machinery out of the signed-in header', () => {
    const header = section(appSource, '<header className="home-header">', '</header>')

    expect(header).toContain('MY WORK')
    expect(header).toContain('SYSTEM')
    expect(header).not.toContain('PREPARE OPERATOR PROOF')
    expect(header).not.toContain('PROJECT WORLD')
    expect(header).not.toContain('ENABLE PASSKEY')
  })

  it('explains Perception in consumer language and offers lightweight starters', () => {
    expect(appSource).toContain('Tell Perception what you want to make real.')
    expect(appSource).toContain('Perception understands the goal, builds a route, takes approved action, and verifies what actually changed.')

    for (const label of [
      'Plan something',
      'Research something',
      'Build something',
      'Solve a problem',
      'Forecast an outcome',
    ]) {
      expect(appSource).toContain(label)
    }
  })

  it('keeps token controls out of the globally mounted consumer shell', () => {
    expect(mainSource).not.toContain('<TokenEfficiencyPanel />')
    expect(appSource).toContain('<TokenEfficiencyPanel />')
  })

  it('recovers the animated background when WebGL is interrupted', () => {
    expect(plasmaSource).toContain('webglcontextlost')
    expect(plasmaSource).toContain('webglcontextrestored')
    expect(plasmaSource).toContain('preventDefault()')
  })

  it('progressively reveals result depth instead of dumping system internals', () => {
    for (const label of [
      'GO DEEPER',
      'TAKE THE NEXT STEP',
      'SHOW ME THE EVIDENCE',
      'What Perception found',
      'What it means',
      'What should happen next',
      'Details',
      'Evidence',
      'Activity',
      'System',
    ]) {
      expect(appSource).toContain(label)
    }
  })

  it('validates forecast-shaped input before opening a forecast', () => {
    expect(appSource).toContain('resolveForecastInput(statement, forecastDeadline)')
    expect(appSource).toContain('resolveFrontDoorInput(statement)')
  })
})
