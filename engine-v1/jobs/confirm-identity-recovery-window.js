/**
 * Resolve two-sided-unknown identity candidates with an independent fixture
 * provider. The provider is API-Football's fixtures endpoint only; bookmaker
 * odds and prediction endpoints are never requested or consumed.
 *
 * The job is deliberately non-fatal for provider/key/rate-limit gaps: it keeps
 * the candidate PENDING with a persisted retry disposition. Invalid/tampered
 * recovery artifacts still fail the job closed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchIdentityConfirmationFixturesSource2 } from "../adapters/source2.js";
import { evaluateIndependentFixtureConfirmation } from "../core/independent-fixture-confirmer.js";
import { resolveDataPath } from "../storage/data-root.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function candidateKey(candidate) {
  return [
    clean(candidate?.left?.canonicalId),
    clean(candidate?.right?.canonicalId),
  ].sort().join("|");
}

function validArtifact(artifact, runDayKey) {
  return Boolean(
    artifact?.schema === "ai-matchlab.identity-recovery-window.v1" &&
    clean(artifact?.runDayKey) === runDayKey &&
    Array.isArray(artifact?.targetDays)
  );
}

function pendingRetryState(candidate, fetchResult, evaluation, attemptedAt) {
  const previousAttempts = Number(candidate?.independentConfirmation?.attempts || 0);
  return {
    status: "PENDING_RETRY",
    source: "api_football",
    evidenceKind: "INDEPENDENT_NON_ODDS_FIXTURE_CONFIRMATION",
    oddsUsed: false,
    attempts: previousAttempts + 1,
    lastAttemptAt: attemptedAt,
    retryable: true,
    providerStatus: clean(fetchResult?.status) || null,
    evaluationStatus: clean(evaluation?.status) || null,
    thirdSourceKickoffRows: Number(evaluation?.thirdSourceKickoffRows || 0),
  };
}

function refreshArtifactStatus(artifact) {
  const summary = artifact.summary || {};
  artifact.status = Number(summary.conflictRejected || 0) > 0 ||
    Number(summary.pendingIndependentConfirmation || 0) > 0 ||
    Number(summary.ambiguous || 0) > 0
    ? "REVIEW_REQUIRED"
    : Number(summary.autoPromotable || 0) > 0
      ? "AUTO_PROMOTION_READY"
      : "CLEAN";
}

export async function confirmIdentityRecoveryWindow(
  runDayKey,
  {
    recoveryArtifactPath = resolveDataPath("identity-recovery", `${runDayKey}.json`),
    fetchFixtures = fetchIdentityConfirmationFixturesSource2,
    now = () => new Date().toISOString(),
    write = true,
  } = {},
) {
  const safeDay = clean(runDayKey);
  if (!DAY_RE.test(safeDay)) throw new Error(`identity_confirmer_invalid_day:${safeDay}`);
  if (typeof fetchFixtures !== "function") throw new Error("identity_confirmer_fetcher_required");

  const artifact = JSON.parse(fs.readFileSync(recoveryArtifactPath, "utf8"));
  if (!validArtifact(artifact, safeDay)) {
    throw new Error("identity_confirmer_recovery_artifact_invalid");
  }

  const groups = new Map();
  for (const day of artifact.targetDays) {
    for (const report of day?.recoveryLeagueReports || []) {
      if (!Array.isArray(report?.pendingIndependentConfirmation) ||
          report.pendingIndependentConfirmation.length === 0) continue;
      const key = `${clean(day.dayKey)}\0${clean(report.leagueSlug)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          dayKey: clean(day.dayKey),
          leagueSlug: clean(report.leagueSlug),
          reports: [],
        });
      }
      groups.get(key).reports.push(report);
    }
  }

  if (groups.size === 0) {
    return {
      schema: "ai-matchlab.identity-independent-confirmation-result.v1",
      runDayKey: safeDay,
      changed: false,
      confirmed: 0,
      retryPending: 0,
      attemptedGroups: 0,
      attempts: [],
      artifact,
      recoveryArtifactPath,
    };
  }

  let confirmed = 0;
  let retryPending = 0;
  const attempts = [];
  for (const group of groups.values()) {
    const attemptedAt = clean(now());
    const fetchResult = await fetchFixtures(group.leagueSlug, group.dayKey);
    if (fetchResult?.oddsRequested !== false) {
      throw new Error(`identity_confirmer_odds_contract_violation:${group.leagueSlug}`);
    }

    for (const report of group.reports) {
      const remaining = [];
      for (const candidate of report.pendingIndependentConfirmation) {
        const key = candidateKey(candidate);
        let evaluation = null;
        if (fetchResult?.ok === true) {
          evaluation = evaluateIndependentFixtureConfirmation(
            { ...candidate, dayKey: group.dayKey },
            fetchResult.rows,
            { observedAt: attemptedAt },
          );
        }

        if (fetchResult?.ok === true && evaluation?.ok === true) {
          report.autoPromotable = Array.isArray(report.autoPromotable)
            ? report.autoPromotable
            : [];
          report.autoPromotable.push({
            ...candidate,
            originRecoveryStatus: candidate.recoveryStatus,
            recoveryStatus: "AUTO_PROMOTABLE_INDEPENDENT_CONFIRMATION",
            promotionAuthorized: true,
            requiresIndependentConfirmation: true,
            independentConfirmation: evaluation.evidence,
          });
          confirmed += 1;
          attempts.push({
            dayKey: group.dayKey,
            leagueSlug: group.leagueSlug,
            key,
            status: "CONFIRMED",
            source: "api_football",
          });
          continue;
        }

        const retryState = pendingRetryState(candidate, fetchResult, evaluation, attemptedAt);
        remaining.push({ ...candidate, independentConfirmation: retryState });
        retryPending += 1;
        attempts.push({
          dayKey: group.dayKey,
          leagueSlug: group.leagueSlug,
          key,
          status: "PENDING_RETRY",
          providerStatus: retryState.providerStatus,
          evaluationStatus: retryState.evaluationStatus,
        });
      }
      report.pendingIndependentConfirmation = remaining;
      report.summary = {
        ...(report.summary || {}),
        autoPromotable: report.autoPromotable?.length || 0,
        pendingIndependentConfirmation: remaining.length,
      };
    }
  }

  artifact.summary = {
    ...(artifact.summary || {}),
    autoPromotable: artifact.targetDays.reduce((sum, day) =>
      sum + (day?.recoveryLeagueReports || []).reduce(
        (inner, report) => inner + Number(report?.autoPromotable?.length || 0),
        0,
      ), 0),
    pendingIndependentConfirmation: artifact.targetDays.reduce((sum, day) =>
      sum + (day?.recoveryLeagueReports || []).reduce(
        (inner, report) => inner + Number(report?.pendingIndependentConfirmation?.length || 0),
        0,
      ), 0),
    independentConfirmed: confirmed,
    independentConfirmationRetryPending: retryPending,
  };
  artifact.independentConfirmation = {
    source: "api_football",
    evidenceEndpoint: "fixtures",
    oddsAllowed: false,
    fuzzyMatchingAllowed: false,
    runAt: clean(now()),
    attempts,
  };
  refreshArtifactStatus(artifact);

  if (write) {
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    const tempPath = `${recoveryArtifactPath}.tmp-${process.pid}`;
    fs.writeFileSync(tempPath, serialized, "utf8");
    fs.renameSync(tempPath, recoveryArtifactPath);
  }

  return {
    schema: "ai-matchlab.identity-independent-confirmation-result.v1",
    runDayKey: safeDay,
    changed: confirmed > 0 || retryPending > 0,
    confirmed,
    retryPending,
    attemptedGroups: groups.size,
    attempts,
    artifact,
    recoveryArtifactPath,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const runDayKey = process.argv.slice(2).find(arg => !arg.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  confirmIdentityRecoveryWindow(runDayKey, { write: !dryRun })
    .then(result => {
      console.log(JSON.stringify({
        schema: result.schema,
        runDayKey: result.runDayKey,
        confirmed: result.confirmed,
        retryPending: result.retryPending,
        attemptedGroups: result.attemptedGroups,
        recoveryArtifactPath: result.recoveryArtifactPath,
      }, null, 2));
    })
    .catch(error => {
      console.error("[identity-independent-confirmer] failed", error);
      process.exitCode = 1;
    });
}
