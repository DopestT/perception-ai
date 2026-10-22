export type FrontDoorResolution =
  | { kind: 'ignore' }
  | { kind: 'conversation'; message: string }
  | { kind: 'objective'; statement: string }

export type ForecastResolution =
  | { kind: 'ignore' }
  | { kind: 'conversation'; message: string }
  | { kind: 'forecast'; question: string; deadline: string }

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

const BROAD_HELP_REQUESTS = new Set([
  'help',
  'help me',
  'can you help',
  'can you help me',
  'could you help',
  'could you help me',
  'would you help me',
  'i need help',
  'i want help',
  'i want you to help',
  'hello i want you to help',
  'hi i want you to help',
  'hey i want you to help',
])

const GREETING_REPLY = 'Hi. What do you want to understand, change, find, or predict?'
const HELP_REPLY = 'Absolutely. What are you trying to do?'
const SHORT_INPUT_REPLY = 'Tell me a little more. What do you want to understand, change, find, or predict?'
const NOT_A_FORECAST_REPLY = 'That sounds like a question, not a forecast. Use SEARCH or ask what future event you want Perception to predict.'
const FORECAST_SHAPE_REPLY = 'Forecasts need a future yes/no or measurable outcome. Try: “Will X happen by this date?”'

function normalizeConversation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksForecastShaped(value: string): boolean {
  const normalized = normalizeConversation(value)
  return /^(will|would|can|could|is|are|does|do|has|have|who will|how likely|what (?:are|is) (?:the )?(?:odds|chance|chances|probability))\b/.test(normalized)
}

export function resolveFrontDoorInput(rawInput: string): FrontDoorResolution {
  const statement = rawInput.trim()
  if (!statement) return { kind: 'ignore' }

  const normalized = normalizeConversation(statement)
  if (GREETINGS.has(normalized)) {
    return { kind: 'conversation', message: GREETING_REPLY }
  }

  if (BROAD_HELP_REQUESTS.has(normalized)) {
    return { kind: 'conversation', message: HELP_REPLY }
  }

  if (statement.length < 3) {
    return { kind: 'conversation', message: SHORT_INPUT_REPLY }
  }

  return { kind: 'objective', statement }
}

export function resolveForecastInput(rawInput: string, deadline: string): ForecastResolution {
  const frontDoor = resolveFrontDoorInput(rawInput)
  if (frontDoor.kind === 'ignore' || frontDoor.kind === 'conversation') return frontDoor

  const question = frontDoor.statement
  if (!looksForecastShaped(question)) {
    const normalized = normalizeConversation(question)
    const ordinaryQuestion = /^(what|which|where|when|why|how|tell|find|show|explain)\b/.test(normalized)
    return {
      kind: 'conversation',
      message: ordinaryQuestion ? NOT_A_FORECAST_REPLY : FORECAST_SHAPE_REPLY,
    }
  }

  return { kind: 'forecast', question, deadline }
}
