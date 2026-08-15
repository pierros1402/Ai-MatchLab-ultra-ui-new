import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isValueSettlementVoidState } from "../core/non-played-state.js";
import { resolveApprovedFlashscoreNonPlayedDecision } from "../source-discovery/flashscore-nonplayed-decisions.js";
import { planAObservationSignature } from "../value/plan-a-observation.js";

function clean(value) {
  return String(value ?? "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function summarize(rows) {
  const settledRows = rows.filter(row => row.result === "WIN" || row.result === "LOSS");
  const wins = rows.filter(row => row.result === "WIN").length;
  const losses = rows.filter(row => row.result === "LOSS").length;
  const voids = rows.filter(row => row.result === "VOID").length;
  const unresolved = rows.filter(row => row.result === "UNRESOLVED").length;
  const unsupported = rows.filter(row => row.result === "UNSUPPORTED").length;
  const oddsRows = settledRows.filter(row => Number.isFinite(row.oddsDecimal) && row.oddsDecimal > 1);
  const totalReturn = oddsRows.reduce(
    (sum, row) => sum + (row.result === "WIN" ? row.oddsDecimal : 0),
    0
  );

  return {
    picks: rows.length,
    uniqueMatches: new Set(rows.map(row => row.matchId).filter(Boolean)).size,
    settled: settledRows.length,
    wins,
    losses,
    voids,
    unresolved,
    unsupported,
    hitRate: settledRows.length ? Number((wins / settledRows.length).toFixed(4)) : null,
    oddsAvailable: oddsRows.length,
    averageOdds: oddsRows.length
      ? Number((oddsRows.reduce((sum, row) => sum + row.oddsDecimal, 0) / oddsRows.length).toFixed(4))
      : null,
    totalStake: oddsRows.length || null,
    totalReturn: oddsRows.length ? Number(totalReturn.toFixed(4)) : null,
    profit: oddsRows.length ? Number((totalReturn - oddsRows.length).toFixed(4)) : null,
    roi: oddsRows.length
      ? Number(((totalReturn - oddsRows.length) / oddsRows.length).toFixed(4))
      : null
  };
}

function delta(b, a) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return Number((b - a).toFixed(4));
}

function comparisonDeltas(planA, planB) {
  return {
    pickDeltaPlanBMinusPlanA: delta(planB.picks, planA.picks),
    settledDeltaPlanBMinusPlanA: delta(planB.settled, planA.settled),
    winsDeltaPlanBMinusPlanA: delta(planB.wins, planA.wins),
    lossesDeltaPlanBMinusPlanA: delta(planB.losses, planA.losses),
    hitRateDeltaPlanBMinusPlanA: delta(planB.hitRate, planA.hitRate),
    roiDeltaPlanBMinusPlanA: delta(planB.roi, planA.roi)
  };
}

