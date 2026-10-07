import { describe, expect, it } from 'vitest'
import { resolveFrontDoorInput } from './front-door-intake'

describe('front door intake', () => {
  it('keeps greetings out of the objective runtime', () => {
    expect(resolveFrontDoorInput('Hi')).toEqual({
      kind: 'conversation',
      message: 'Hi. What do you want to understand, change, find, or predict?',
    })
    expect(resolveFrontDoorInput('hello!')).toEqual({
      kind: 'conversation',
      message: 'Hi. What do you want to understand, change, find, or predict?',
    })
  })

  it('asks for more detail on other inputs shorter than the runtime minimum', () => {
    expect(resolveFrontDoorInput('I')).toEqual({
      kind: 'conversation',
      message: 'Tell me a little more. What do you want to understand, change, find, or predict?',
    })
  })

  it('passes real objectives through unchanged except for edge whitespace', () => {
    expect(resolveFrontDoorInput('  Help me choose a new career  ')).toEqual({
      kind: 'objective',
      statement: 'Help me choose a new career',
    })
  })

  it('ignores empty input', () => {
    expect(resolveFrontDoorInput('   ')).toEqual({ kind: 'ignore' })
  })
})
