import crypto from 'node:crypto';
import fs from 'node:fs';
import { athensDayKey, shiftDay } from '../core/daykey.js';

export const unifiedSpecBytes = Buffer.from(fs.readFileSync(new URL('./unified-u1-spec.json', import.meta.url),'utf8').replace(/\r\n?/gu,'\n'),'utf8');
function freeze(value) {
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
export const unifiedSpec = freeze(JSON.parse(unifiedSpecBytes));
export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const specSha256 = digest(unifiedSpecBytes);
export const selectorSourceSha256=digest(fs.readFileSync(new URL(import.meta.url),'utf8').replace(/\r\n?/gu,'\n'));
assertUnified(selectorSourceSha256===unifiedSpec.code?.selectorSha256,'unified_pinned_selector_code_mismatch');
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
}
export const signature = value => digest(JSON.stringify(canonical(value)));
export function assertUnified(condition, code) { if (!condition) throw new Error(code); }
export function prospectiveDay(day, now) {
  assertUnified(/^\d{4}-\d{2}-\d{2}$/u.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day, 'unified_invalid_day');
  assertUnified(Number.isFinite(Date.parse(now)), 'unified_invalid_capture_time');
  const today = athensDayKey(new Date(now));
  return day >= unifiedSpec.earliestTargetDay && day >= today && day <= shiftDay(today, 1);
}
function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value) ? Date.parse(value) : NaN;
}
const forecastTime = p => timestamp(p.frozenAt ?? p.generatedAt ?? p.updatedAt);
const idOf = p => String(p.canonicalId || p.canonicalMatchId || p.matchId || '');
export function normalizedMarket(p) {
  const market = String(p.market || '').trim().toUpperCase();
  const side = String(p.pick ?? p.selection ?? '').trim().toUpperCase();
  if (['OU25', 'OVER / UNDER 2.5', 'OVER/UNDER 2.5'].includes(market)) {
    if (['OVER', 'OVER 2.5'].includes(side)) return ['OU25', 'over'];
    if (['UNDER', 'UNDER 2.5'].includes(side)) return ['OU25', 'under'];
  }
  if (market === 'BTTS') {
    if (['YES', 'BTTS YES'].includes(side)) return ['BTTS', 'yes'];
    if (['NO', 'BTTS NO'].includes(side)) return ['BTTS', 'no'];
  }
  if (market === '1X2') {
    const mapped = { HOME:'home', AWAY:'away', DRAW:'draw', '1':'home', '2':'away', X:'draw' }[side];
    if (mapped) return ['1X2', mapped];
  }
  return null;
}
export const selectionKey = p => [p.canonicalMatchId, p.market, p.pick].join('|');

function coverage(plan, input) {
  const a = input.producerAudit || input.audit;
  const accounting = a.evaluationAccounting;
  const universe = a.fixtureUniverse || a.membership?.fixtureUniverse;
  const gaps = accounting?.inputGapFixtures;
  const foundation = a.modelInputLoadStatus;
  const blocked = Boolean(foundation?.historyIndexFoundationGate || foundation?.modelPriorsFoundationGate || a.inputFailure);
  const incomplete = blocked || Number(gaps || 0) > 0 || Number(accounting?.unaccountedFixtureCount || 0) > 0;
  const reported = accounting && (accounting.complete === true || accounting.unaccountedFixtureCount === 0 &&
    accounting.duplicateOutcomeCount === 0 && accounting.terminalOutcomeCount === accounting.evaluatedFixtureCount);
  return {plan, status:incomplete ? 'INCOMPLETE' : reported ? 'REPORTED_ACCOUNTED' : 'UNKNOWN',
    inputGapFixtures:Number.isInteger(gaps) ? gaps : null, foundationBlocked:blocked,
    universeCount:universe?.count ?? null, universeHash:universe?.hash ?? null,
    accounting:accounting || null,
    auditPayloadBinding:plan === 'A' ? 'PRODUCER_AUDIT_NOT_CERTIFIED_AS_THE_FIRST_FREEZE_AUDIT' : 'CAPTURED_COMPANION_AUDIT',
    fullUpstreamRuntimeLineageCertified:false};
}

