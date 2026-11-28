import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLeagueCoverage as classify} from './build-league-gap-report-day.js';
const ready={expectedMatches:4,canonicalFixtures:4,snapshotFixtures:4,detailsFiles:4,standingsReady:true,standingsValidated:true,isLeague:true,inSeason:true,selectedForAcquisition:true,rawEvents:4};
test('complete league coverage retains READY',()=>assert.deepEqual(classify(ready),{status:'READY',reason:null}));
test('partial and excess publication counts are not READY',()=>{
 for(const [changes,status,reason] of [
  [{snapshotFixtures:0},'WARN','canonical_not_in_snapshot'],
  [{snapshotFixtures:3},'PARTIAL','snapshot_fixture_count_shortfall'],
  [{snapshotFixtures:5},'WARN','snapshot_fixture_count_excess'],
  [{detailsFiles:3},'PARTIAL','details_missing_for_some_fixtures'],
  [{expectedMatches:5},'PARTIAL','canonical_expected_count_shortfall'],
  [{standingsReady:false},'PARTIAL','standings_missing'],
  [{standingsValidated:false},'PARTIAL','standings_present_not_validated']
 ])assert.deepEqual(classify({...ready,...changes}),{status,reason});
});
test('acquisition error takes precedence over zero raw events and selection absence',()=>{
 assert.deepEqual(classify({...ready,canonicalFixtures:0,rawEvents:0,selectedForAcquisition:false,acquisitionError:'timeout'}),{status:'BROKEN',reason:'acquisition_error:timeout'});
});
test('selection absence is not automatically a season false negative',()=>{
 const row={...ready,canonicalFixtures:0,selectedForAcquisition:false};
 assert.equal(classify(row).reason,'acquisition_selection_missing');
 assert.equal(classify({...row,inSeason:false}).reason,'season_calendar_false_negative');
});
test('idle and non-league legacy status preserved',()=>{
 assert.equal(classify({...ready,canonicalFixtures:0,expectedMatches:0}).status,'IDLE');
 assert.equal(classify({...ready,canonicalFixtures:0,expectedMatches:0,inSeason:false}).status,'OUT_OF_SEASON');
 assert.equal(classify({...ready,isLeague:false,standingsValidated:false}).status,'READY');
});
