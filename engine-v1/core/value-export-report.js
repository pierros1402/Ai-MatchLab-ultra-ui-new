import {validatePlanCShadowExportPayload} from '../value/plan-c-shadow-export.js';
import {athensDayFromKickoff} from './daykey.js';
import {valueExportIdentity} from './value-export-identity.js';
import {isUnifiedPublicDay} from '../value/unified-public-plan.js';
export const VALUE_EXPORT_PLAN_ORDER = Object.freeze([
  Object.freeze({ key: "A", id: "plan-a", label: "Plan A" }),
  Object.freeze({ key: "A2", id: "plan-a2", label: "Plan A2" }),
  Object.freeze({ key: "B", id: "plan-b", label: "Plan B" }),
  Object.freeze({ key: "B2", id: "plan-b2", label: "Plan B2" })
]);

const UNIFIED_EXPORT_PLAN=Object.freeze({key:'U1',id:'plan-u1',label:'Ενιαίο πλάνο'});
export const AUTONOMOUS_EXPORT_PLAN=Object.freeze({key:'B_AUTO',id:'plan-autonomous-preview',label:'Plan B (Autonomous — Research)',researchOnly:true,publicationAuthorized:false});
export const SHADOW_EXPORT_PLAN=Object.freeze({key:'C_SHADOW',id:'plan-c-shadow',label:'Plan C (Shadow)',researchOnly:true,productionEligible:false});
function planApplies(key,date){
 if(key==='C_SHADOW')return true;
 return (key==='U1'||key==='B_AUTO')===isUnifiedPublicDay(date);
}
export function valueExportPlanOrder(days,{includeAutonomous=false,includeShadow=false}={}){
  const old=days.some(d=>!isUnifiedPublicDay(d)),unified=days.some(isUnifiedPublicDay);
  return [...(old?VALUE_EXPORT_PLAN_ORDER:[]),...(unified?[UNIFIED_EXPORT_PLAN]:[]),...(unified&&includeAutonomous?[AUTONOMOUS_EXPORT_PLAN]:[]),...(includeShadow?[SHADOW_EXPORT_PLAN]:[])];
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function valueExportPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function valueExportOptionalPlan(value) {
  return (
    value === undefined ||
    value === null ||
    valueExportPlainObject(value)
  );
}

function zeroValueExportSummary() {
  return {
    picks: 0,
    uniqueMatches: 0,
    settled: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    unresolved: 0,
    unsupported: 0,
    hitRate: null,
    oddsAvailable: 0,
    averageOdds: null,
    totalStake: null,
    totalReturn: null,
    profit: null,
    roi: null
  };
}

export function prepareValueComparisonForExport({
  date,
  comparison
}) {
  const expectedDate = clean(date);

  if (
    !valueExportPlainObject(comparison) ||
    comparison.ok !== true ||
    clean(comparison.date) !== expectedDate
  ) {
    return {
      ok: false,
      reason: "value_comparison_payload_invalid"
    };
  }

  const sourcePlans =
    valueExportPlainObject(comparison.plans)
      ? comparison.plans
      : {};

  const allFourPlansValid =
    ["A", "A2", "B", "B2"].every(
      planKey =>
        valueExportPlainObject(sourcePlans[planKey])
    );

  if (allFourPlansValid) {
    return {
      ok: true,
      kind: "FOUR_PLAN",
      comparison
    };
  }

  const legacyABValid =
    valueExportPlainObject(sourcePlans.A) &&
    valueExportPlainObject(sourcePlans.B) &&
    valueExportOptionalPlan(sourcePlans.A2) &&
    valueExportOptionalPlan(sourcePlans.B2);

  if (legacyABValid) {
    return {
      ok: true,
      kind: "LEGACY_AB",
      comparison
    };
  }

  const planAAvailability =
    valueExportPlainObject(
      comparison.planAAvailability
    )
      ? comparison.planAAvailability
      : {};

  const planBAvailability =
    valueExportPlainObject(
      comparison.planBAvailability
    )
      ? comparison.planBAvailability
      : {};

  const unrecoverablePlanAValid = Boolean(
    comparison.comparisonEligible === false &&
    planAAvailability.status === "unrecoverable" &&
    clean(planAAvailability.reason) &&
    sourcePlans.A === null &&
    valueExportPlainObject(sourcePlans.B) &&
    valueExportOptionalPlan(sourcePlans.A2) &&
    valueExportOptionalPlan(sourcePlans.B2)
  );

  if (unrecoverablePlanAValid) {
    return {
      ok: true,
      kind: "PLAN_A_UNRECOVERABLE",
      comparison
    };
  }

  const provenance =
    valueExportPlainObject(comparison.provenance)
      ? comparison.provenance
      : {};

  const signature =
    clean(
      planAAvailability.observationSignature
    ).toLowerCase();

  const evidenceBoundPlanAZero = Boolean(
    comparison.comparisonEligible === false &&
    planAAvailability.available === true &&
    Number(planAAvailability.count) === 0 &&
    planAAvailability.immutable === true &&
    /^[a-f0-9]{64}$/u.test(signature) &&
    planBAvailability.available === false &&
    clean(planBAvailability.reason) &&
    provenance.kind ===
      "evidence_bound_runner_recovery" &&
    Array.isArray(provenance.runIds) &&
    provenance.runIds.length > 0 &&
    Object.keys(sourcePlans).length === 0
  );

  if (evidenceBoundPlanAZero) {
    return {
      ok: true,
      kind: "EVIDENCE_BOUND_PLAN_A_ZERO",
      comparison: {
        ...comparison,
        plans: {
          A: {
            id: "plan-a",
            label:
              "Plan A - frozen production observation",
            immutable: true,
            count: 0,
            summary: zeroValueExportSummary(),
            picks: [],
            provenance:
              comparison.provenance || null
          }
        }
      }
    };
  }

  return {
    ok: false,
    reason: "value_comparison_payload_invalid"
  };
}

function valueExportPlanAvailabilityReason(
  comparison,
  planKey,
  available
) {
  if (available) return null;

  const explicitReason =
    planKey === "A"
      ? clean(
          comparison?.planAAvailability?.reason
        )
      : planKey === "B"
        ? clean(
            comparison?.planBAvailability?.reason
          )
        : "";

  if (explicitReason) return explicitReason;

  if (planKey === "A2" || planKey === "B2") {
    return "historical_plan_not_present_in_artifact";
  }

  return "historical_plan_not_available";
}

export function normalizeValueSettlement(value) {
  const normalized = upper(value).replace(/[\s-]+/gu, "_");

  if (["WIN", "WON"].includes(normalized)) return "WIN";
  if (["LOSS", "LOST"].includes(normalized)) return "LOSS";
  if (["VOID", "PUSH", "PUSHED"].includes(normalized)) return "VOID";
  if (["UNSUPPORTED", "NOT_SUPPORTED"].includes(normalized)) return "UNSUPPORTED";
  if (["UNRESOLVED", "PENDING", "UNSETTLED", ""].includes(normalized)) {
    return "UNRESOLVED";
  }

  return "UNSUPPORTED";
}

export function normalizeValueMarketSelection(marketValue, pickValue) {
  const market = clean(marketValue);
  const pick = clean(pickValue);
  const marketKey = upper(market).replace(/[^A-Z0-9]+/gu, "");
  const pickKey = upper(pick).replace(/[^A-Z0-9]+/gu, "");

  const goalLine =
    marketKey === "OU15" || marketKey.includes("UNDER15") ? "1.5" :
      marketKey === "OU25" || marketKey.includes("UNDER25") ? "2.5" :
        marketKey === "OU35" || marketKey.includes("UNDER35") ? "3.5" : null;

  if (goalLine) {
    const selection = pickKey.includes("UNDER") ? `Under ${goalLine}` : `Over ${goalLine}`;
    return {
      marketKey: `OU${goalLine.replace(".", "")}`,
      marketLabel: `Over / Under ${goalLine}`,
      selectionKey: selection.toUpperCase().replace(/[^A-Z0-9]+/gu, "_"),
      selectionLabel: selection
    };
  }

  if (marketKey === "BTTS" || marketKey.includes("BOTHTEAMSTOSCORE")) {
    const yes = !pickKey.includes("NO");
    return {
      marketKey: "BTTS",
      marketLabel: "BTTS",
      selectionKey: yes ? "YES" : "NO",
      selectionLabel: yes ? "BTTS Yes" : "BTTS No"
    };
  }

  if (marketKey === "1X2") {
    const selection =
      ["1", "HOME"].includes(pickKey) ? "1" :
        ["X", "DRAW"].includes(pickKey) ? "X" :
          ["2", "AWAY"].includes(pickKey) ? "2" : (pick || "Unknown");

    return {
      marketKey: "1X2",
      marketLabel: "1X2",
      selectionKey: upper(selection),
      selectionLabel: selection
    };
  }

  if (marketKey === "DC" || marketKey.includes("DOUBLECHANCE")) {
    const selection = ["1X", "X2", "12"].includes(pickKey) ? pickKey : (pick || "Unknown");
    return {
      marketKey: "DC",
      marketLabel: "Double Chance",
      selectionKey: upper(selection),
      selectionLabel: selection
    };
  }

  return {
    marketKey: marketKey || "UNKNOWN",
    marketLabel: market || "Unknown",
    selectionKey: pickKey || "UNKNOWN",
    selectionLabel: pick || "Unknown"
  };
}

function scoreKey(value) {
  if (!value || typeof value !== "object") return null;
  if (clean(value.scoreKey)) return clean(value.scoreKey);
  const home = finiteNumber(value.homeScore);
  const away = finiteNumber(value.awayScore);
  return home === null || away === null ? null : `${home}-${away}`;
}

function normalizePickRow(date, plan, source, pick) {
  const market = normalizeValueMarketSelection(pick?.market ?? pick?.marketName, pick?.pick);
  const result = normalizeValueSettlement(pick?.result ?? pick?.settlement);
  const identity = valueExportIdentity(pick,date);
  const valid = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  const sourceScores = (plan.key === "U1" || pick?.unified === true) ? Object.fromEntries(["A", "A2", "B", "B2"]
      .filter(k => valid(pick?.sourceScores?.[k])).map(k => [k, pick.sourceScores[k]])) : null;
  const scores = Object.values(sourceScores || {});
  const probabilityPlan = plan.key === "B_AUTO" || plan.key === "C_SHADOW";
  const originalPickValue = sourceScores !== null ? (scores.length && scores.every(n => n === scores[0]) ? scores[0] : null)
    : probabilityPlan ? (valid(pick?.marketProb) ? pick.marketProb : null) : (valid(pick?.score) ? pick.score : null);
  const originalPickValueKind = sourceScores !== null ? (scores.length ? "SOURCE_SCORES" : null)
    : originalPickValue === null ? null : probabilityPlan ? "MODEL_PROBABILITY" : "MODEL_SCORE";

  let finalScore = scoreKey(pick?.finalScore);
  if (plan.key === "U1" || plan.key === "B_AUTO") {
    const {scoreHome, scoreAway} = pick?.settlementTruth || {};
    const verified = [scoreHome, scoreAway].every(n => Number.isInteger(n) && n >= 0) ? `${scoreHome}-${scoreAway}` : null;
    finalScore = ["WIN", "LOSS"].includes(result) && (plan.key !== "B_AUTO" || pick.timingCertified === true) && verified &&
      (pick.finalScore == null || finalScore === verified) ? verified : null;
  }
  return {
    date,
    planKey: plan.key,
    planId: clean(pick?.planId) || plan.id,
    planLabel: plan.label,
    ...identity,
    kickoff: pick?.kickoff ?? pick?.kickoffUtc ?? null,
    country: clean(pick?.country) || null,
    leagueSlug: clean(pick?.leagueSlug) || null,
    leagueName: clean(pick?.leagueName) || null,
    homeTeam: clean(pick?.homeTeam) || null,
    awayTeam: clean(pick?.awayTeam) || null,
    market: clean(pick?.market ?? pick?.marketName) || null,
    pick: clean(pick?.pick) || null,
    marketKey: market.marketKey,
    marketLabel: market.marketLabel,
    selectionKey: market.selectionKey,
    selectionLabel: market.selectionLabel,
    score: finiteNumber(pick?.score),
    // Preserve producer-native original values; never synthesize a Combined score.
    sourceScores,
    originalPickValue,
    originalPickValueKind,
    confidence: finiteNumber(pick?.confidence) ?? pick?.confidence ?? null,
    readiness: finiteNumber(pick?.readiness),
    marketProb: finiteNumber(pick?.marketProb),
    aiFairOdds: finiteNumber(pick?.aiFairOdds),
    oddsDecimal: finiteNumber(pick?.oddsDecimal ?? pick?.exportOdds),
    finalScore,
    finalStatus: finalScore && (plan.key === "U1" || plan.key === "B_AUTO") ? "FT" : clean(pick?.finalStatus) || null,
    result,
    source: clean(source) || null
  };
}

export function comparisonToValueExportDay({ date, comparison, source = "value_comparison" }) {
  const plans = {};
  const sourcePlans = isUnifiedPublicDay(date) ? {U1:comparison?.unifiedPlan} : comparison?.plans && typeof comparison.plans === "object"
    ? comparison.plans
    : {};

  for (const plan of valueExportPlanOrder([date])) {
    const rawPlan = Object.prototype.hasOwnProperty.call(sourcePlans, plan.key)
      ? sourcePlans[plan.key]
      : undefined;
    const available = rawPlan !== undefined && rawPlan !== null && typeof rawPlan === "object" && (plan.key!=="U1" || rawPlan.date===date && rawPlan.status==="AVAILABLE" && Array.isArray(rawPlan.picks) && rawPlan.count===rawPlan.picks.length);
    const rawPicks = available && Array.isArray(rawPlan.picks) ? rawPlan.picks : [];

    plans[plan.key] = {
      ...plan,
      available,
      availabilityReason:
        valueExportPlanAvailabilityReason(
          comparison,
          plan.key,
          available
        ),
      source,
      analysisComplete: rawPlan?.analysisComplete,
      declaredSummary: available && rawPlan.summary && typeof rawPlan.summary === "object"
        ? rawPlan.summary
        : null,
      picks: rawPicks.map(pick => normalizePickRow(date, plan, source, pick))
    };
  }

  return { date, source, plans };
}

// The caller supplies only the comparison exposed by the pinned runtime reader.
// Keep new research keys distinct from historical B and preserve native settlements.
export function attachAutonomousExportDay(day, comparison){
 const plan=AUTONOMOUS_EXPORT_PLAN, p=comparison?.autonomousPreview;
 if(!isUnifiedPublicDay(day.date))return day;
 const available=comparison?.ok===true&&comparison.date===day.date&&comparison.autonomousPreviewMode===true&&
   p?.id===plan.id&&p.date===day.date&&p.status==='RESEARCH_ONLY'&&p.publicationAuthorized===false&&
   p.analysisComplete===false&&Array.isArray(p.picks)&&p.count===p.picks.length&&p.picks.every(row=>
     row?.researchOnly===true&&typeof row.modelProb==='number'&&Number.isFinite(row.modelProb)&&row.modelProb>=0&&row.modelProb<=1&&
     Number.isFinite(Date.parse(row.kickoffUtc))&&athensDayFromKickoff(row.kickoffUtc)===day.date&&
     ['PENDING','UNRESOLVED','WIN','LOSS','VOID'].includes(row.result)&&
     (!['WIN','LOSS','VOID'].includes(row.result)||(row.timingCertified===true&&row.settlementTruth!=null))
   );
 const source='pinned_autonomous_research';
 const picks=available?p.picks.map(row=>({...normalizePickRow(day.date,plan,source,{
   ...row,planId:plan.id,marketProb:row.modelProb,score:null,confidence:null,
   finalScore:row.timingCertified===true&&['WIN','LOSS'].includes(row.result)?row.finalScore:null
 }),researchOnly:true,publicationAuthorized:false,timingCertified:row.timingCertified===true,
    publicationRecord:row.publicationRecord??null})):[];
 day.plans[plan.key]={...plan,available,availabilityReason:available?null:'autonomous_research_not_available',source,analysisComplete:available?false:undefined,declaredSummary:available?p.summary:null,picks};
 return day;
}

export function attachShadowExportDay(day, loaded){
 const plan=SHADOW_EXPORT_PLAN,p=loaded?.payload;
 const cohortAsOf=loaded?.scope==='CUMULATIVE_AS_OF';
 const available=p?.available===true&&validatePlanCShadowExportPayload(p,cohortAsOf?p.date:day.date).ok;
 const source='plan_c_shadow:'+String(loaded?.source||'unavailable')+(cohortAsOf&&available?':as_of='+p.date:'');
 const rows=available?p.entries.filter(e=>e.prediction.planCPick===true&&athensDayFromKickoff(e.prediction.kickoffUtc)===day.date).map(e=>{
   const q=e.prediction,t=e.settlement.truth,settled=e.settlement.state==='SETTLED';
   const result=e.settlement.state==='VOID_EXCLUDED'?'VOID':settled?(t.scoreHome+t.scoreAway>=3?'WIN':'LOSS'):'PENDING';
   return {...normalizePickRow(day.date,plan,source,{planId:plan.id,canonicalMatchId:q.canonicalFixtureId,matchId:q.canonicalFixtureId,
     kickoffUtc:q.kickoffUtc,leagueSlug:q.leagueSlug,leagueName:q.leagueName,country:q.country,homeTeam:q.homeTeam,awayTeam:q.awayTeam,
     market:'OU25',pick:'over',marketProb:q.adjusted.pOver25,result,finalStatus:settled?'FT':null,
     finalScore:settled?{scoreKey:`${t.scoreHome}-${t.scoreAway}`}:null}),researchOnly:true,productionEligible:false,predictionSignature:q.predictionSignature};
 }):[];
 day.plans[plan.key]={...plan,available,availabilityReason:available?null:'plan_c_shadow_not_available',source,analysisComplete:available?false:undefined,declaredSummary:null,picks:rows};
 return day;
}

export function fallbackPlanAToValueExportDay({ date, picks = [], source = "snapshot_value" }) {
  const plans = {};

  for (const plan of valueExportPlanOrder([date])) {
    const available = plan.key === "A";
    plans[plan.key] = {
      ...plan,
      available,
      source,
      declaredSummary: null,
      picks: available
        ? picks.filter(pick => pick && typeof pick === "object")
          .map(pick => normalizePickRow(date, plan, source, pick))
        : []
    };
  }

  return { date, source, plans };
}

function emptyCounts() {
  return {
    picks: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    unresolved: 0,
    unsupported: 0,
    winRate: null
  };
}

function finalizeCounts(counts) {
  const decided = counts.wins + counts.losses;
  return {
    ...counts,
    winRate: decided > 0 ? Number((counts.wins / decided).toFixed(4)) : null
  };
}

export function summarizeValueRows(rows) {
  const counts = emptyCounts();

  for (const row of rows) {
    counts.picks += 1;
    if (row.result === "WIN") counts.wins += 1;
    else if (row.result === "LOSS") counts.losses += 1;
    else if (row.result === "VOID") counts.voids += 1;
    else if (row.result === "UNSUPPORTED") counts.unsupported += 1;
    else counts.unresolved += 1;
  }

  return finalizeCounts(counts);
}

function addCounts(target, source) {
  for (const key of ["picks", "wins", "losses", "voids", "unresolved", "unsupported"]) {
    target[key] += Number(source?.[key] || 0);
  }
}

function planDayStatus(available, summary) {
  if (!available) return "NO_PLAN_RECORD";
  if (summary.unresolved > 0 || summary.unsupported > 0) return "INCOMPLETE";
  // This report reads stored picks/settlements. It does not verify successful
  // execution or complete required inputs, so an empty array cannot prove zero
  // values, no fixtures, or a successfully completed plan.
  return summary.picks > 0 ? "COMPLETE_WITH_PICKS" : "ZERO_PICKS_UNVERIFIED";
}

function duplicateKey(row) {
  return [
    row.canonicalMatchId || row.matchId || "missing_match",
    row.marketKey,
    row.selectionKey
  ].join("|");
}

function declaredCount(summary, key) {
  const value = finiteNumber(summary?.[key]);
  return value === null ? null : value;
}

function marketBreakdown(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.marketKey}|${row.selectionKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        marketKey: row.marketKey,
        market: row.marketLabel,
        selectionKey: row.selectionKey,
        selection: row.selectionLabel,
        rows: []
      });
    }
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map(group => ({
      marketKey: group.marketKey,
      market: group.market,
      selectionKey: group.selectionKey,
      selection: group.selection,
      ...summarizeValueRows(group.rows)
    }))
    .sort((a, b) =>
      a.market.localeCompare(b.market) || a.selection.localeCompare(b.selection)
    );
}