/** Pure postprocessor of captured selections; no provider, model, score or result reads. */
export function buildUnifiedShadow({day, now, sources, fixtures, inputFiles = [], run = {}}) {
  assertUnified(prospectiveDay(day, now), 'unified_outside_prospective_window');
  const nowMs = Date.parse(now), canonicalById = new Map(), ambiguous = new Set();
  for (const f of fixtures) {
    const id = idOf(f);
    if (!id) continue;
    if (canonicalById.has(id)) ambiguous.add(id);
    canonicalById.set(id, f);
  }
  const decisions = [], baselineSelections = {}, coverageByPlan = [];
  const rejection = (plan, index, reason, detail = {}) => decisions.push({plan, sourceIndex:index, decision:'REJECTED', reason, ...detail});
  const valid = {};
  for (const plan of ['A','A2','B','B2']) {
    const input = sources[plan];
    assertUnified(input?.plan && input.audit, `unified_missing_source_${plan}`);
    const p = input.plan, a = input.audit;
    assertUnified(p.date === day && a.date === day && p.ok !== false && a.ok === true &&
      Array.isArray(p.picks) && Number.isInteger(p.count) && p.count === p.picks.length, `unified_invalid_source_${plan}`);
    const quality = coverage(plan, input);coverageByPlan.push(quality);
    const at = forecastTime(p);valid[plan] = [];baselineSelections[plan] = [];
    for (const [index, pick] of p.picks.entries()) {
      const cid = idOf(pick), f = canonicalById.get(cid), market = normalizedMarket(pick);
      const detail = {canonicalMatchId:cid, sourceMarket:pick.market ?? null, sourceSelection:pick.pick ?? pick.selection ?? null};
      if (!/^cid_[A-Za-z0-9_]+$/u.test(cid) || !f || ambiguous.has(cid)) {rejection(plan,index,'canonical_identity_missing_or_ambiguous',detail);continue;}
      if (!market) {rejection(plan,index,'unsupported_market_or_selection',detail);continue;}
      const kickoff = timestamp(f.kickoffUtc ?? f.kickoff ?? f.startTime);
      const pickKickoff = timestamp(pick.kickoffUtc ?? pick.kickoff);
      if (!Number.isFinite(kickoff) || !Number.isFinite(at)) {rejection(plan,index,'required_forecast_time_or_kickoff_missing',detail);continue;}
      if (at>nowMs) {rejection(plan,index,'source_forecast_timestamp_in_future',detail);continue;}
      if (Number.isFinite(pickKickoff)&&pickKickoff!==kickoff || athensDayKey(new Date(kickoff))!==day) {
        rejection(plan,index,'source_canonical_kickoff_or_day_conflict',detail);continue;
      }
      if (at>=kickoff || kickoff-nowMs<unifiedSpec.minimumLeadSeconds*1000) {
        rejection(plan,index,'forecast_or_capture_too_late',detail);continue;
      }
      if (!['NS','PRE','PRE_KICKOFF','SCHEDULED','NOT_STARTED','STATUS_SCHEDULED','STATUS_NOT_STARTED','STATUS_PRE'].includes(String(f.status || '').toUpperCase())) {
        rejection(plan,index,'fixture_not_scheduled',detail);continue;
      }
      const score = plan.startsWith('A') ? pick.score : pick.modelProb;
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
        rejection(plan,index,'numeric_score_missing_or_invalid',detail);continue;
      }
      const row = {canonicalMatchId:cid, matchId:cid, market:market[0],pick:market[1],kickoffUtc:new Date(kickoff).toISOString(),
        leagueSlug:f.leagueSlug || pick.leagueSlug || null, score, scoreField:plan.startsWith('A') ? 'score' : 'modelProb',
        confidence:pick.confidence ?? null, sourceIndex:index, forecastAt:new Date(at).toISOString()};
      baselineSelections[plan].push(row);
    }
    const byKey = new Map();
    for (const row of baselineSelections[plan]) {const k=selectionKey(row);byKey.set(k,[...(byKey.get(k)||[]),row]);}
    baselineSelections[plan] = [];
    for (const group of byKey.values()) {
      if (group.length !== 1) {for (const row of group) rejection(plan,row.sourceIndex,'duplicate_source_selection',row);continue;}
      const row = group[0];baselineSelections[plan].push(row);
      if (quality.foundationBlocked) {rejection(plan,row.sourceIndex,'reported_foundation_block',row);continue;}
      if (row.score < unifiedSpec.minimumEachVariantScore) {rejection(plan,row.sourceIndex,'below_declared_score_floor',row);continue;}
      valid[plan].push(row);
    }
  }
  const combined = new Map();
  for (const [family,plans] of Object.entries(unifiedSpec.families)) {
    const [left,right] = plans, r = new Map(valid[right].map(p => [selectionKey(p),p]));
    const l = new Map(valid[left].map(p => [selectionKey(p),p]));
    for (const plan of plans) for (const row of valid[plan]) {
      if (!(plan===left ? r : l).has(selectionKey(row))) rejection(plan,row.sourceIndex,'paired_variant_has_no_eligible_identical_selection',row);
    }
    for (const [key,base] of l) {
      const adjusted = r.get(key);if (!adjusted) continue;
      const existing = combined.get(key) || {canonicalMatchId:base.canonicalMatchId, matchId:base.matchId,
        market:base.market,pick:base.pick,kickoffUtc:base.kickoffUtc,leagueSlug:base.leagueSlug,families:[],sourceScores:{}};
      existing.families.push(family);existing.sourceScores[left]=base.score;existing.sourceScores[right]=adjusted.score;
      combined.set(key,existing);
    }
  }
  const sides = new Map();
  for (const p of combined.values()) {const k=[p.canonicalMatchId,p.market].join('|');sides.set(k,new Set([...(sides.get(k)||[]),p.pick]));}
  const picks=[];
  for (const p of combined.values()) {
    if (sides.get([p.canonicalMatchId,p.market].join('|')).size>1) {
      decisions.push({decision:'REJECTED',reason:'conflicting_family_selections',...p});
    } else {picks.push(p);decisions.push({decision:'SELECTED',reason:'declared_family_pair_rule',...p});}
  }
  picks.sort((a,b)=>selectionKey(a).localeCompare(selectionKey(b)));
  const declaredCounts=coverageByPlan.map(x=>x.universeCount);
  const knownCounts=declaredCounts.filter(Number.isInteger),knownHashes=coverageByPlan.map(x=>x.universeHash).filter(x=>typeof x==='string'&&x);
  const universeMismatch=knownCounts.some(n=>n!==canonicalById.size)||new Set(knownHashes).size>1;
  const sameUniverse=knownCounts.length===4&&knownHashes.length===4&&!universeMismatch;
  const inputGapReasons=new Set(['canonical_identity_missing_or_ambiguous','required_forecast_time_or_kickoff_missing',
    'source_forecast_timestamp_in_future','source_canonical_kickoff_or_day_conflict','numeric_score_missing_or_invalid',
    'duplicate_source_selection','reported_foundation_block']);
  const selectedSourceInputGaps=decisions.filter(d=>inputGapReasons.has(d.reason)).length;
  const reportedGaps=coverageByPlan.some(x=>x.status==='INCOMPLETE')||universeMismatch||ambiguous.size>0||selectedSourceInputGaps>0;
  const payload={schema:'ai-matchlab.unified-shadow-observation.v1',candidateId:unifiedSpec.candidateId,specSha256,
    date:day,generatedAt:now,immutable:true,run,
    stage:'postprocess_of_captured_selected_forecasts',
    mode:'shadow_only',productionReplacement:false,historicalReplay:false,
    selectionStatus:picks.length?'PICKS_PRESENT':fixtures.length?'ZERO_AFTER_DECLARED_FILTERS':'NO_CANONICAL_FIXTURES',
    upstreamCoverage:reportedGaps?'INCOMPLETE':!sameUniverse||coverageByPlan.some(x=>x.status==='UNKNOWN')?'UNKNOWN':'REPORTED_ACCOUNTED_NOT_FULL_LINEAGE_CERTIFIED',
    canonicalFixtureCount:canonicalById.size,ambiguousCanonicalIds:[...ambiguous].sort(),
    declaredUniverseCounts:declaredCounts,universeCountAgreement:sameUniverse,
    selectedSourceInputGaps,
    count:picks.length,picks,baselineSelections,decisions,coverageByPlan,inputFiles,
    noPicksDoesNotCertifyUpstreamSuccessfulZero:true,combinedCalibratedProbability:null};
  return {...payload,observationSignature:signature(payload)};
}

export function validateUnifiedShadow(value) {
  assertUnified(value?.schema==='ai-matchlab.unified-shadow-observation.v1' && value.candidateId===unifiedSpec.candidateId &&
    value.specSha256===specSha256 && value.immutable===true && Array.isArray(value.picks) && value.count===value.picks.length,
    'unified_existing_observation_invalid');
  assertUnified(/^\d{4}-\d{2}-\d{2}$/u.test(value.date)&&value.date>=unifiedSpec.earliestTargetDay&&
    Number.isFinite(Date.parse(value.generatedAt))&&value.mode==='shadow_only'&&value.productionReplacement===false&&
    Array.isArray(value.inputFiles),'unified_existing_scope_invalid');
  const {observationSignature,...body}=value;
  assertUnified(signature(body)===observationSignature,'unified_existing_observation_signature_mismatch');
  for (const f of value.inputFiles) assertUnified(digest(Buffer.from(f.rawUtf8,'utf8'))===f.sha256,'unified_input_copy_hash_mismatch');
  return value;
}
