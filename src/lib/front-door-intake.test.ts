import { describe, expect, it } from 'vitest'
import { resolveForecastInput, resolveFrontDoorInput } from './front-door-intake'

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

  it('keeps conversational help-seeking out of Project World creation', () => {
    expect(resolveFrontDoorInput('hello i want you to help')).toEqual({
      kind: 'conversation',
      message: 'Absolutely. What are you trying to do?',
    })
    expect(resolveFrontDoorInput('can you help me')).toEqual({
      kind: 'conversation',
      message: 'Absolutely. What are you trying to do?',
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

describe('forecast intake', () => {
  it('rejects opinion/search questions that are not forecasts', () => {
    expect(resolveForecastInput('What kind of Donnie Darko is good', '2026-10-30')).toEqual({
      kind: 'conversation',
      message: 'That sounds like a question, not a forecast. Use SEARCH or ask what future event you want Perception to predict.',
    })
  })

  it('requires an objectively resolvable future question', () => {
    expect(resolveForecastInput('Will the bill pass?', '2026-10-30')).toEqual({
      kind: 'forecast',
      question: 'Will the bill pass?',
      deadline: '2026-10-30',
    })
    expect(resolveForecastInput('Tell me about the bill', '2026-10-30')).toEqual({
      kind: 'conversation',
      message: 'Forecasts need a future yes/no or measurable outcome. Try: “Will X happen by this date?”',
    })
  })
})