export function buildValueExportReport({ from, to, days, dayRecords, today, includeAutonomous=false, includeShadow=false }) {
  const recordsByDay = new Map(dayRecords.map(record => [record.date, record]));
  const integrity = {
    status: "COMPLETE",
    issues: [],
    missingDays: [],
    unavailablePlanDays: [],
    unverifiedZeroPickDays: [],
    incompleteInputDays: [],
    unresolvedClosedDays: [],
    unsupportedRows: [],
    duplicatePicks: [],
    countMismatches: [],
    identityGaps: []
  };
  const plans = {};
  let totalRows = 0;

  const planOrder=valueExportPlanOrder(days,{includeAutonomous,includeShadow});
  for (const plan of planOrder) {
    const picks = [];
    const daily = [];
    const rangeCounts = emptyCounts();
    let availableDays = 0;
    let notAvailableDays = 0;
    let missingDayRecords = 0;

    for (const date of days) {
      if(!planApplies(plan.key,date))continue;
      const record = recordsByDay.get(date);
      if (!record || (record.comparisonMissing===true&&plan.key!=='C_SHADOW')) {
        missingDayRecords += 1;
        integrity.missingDays.push(date);
        daily.push({ date, status: "MISSING_DAY", ...emptyCounts() });
        continue;
      }

      const planDay = record.plans?.[plan.key];
      if(planDay?.analysisComplete===false)integrity.incompleteInputDays.push({date,plan:plan.key});
      const available = Boolean(planDay?.available);
      const rows = available && Array.isArray(planDay.picks) ? planDay.picks : [];
      for (const row of rows) if(row.canonicalIdentityStatus !== 'RECORDED_CANONICAL_ID')
        integrity.identityGaps.push({date,plan:plan.key,matchId:row.matchId,status:row.canonicalIdentityStatus});
      const summary = summarizeValueRows(rows);
      const status = planDayStatus(available, summary);
      if (status === "ZERO_PICKS_UNVERIFIED") {
        integrity.unverifiedZeroPickDays.push({date, plan:plan.key, reason:"successful_execution_and_required_inputs_not_verified"});
      }

      const availabilityReason =
        available
          ? null
          : clean(planDay?.availabilityReason) ||
            "plan_not_available";

      if (available) {
        availableDays += 1;
      } else {
        notAvailableDays += 1;
        integrity.unavailablePlanDays.push({
          date,
          plan: plan.key,
          reason: availabilityReason
        });
      }

      daily.push({
        date,
        status,
        availabilityReason,
        statusReason: status === "ZERO_PICKS_UNVERIFIED" ? "successful_execution_and_required_inputs_not_verified" :
          status === "NO_PLAN_RECORD" ? "stored_plan_record_missing_not_proof_plan_did_not_exist" : null,
        ...summary
      });
      picks.push(...rows.map(row=>plan.key==='U1'&&includeAutonomous?{...row,planLabel:'Plan A (Combined)'}:row));
      addCounts(rangeCounts, summary);

      if (available && planDay.declaredSummary) {
        const expected = {
          picks: declaredCount(planDay.declaredSummary, "picks"),
          wins: declaredCount(planDay.declaredSummary, "wins"),
          losses: declaredCount(planDay.declaredSummary, "losses"),
          voids: declaredCount(planDay.declaredSummary, "voids"),
          unresolved: declaredCount(planDay.declaredSummary, "unresolved")
        };
        const actual = {
          picks: summary.picks,
          wins: summary.wins,
          losses: summary.losses,
          voids: summary.voids,
          unresolved: summary.unresolved
        };

        for (const key of Object.keys(expected)) {
          if (expected[key] !== null && expected[key] !== actual[key]) {
            integrity.countMismatches.push({ date, plan: plan.key, metric: key, expected: expected[key], actual: actual[key] });
          }
        }
      }

      if (date < today && summary.unresolved > 0) {
        integrity.unresolvedClosedDays.push({ date, plan: plan.key, unresolved: summary.unresolved });
      }

      if (summary.unsupported > 0) {
        integrity.unsupportedRows.push({ date, plan: plan.key, unsupported: summary.unsupported });
      }

      const seen = new Set();
      for (const row of rows) {
        const key = duplicateKey(row);
        if (seen.has(key)) integrity.duplicatePicks.push({ date, plan: plan.key, key });
        seen.add(key);
      }
    }

    const range = {
      from,
      to,
      availableDays,
      notAvailableDays,
      recordedPlanDays: availableDays,
      noPlanRecordDays: notAvailableDays,
      missingDayRecords,
      totalDays: days.filter(d=>planApplies(plan.key,d)).length,
      dayCountBasis: "stored_plan_records_not_execution_or_plan_availability",
      ...finalizeCounts(rangeCounts)
    };

    plans[plan.key] = {
      ...plan,
      ...(plan.key==='U1'&&includeAutonomous?{label:'Plan A (Combined)'}:{}),
      picks,
      daily,
      range,
      markets: marketBreakdown(picks)
    };
    totalRows += picks.length;
  }

  integrity.missingDays = [...new Set(integrity.missingDays)].sort();
  integrity.issues = [
    ...integrity.identityGaps.map(issue=>({code:"VALUE_EXPORT_CANONICAL_IDENTITY_UNVERIFIED",...issue})),
    ...integrity.incompleteInputDays.map(issue=>({code:"VALUE_EXPORT_INPUT_COVERAGE_INCOMPLETE",...issue})),
    ...integrity.missingDays.map(date => ({ code: "VALUE_EXPORT_DAY_MISSING", date })),
    ...integrity.unresolvedClosedDays.map(issue => ({ code: "VALUE_EXPORT_CLOSED_DAY_UNRESOLVED", ...issue })),
    ...integrity.unsupportedRows.map(issue => ({ code: "VALUE_EXPORT_UNSUPPORTED_SETTLEMENT", ...issue })),
    ...integrity.duplicatePicks.map(issue => ({ code: "VALUE_EXPORT_DUPLICATE_PICK", ...issue })),
    ...integrity.countMismatches.map(issue => ({ code: "VALUE_EXPORT_COUNT_MISMATCH", ...issue })),
    ...integrity.unverifiedZeroPickDays.map(issue => ({ code:"VALUE_EXPORT_ZERO_PICKS_UNVERIFIED", ...issue })),
    ...integrity.unavailablePlanDays.map(issue => ({ code: "VALUE_EXPORT_PLAN_RECORD_ABSENT", ...issue }))
  ];
  integrity.status = integrity.issues.length > 0 ? "INCOMPLETE" : "COMPLETE";

  return {
    ok: true,
    schema: "ai-matchlab.value-export-report.v2",
    from,
    to,
    dayCount: days.length,
    days: [...days],
    totalRows,
    planOrder: planOrder.map(plan => plan.key),
    plans,
    integrity
  };
}

export function valueExportCsvRecords(report) {
  const records = [];

  for (const planKey of report.planOrder) {
    const plan = report.plans[planKey];
    for (const row of plan.picks) records.push({ recordType: "PICK", ...row });
    for (const row of plan.daily) records.push({ recordType: "DAILY_SUMMARY", planKey, planLabel: plan.label, ...row });
    records.push({ recordType: "RANGE_SUMMARY", planKey, planLabel: plan.label, ...plan.range });
    for (const row of plan.markets) records.push({ recordType: "MARKET_SUMMARY", planKey, planLabel: plan.label, ...row });
  }

  return records;
}
