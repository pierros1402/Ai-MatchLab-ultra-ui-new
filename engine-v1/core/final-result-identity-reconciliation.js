import fs from "node:fs";
import path from "node:path";

import { bindProductionResultIdentity } from "./production-result-identity-binding.js";

function clean(value) {
  return String(value ?? "").trim();
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function finalTruth(row) {
  return {
    verified: row?.verifiedFinalTruth === true ||
      clean(row?.finalTruthVerdict) === "verified_final_result" ||
      clean(row?.verdict) === "verified_final_result",
    home: numberOrNull(row?.scoreHome, row?.homeScore, row?.finalScore?.homeScore, row?.finalScore?.home),
    away: numberOrNull(row?.scoreAway, row?.awayScore, row?.finalScore?.awayScore, row?.finalScore?.away),
  };
}

function sameVerifiedTruth(left, right) {
  const a = finalTruth(left);
  const b = finalTruth(right);
  return Boolean(
    a.verified && b.verified &&
    a.home !== null && a.away !== null &&
    a.home === b.home && a.away === b.away
  );
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function preservedSuppressedEvidence(payload, sourceFixtureId) {
  return {
    sourceFixtureId,
    originalMatchId: clean(payload?.matchId || payload?.canonicalId),
    source: clean(payload?.source),
    sourceCount: Number(payload?.sourceCount || 0),
    independentSourceCount: Number(payload?.independentSourceCount || 0),
    scoreKey: clean(payload?.scoreKey),
    generatedAt: clean(payload?.generatedAt) || null,
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
    verification: payload?.verification && typeof payload.verification === "object"
      ? payload.verification
      : null,
  };
}

function enrichRetainedPayload(target, suppressed, resolution, sourceFixtureId) {
  const current = target?.productionIdentityReconciliation;
  const existing = Array.isArray(current?.suppressedArtifacts)
    ? current.suppressedArtifacts
    : [];
  const evidence = preservedSuppressedEvidence(suppressed, sourceFixtureId);
  const suppressedArtifacts = [
    ...existing.filter(item => clean(item?.sourceFixtureId) !== sourceFixtureId),
    evidence,
  ].sort((a, b) => clean(a.sourceFixtureId).localeCompare(clean(b.sourceFixtureId)));

  return {
    ...target,
    productionIdentityReconciliation: {
      schema: "ai-matchlab.final-result-identity-reconciliation.v1",
      retainedFixtureId: resolution.resolvedFixtureId,
      fixtureRetentionDecisionId: resolution.fixtureRetentionDecisionId,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      suppressedArtifacts,
    },
  };
}

export function reconcileFinalResultIdentityAliasesDay(
  dayKey,
  {
    finalResultsRoot,
    resolver,
    write = false,
  } = {},
) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(dayKey))) {
    throw new Error(`final_result_identity_reconciliation_invalid_day:${dayKey}`);
  }
  if (!resolver || typeof resolver.resolveFixtureId !== "function") {
    throw new Error("final_result_identity_reconciliation_resolver_required");
  }
  const dayDir = path.join(finalResultsRoot, clean(dayKey));
  const result = {
    schema: "ai-matchlab.final-result-identity-reconciliation-day.v1",
    dayKey: clean(dayKey),
    scannedFiles: 0,
    suppressedAliasFiles: 0,
    reconciled: [],
    blocked: [],
  };
  if (!fs.existsSync(dayDir)) return { ...result, ok: true };

  const files = fs.readdirSync(dayDir).filter(name => name.endsWith(".json")).sort();
  result.scannedFiles = files.length;
  for (const name of files) {
    const sourceFixtureId = path.basename(name, ".json");
    const resolution = resolver.resolveFixtureId(sourceFixtureId);
    if (!resolution?.ok || resolution.sourceRole !== "suppressed_lineage_alias") continue;
    result.suppressedAliasFiles += 1;

    const sourcePath = path.join(dayDir, name);
    const targetPath = path.join(dayDir, `${resolution.resolvedFixtureId}.json`);
    const suppressed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    const bound = bindProductionResultIdentity(suppressed, { resolver });
    if (!bound?.managed || clean(bound.row?.matchId) !== clean(resolution.resolvedFixtureId) ||
        bound.scoreTruthChanged || bound.statusTruthChanged) {
      result.blocked.push({
        sourceFixtureId,
        retainedFixtureId: resolution.resolvedFixtureId,
        reason: "SUPPRESSED_FINAL_BINDING_FAILED",
      });
      continue;
    }

    let retained = null;
    let action = "MOVE_TO_RETAINED_ID";
    if (fs.existsSync(targetPath)) {
      retained = JSON.parse(fs.readFileSync(targetPath, "utf8"));
      if (!sameVerifiedTruth(suppressed, retained)) {
        result.blocked.push({
          sourceFixtureId,
          retainedFixtureId: resolution.resolvedFixtureId,
          reason: "VERIFIED_FINAL_TRUTH_CONFLICT",
          suppressedTruth: finalTruth(suppressed),
          retainedTruth: finalTruth(retained),
        });
        continue;
      }
      action = "REMOVE_REDUNDANT_ALIAS";
    } else {
      retained = bound.row;
    }

    const enriched = enrichRetainedPayload(
      retained,
      suppressed,
      resolution,
      sourceFixtureId,
    );
    if (!sameVerifiedTruth(suppressed, enriched)) {
      throw new Error(`final_result_identity_reconciliation_truth_changed:${sourceFixtureId}`);
    }

    if (write) {
      writeJsonAtomic(targetPath, enriched);
      // Deletion happens only after a verified retained target with identical
      // score truth has been durably written. The suppressed provider evidence
      // is preserved inside productionIdentityReconciliation above.
      fs.rmSync(sourcePath, { force: true });
    }
    result.reconciled.push({
      sourceFixtureId,
      retainedFixtureId: resolution.resolvedFixtureId,
      fixtureRetentionDecisionId: resolution.fixtureRetentionDecisionId,
      action,
      scoreTruth: finalTruth(suppressed),
    });
  }

  result.ok = result.blocked.length === 0;
  result.remainingSuppressedAliasFiles = result.suppressedAliasFiles - result.reconciled.length;
  return result;
}
