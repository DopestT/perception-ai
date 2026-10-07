export type FrontDoorResolution =
  | { kind: 'ignore' }
  | { kind: 'conversation'; message: string }
  | { kind: 'objective'; statement: string }

const GREETINGS = new Set([
  'hi',
  'hiya',
  'hi there',
  'hey',
  'hey there',
  'hello',
  'hello there',
  'yo',
  'sup',
  'good morning',
  'good afternoon',
  'good evening',
])

const GREETING_REPLY = 'Hi. What do you want to understand, change, find, or predict?'
const SHORT_INPUT_REPLY = 'Tell me a little more. What do you want to understand, change, find, or predict?'

function normalizeGreeting(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveFrontDoorInput(rawInput: string): FrontDoorResolution {
  const statement = rawInput.trim()
  if (!statement) return { kind: 'ignore' }

  if (GREETINGS.has(normalizeGreeting(statement))) {
    return { kind: 'conversation', message: GREETING_REPLY }
  }

  if (statement.length < 3) {
    return { kind: 'conversation', message: SHORT_INPUT_REPLY }
  }

  return { kind: 'objective', statement }
}
