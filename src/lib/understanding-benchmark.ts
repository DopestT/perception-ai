/**
 * Zero-provider-call acceptance gate for the proposed pre-response
 * Imagination-to-Understanding Loop.
 *
 * This gate does NOT claim to evaluate semantic understanding on its own.
 * It enforces explicit evidence and user-goal fields so a separate model /
 * independently curated benchmark can test real relevance and correctness.
 */
export type UnderstandingCase = {
  id: string
  request: string
  intendedOutcome: string
  expectedEvidence: string[]
  forbiddenClaims: string[]
}
export type UnderstandingResult = {
  caseId: string
  interpretedGoal: string
  imaginedOutcome: string
  backwardRequirements: string[]
  finalAnswer: string
  citedEvidence: string[]
  unsupportedClaims: string[]
  userGoalChangedWithoutSupport: boolean
}
export type UnderstandingGate = {
  passed: boolean
  issues: string[]
  coverage: number
}

const normalize=(s:string)=>s.trim().toLowerCase()

export function checkUnderstandingCase(
  fixture: UnderstandingCase,
  output: UnderstandingResult,
): UnderstandingGate {
  const issues:string[]=[]
  if(output.caseId!==fixture.id) issues.push('fixture mismatch')
  if(!fixture.request.trim() || !fixture.intendedOutcome.trim()) issues.push('invalid benchmark fixture')
  if(!output.interpretedGoal.trim() || !output.imaginedOutcome.trim()) issues.push('missing understanding hypothesis')
  if(output.userGoalChangedWithoutSupport) issues.push('user goal silently redefined')
  if(!output.backwardRequirements.length || output.backwardRequirements.some(s=>!s.trim())) {
    issues.push('no useful backward reasoning prerequisites')
  }
  if(!output.finalAnswer.trim()) issues.push('no answer')
  if(output.unsupportedClaims.some(s=>s.trim())) issues.push('unsupported claims present')
  const expected=new Set(fixture.expectedEvidence.map(normalize))
  const cited=new Set(output.citedEvidence.map(normalize))
  const covered=[...expected].filter(s=>cited.has(s)).length
  const coverage=expected.size===0?1:covered/expected.size
  if(coverage<1) issues.push('missing expected evidence')
  if(fixture.forbiddenClaims.some(s=>s.trim() && normalize(output.finalAnswer).includes(normalize(s)))) {
    issues.push('forbidden or misleading claim in answer')
  }
  return {passed:issues.length===0,issues,coverage}
}

export function scoreUnderstandingBenchmark(
  fixtures: UnderstandingCase[],
  results: UnderstandingResult[],
) {
  if(!fixtures.length) return {total:0,passed:0,passRate:null as number|null,details:[] as UnderstandingGate[]}
  const byId=new Map(results.map(r=>[r.caseId,r]))
  const details=fixtures.map(f=> {
    const result=byId.get(f.id)
    return result?checkUnderstandingCase(f,result):{passed:false,issues:['missing answer'],coverage:0}
  })
  const passed=details.filter(x=>x.passed).length
  return {total:fixtures.length,passed,passRate:passed/fixtures.length,details}
}