export function recoverHistoricalNonPlayedValueVoid({
  dayKey,
  canonicalId,
  providerMatchId,
  comparisonPath,
  planAPath,
  planAPathLabel = planAPath,
  archivedDetailPath,
  archivedDetailPathLabel = archivedDetailPath,
  recoveredAt = new Date().toISOString(),
  resolveDecision = resolveApprovedFlashscoreNonPlayedDecision
}) {
  const comparison = readJson(comparisonPath);
  const planAObservation = readJson(planAPath);
  const archivedDetail = readJson(archivedDetailPath);
  const fixture = archivedDetail?.basic;
  const decision = resolveDecision({ dayKey, canonicalId, providerMatchId });

  if (
    !decision ||
    clean(decision.dayKey) !== clean(dayKey) ||
    clean(decision.canonicalId) !== clean(canonicalId) ||
    clean(decision.providerMatchId) !== clean(providerMatchId) ||
    clean(decision.resolvedStatus) !== "STATUS_POSTPONED"
  ) {
    return { ok: false, reason: "approved_nonplayed_decision_missing_or_mismatched" };
  }
  if (
    clean(fixture?.canonicalId || fixture?.matchId) !== clean(canonicalId) ||
    clean(fixture?.providerMatchId) !== clean(providerMatchId) ||
    !isValueSettlementVoidState(fixture) ||
    fixture?.scoreHome !== null ||
    fixture?.scoreAway !== null
  ) {
    return { ok: false, reason: "archived_nonplayed_fixture_evidence_invalid" };
  }
  if (
    planAObservation?.immutable !== true ||
    clean(planAObservation?.observationSignature) !==
      planAObservationSignature(dayKey, planAObservation)
  ) {
    return { ok: false, reason: "immutable_plan_a_observation_invalid" };
  }
  if (!(planAObservation?.picks || []).some(row => clean(row?.matchId) === clean(canonicalId))) {
    return { ok: false, reason: "target_pick_missing_from_immutable_plan_a" };
  }

  const targets = (comparison?.plans?.A?.picks || [])
    .filter(row => clean(row?.matchId) === clean(canonicalId));
  if (targets.length !== 1) {
    return { ok: false, reason: "comparison_target_pick_not_unique", count: targets.length };
  }
  const alreadyVoid = targets[0].result === "VOID";
  if (!alreadyVoid && (targets[0].result !== "UNRESOLVED" || targets[0].finalScore !== null)) {
    return { ok: false, reason: "comparison_target_not_unresolved_scoreless" };
  }

  Object.assign(targets[0], {
    canonicalMatchId: canonicalId,
    finalStatus: "STATUS_POSTPONED",
    finalStatusType: "STATUS_POSTPONED",
    finalScore: null,
    result: "VOID",
    finalResultProvenance: {
      verifiedFinalTruth: false,
      verifiedNonPlayedTruth: true,
      verdict: "verified_non_played_void",
      source: "flashscore",
      method: "approved_historical_nonplayed_decision_with_archived_canonical_detail",
      authority: "approved_nonplayed_decision_and_archived_deploy_snapshot",
      sourceCount: 1,
      independentSourceCount: 1,
      generatedAt: fixture?.lastStatusPatchedAt || archivedDetail?.generatedAt || null,
      sources: [{
        provider: "flashscore",
        providerMatchId,
        status: fixture.status,
        statusType: fixture.statusType,
        rawStatus: fixture.rawStatus,
        decisionId: decision.decisionId
      }]
    }
  });

  const summaryA = summarize(comparison.plans.A.picks);
  const summaryB = summarize(comparison.plans.B.picks || []);
  comparison.plans.A.summary = summaryA;
  comparison.plans.B.summary = summaryB;
  comparison.comparison = comparisonDeltas(summaryA, summaryB);
  comparison.updatedAt = recoveredAt;
  comparison.settlementRecovery = {
    kind: "evidence_bound_historical_nonplayed_void",
    recoveredAt,
    dayKey,
    canonicalId,
    providerMatchId,
    decisionId: decision.decisionId,
    decisionPolicyVersion: decision.policyVersion,
    archivedDetailPath: archivedDetailPathLabel.replaceAll("\\", "/"),
    archivedDetailSha256: sha256File(archivedDetailPath),
    planAObservationPath: planAPathLabel.replaceAll("\\", "/"),
    planAObservationSignature: planAObservation.observationSignature
  };

  writeJson(comparisonPath, comparison);
  return {
    ok: true,
    changed: !alreadyVoid,
    reason: alreadyVoid ? "historical_nonplayed_pick_already_void" : "historical_nonplayed_pick_recovered",
    result: "VOID",
    summaryA
  };
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/u.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const dayKey = clean(args.date);
    const canonicalId = clean(args["canonical-id"]);
    const providerMatchId = clean(args["provider-match-id"]);
    if (!dayKey || !canonicalId || !providerMatchId) throw new Error("required_arguments_missing");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const result = recoverHistoricalNonPlayedValueVoid({
      dayKey,
      canonicalId,
      providerMatchId,
      comparisonPath: path.join(root, "data", "value-comparison", `${dayKey}.json`),
      planAPath: path.join(root, "data", "value-plans", dayKey, "plan-a.json"),
      planAPathLabel: `data/value-plans/${dayKey}/plan-a.json`,
      archivedDetailPath: path.join(root, "data", "deploy-snapshots", dayKey, "details", `${canonicalId}.json`),
      archivedDetailPathLabel: `data/deploy-snapshots/${dayKey}/details/${canonicalId}.json`,
      recoveredAt: args["recovered-at"] || new Date().toISOString()
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  }
}
