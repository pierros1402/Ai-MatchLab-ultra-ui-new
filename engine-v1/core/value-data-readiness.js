import {buildValueFixtureUniverse,valueFixtureUniverseContract} from './value-fixture-universe.js';
import {joinCanonicalFixturesWithModelAssessments} from './plan-b-canonical-membership.js';
const idOf=row=>String(row?.canonicalId||row?.matchId||'');
export function buildValueDataReadiness({day,fixtures=[],assessments=[],coverage=null,standings={},detailsAudit=null,now=new Date().toISOString()}) {
  const universe=buildValueFixtureUniverse(day,{fixtures});
  const contract=valueFixtureUniverseContract(universe);
  const join=joinCanonicalFixturesWithModelAssessments(fixtures,assessments);
  const joined=new Map(join.joinedMatches.map(row=>[idOf(row),row]));
  const ambiguous=new Set(join.ambiguousCanonicalMatches.map(row=>row.canonicalId));
  const coverageRows=new Map(),duplicates=new Set();
  for(const row of coverage?.rows||[]){const id=idOf(row);if(coverageRows.has(id))duplicates.add(id);coverageRows.set(id,row);}
  const coverageBound=coverage?.dayKey===day&&coverage?.source?.fixtureUniverse?.hash===contract.hash;
  const detailProblems=new Set((detailsAudit?.issues||[]).map(issue=>issue.id).filter(Boolean));
  const globalDetailFailure=detailsAudit&&detailsAudit.ok!==true&&(Number(detailsAudit.summary?.issueCount||0)>(detailsAudit.issues||[]).length||!(detailsAudit.issues||[]).length||(detailsAudit.issues||[]).some(issue=>!issue.id));
  const rows=fixtures.map(fixture=>{
    const id=idOf(fixture),row=coverageRows.get(id),assessment=joined.get(id),reasons=[];
    const excluded=/POSTPONED|CANCELLED|CANCELED/.test(String(fixture.status||'').toUpperCase());
    const state=standings[fixture.leagueSlug]||{};
    if(!excluded){
      if(!coverageBound)reasons.push('coverage_missing_or_wrong_universe');
      if(!row||duplicates.has(id))reasons.push('fixture_coverage_missing_or_ambiguous');
      if(row?.detailsFound!==true)reasons.push('details_missing');
      if(globalDetailFailure||detailProblems.has(id))reasons.push('details_foundation_not_verified');
      if(row?.valueReturned!==true)reasons.push(row?.nullReason||'value_input_not_evaluated');
      if(ambiguous.has(id))reasons.push('ambiguous_model_assessment');
      else if(!assessment)reasons.push('missing_model_assessment');
    }
    return {canonicalId:id,leagueSlug:fixture.leagueSlug,kickoffUtc:fixture.kickoffUtc,
      status:excluded?'NOT_APPLICABLE':reasons.length?'INSUFFICIENT_DATA':'READY',reasons,
      modelAssessmentAvailable:Boolean(assessment),recentHistory:row?.minimumSample||null,
      standings:{usable:state.ok===true,reasons:state.validation?.issues||state.artifact?.foundation?.reasonCodes||[]},
      predictionCreated:false};
  });
  const applicable=rows.filter(row=>row.status!=='NOT_APPLICABLE'),ready=applicable.filter(row=>row.status==='READY');
  const byReason={};for(const row of applicable)for(const reason of row.reasons)byReason[reason]=(byReason[reason]||0)+1;
  const complete=applicable.length>0&&ready.length===applicable.length;
  return {schema:'ai-matchlab.value-data-readiness.v1',date:day,generatedAt:now,fixtureUniverse:contract,
    certifies:'configured_statistical_value_required_inputs_only',allLeagueDataCertified:false,
    complete,status:complete?'COMPLETE':ready.length?'PARTIAL':'INSUFFICIENT_DATA',
    summary:{fixtures:rows.length,applicable:applicable.length,ready:ready.length,insufficient:applicable.length-ready.length,byReason},
    rows,integrityIsNotCoverage:true,missingInputsAreNotZeroValue:true,
    sourcePolicy:{realOddsRequiredForStatisticalSelection:false,unverifiedStandingsNeverPromoted:true,thresholdsChanged:false}};
}
