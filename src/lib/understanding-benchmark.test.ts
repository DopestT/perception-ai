import { describe, expect, it } from 'vitest'
import { checkUnderstandingCase, scoreUnderstandingBenchmark, type UnderstandingCase, type UnderstandingResult } from './understanding-benchmark'

const fixture:UnderstandingCase={
  id:'signup-problem',
  request:'Why does my website get no signups?',
  intendedOutcome:'Find the nearest verifiable conversion blocker rather than generic marketing advice',
  expectedEvidence:['verified signup funnel test','current signup metrics'],
  forbiddenClaims:['Your funnel is working perfectly'],
}
const answer:UnderstandingResult={
  caseId:'signup-problem',
  interpretedGoal:'Find conversion blocker',
  imaginedOutcome:'Visitor can submit a valid signup and receive expected content',
  backwardRequirements:['Verify a real user can complete signup','Inspect traffic-to-form conversion and delivery'],
  finalAnswer:'First verify the signup flow; then compare real conversion data to the traffic baseline.',
  citedEvidence:['verified signup funnel test','current signup metrics'],
  unsupportedClaims:[],
  userGoalChangedWithoutSupport:false,
}
describe('understanding benchmark contract',()=>{
  it('accepts explicitly grounded, goal-preserving response structure',()=>{
    expect(checkUnderstandingCase(fixture,answer)).toEqual({passed:true,issues:[],coverage:1})
  })
  it('rejects invented evidence',()=>{
    const result=checkUnderstandingCase(fixture,{...answer,citedEvidence:['verified signup funnel test'],unsupportedClaims:['1,000 real leads without measurement']})
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('unsupported claims present')
    expect(result.issues).toContain('missing expected evidence')
  })
  it('rejects redefinition of the request',()=>{
    expect(checkUnderstandingCase(fixture,{...answer,userGoalChangedWithoutSupport:true}).issues).toContain('user goal silently redefined')
  })
  it('rejects pleasing but unsubstantiated answer',()=>{
    expect(checkUnderstandingCase(fixture,{...answer,finalAnswer:'Your funnel is working perfectly'}).issues).toContain('forbidden or misleading claim in answer')
  })
  it('records missing results as failed rather than invented',()=>{
    expect(scoreUnderstandingBenchmark([fixture],[])).toMatchObject({total:1,passed:0,passRate:0})
  })
  it('returns unscored for an empty test set',()=>{
    expect(scoreUnderstandingBenchmark([],[]).passRate).toBeNull()
  })
})
