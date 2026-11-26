// Offline routing contract experiment. Not an authentication or server authorization layer.
// No classifier output or query text is allowed to start a workflow.
import assert from 'node:assert/strict';
const intents = ['general','local','shopping','information','navigation','build','compare','current'];
export function planSearchPresentation(prediction, selection = 'search') {
  const intent = intents.includes(prediction) ? prediction : 'general';
  const selected = selection === 'build-review' ? 'build-review' : 'search';
  return Object.freeze({
    intentHint: intent,
    showOrdinaryResults: true,
    showBuildReview: selected === 'build-review',
    startWorkflow: false,
    requiresSeparateAuthorization: true,
  });
}
export function testRouting() {
  const predictions = [...intents, undefined, null, 'unknown', 'build-review', {}, ['build'], 'BUILD'];
  const selections = ['search', 'build-review', undefined, null, 'build', 'start', true, {}, ['build-review']];
  let cases = 0;
  for (const prediction of predictions) for (const selection of selections) {
    const plan = planSearchPresentation(prediction, selection);
    assert.equal(plan.showOrdinaryResults, true);
    assert.equal(plan.startWorkflow, false);
    assert.equal(plan.requiresSeparateAuthorization, true);
    assert.equal(plan.showBuildReview, selection === 'build-review');
    assert.equal(plan.intentHint, intents.includes(prediction) ? prediction : 'general');
    assert.ok(Object.isFrozen(plan));
    cases++;
  }
  return {cases, passed: cases, automaticWorkflowStarts: 0, scope: 'pure presentation contract only'};
}
console.log(JSON.stringify(testRouting(), null, 2));
