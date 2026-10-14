import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePickResult} from './build-value-settlement-from-final-results-day.js';

test('generic Over / Under market respects the selected side', () => {
  assert.equal(evaluatePickResult({market:'Over / Under 2.5',pick:'Under 2.5'},{homeScore:1,awayScore:0}),true);
  assert.equal(evaluatePickResult({market:'Over / Under 2.5',pick:'Under 2.5'},{homeScore:3,awayScore:0}),false);
  assert.equal(evaluatePickResult({market:'Over / Under 2.5',pick:'Over 2.5'},{homeScore:3,awayScore:0}),true);
  assert.equal(evaluatePickResult({market:'OU25',pick:'under'},{homeScore:1,awayScore:0}),true);
});
test('conflicting side or line and unidentified generic side remain unresolved', () => {
  for(const pick of [{market:'Over 2.5',pick:'Under 2.5'}, {market:'OU25',pick:'Over 1.5'},
    {market:'Over / Under 2.5',pick:''},{market:'Over / Under 2.5',pick:'yes'},
    {market:'Over / Under 2.5',pick:'Over / Under 2.5'}]){
    assert.equal(evaluatePickResult(pick,{homeScore:2,awayScore:0}),null);
  }
});
test('push and partial-win lines cannot be reported as binary losses', () => {
  assert.equal(evaluatePickResult({market:'Over / Under 2.0',pick:'Under 2.0'},{homeScore:1,awayScore:1}),null);
  assert.equal(evaluatePickResult({market:'Over / Under 2.25',pick:'Over 2.25'},{homeScore:1,awayScore:1}),null);
});
test('missing or invalid score is distinct from a verified zero score', () => {
  for(const homeScore of [null,undefined,'',-1,0.5]){
    assert.equal(evaluatePickResult({market:'OU25',pick:'under'},{homeScore,awayScore:0}),null);
  }
  assert.equal(evaluatePickResult({market:'OU25',pick:'under'},{homeScore:0,awayScore:0}),true);
});
test('BTTS and 1X2 keep their binary meanings', () => {
  assert.equal(evaluatePickResult({market:'BTTS',pick:'yes'},{homeScore:1,awayScore:1}),true);
  assert.equal(evaluatePickResult({market:'1X2',pick:'draw'},{homeScore:1,awayScore:1}),true);
});
