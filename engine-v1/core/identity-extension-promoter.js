import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { normalizeGenesisAlias } from "./production-identity-retention-decisions.js";
import {
  buildExtendedProductionIdentityResolver,
  deriveExtensionBindingDecisionId,
  deriveExtensionFixtureDecisionId,
  deriveExtensionGlobalClubId,
  deriveExtensionSourceIdentityHash,
  deriveExtensionTeamIdentityKey,
  validateProductionIdentityExtension,
} from "./production-identity-extension.js";
import { discoverIdentityRecoveryCandidates } from "./identity-extension-recovery.js";
import { validateIndependentFixtureConfirmation } from "./independent-fixture-confirmer.js";

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function candidateKey(candidate) {
  return [
    clean(candidate?.left?.canonicalId),
    clean(candidate?.right?.canonicalId),
  ].sort().join("|");
}

function providerRank(provider) {
  if (provider === "espn") return 0;
  if (provider === "flashscore") return 1;
  if (provider === "sofascore") return 2;
  return 9;
}

function sortedSources(candidate) {
  return [candidate.left, candidate.right]
    .map(row => ({ ...row, source: clean(row?.source).toLowerCase() }))
    .sort((a, b) =>
      providerRank(a.source) - providerRank(b.source) ||
      a.source.localeCompare(b.source) ||
      clean(a.canonicalId).localeCompare(clean(b.canonicalId))
    );
}

function sourceTeam(row, side) {
  return clean(side === "home" ? row?.homeTeam : row?.awayTeam);
}

function resolveAlias(resolver, alias, leagueSlug) {
  const result = resolver.resolveTeamReference({ alias, leagueSlug });
  return result?.ok ? result.globalClubId : null;
}

function buildNewBinding({ candidate, side, leagueSlug, fixtureDecisionId }) {
  const sources = sortedSources(candidate);
  const aliases = [...new Set(sources.map(row => sourceTeam(row, side)).filter(Boolean))];
  const preferred = sourceTeam(sources[0], side);
  const binding = {
    preferredDisplayName: preferred,
    genesisAliases: aliases,
    leagueSlugs: [leagueSlug],
    ledgerTeamIdentityKey: "",
    sourceIdentityHash: "",
    globalClubId: "",
    bindingDecisionId: "",
    promotionStatus: "PROMOTED_SOURCE_BOUND_IDENTITY",
    matchingMode: "NORMALIZED_EXACT_ONLY",
    globalClubIdImmutable: true,
    futureAliasChangesMustNotReallocateId: true,
    sourceFixtureDecisionIds: [fixtureDecisionId],
  };
  binding.ledgerTeamIdentityKey = deriveExtensionTeamIdentityKey(binding);
  binding.sourceIdentityHash = deriveExtensionSourceIdentityHash(binding);
  binding.globalClubId = deriveExtensionGlobalClubId(binding);
  binding.bindingDecisionId = deriveExtensionBindingDecisionId(binding);
  return binding;
}

function sideIdentityPlan({ candidate, side, resolver, leagueSlug, fixtureDecisionId }) {
  const sources = sortedSources(candidate);
  const ids = sources.map(row => resolveAlias(resolver, sourceTeam(row, side), leagueSlug));
  const known = [...new Set(ids.filter(Boolean))];

  if (known.length > 1) {
    return { ok: false, reason: `CONFLICTING_${side.toUpperCase()}_GLOBAL_IDS` };
  }
  if (known.length === 1 && ids.every(Boolean)) {
    return { ok: true, globalClubId: known[0], binding: null };
  }
  if (known.length === 1) {
    // Attaching a new alias to an already-existing immutable identity needs a
    // separate alias-extension record. Never allocate a second globalClubId.
    return { ok: false, reason: `ALIAS_EXTENSION_TO_EXISTING_ID_REQUIRED:${side}` };
  }

  const binding = buildNewBinding({ candidate, side, leagueSlug, fixtureDecisionId });
  return { ok: true, globalClubId: binding.globalClubId, binding };
}

function baseSideStable(baseResolver, candidate, side, leagueSlug) {
  const sources = sortedSources(candidate);
  const ids = sources.map(row => resolveAlias(baseResolver, sourceTeam(row, side), leagueSlug));
  return Boolean(ids[0] && ids[1] && ids[0] === ids[1]);
}

function literalSideStable(candidate, side) {
  const sources = sortedSources(candidate);
  return Boolean(
    normalizeGenesisAlias(sourceTeam(sources[0], side)) &&
    normalizeGenesisAlias(sourceTeam(sources[0], side)) ===
      normalizeGenesisAlias(sourceTeam(sources[1], side))
  );
}

function promotionBasis(
  baseResolver,
  candidate,
  leagueSlug,
  homePlan,
  awayPlan,
  { independentConfirmation = null } = {},
) {
  if (independentConfirmation) {
    const validation = validateIndependentFixtureConfirmation(candidate, independentConfirmation);
    if (validation.ok) return "TWO_PROVIDER_PLUS_INDEPENDENT_FIXTURE_CONFIRMATION";
    return null;
  }
  if (!homePlan.binding && !awayPlan.binding &&
      baseSideStable(baseResolver, candidate, "home", leagueSlug) &&
      baseSideStable(baseResolver, candidate, "away", leagueSlug)) {
    return "TWO_PROVIDER_EXISTING_PRODUCTION_IDENTITIES";
  }
  if (literalSideStable(candidate, "home") ||
      literalSideStable(candidate, "away") ||
      baseSideStable(baseResolver, candidate, "home", leagueSlug) ||
      baseSideStable(baseResolver, candidate, "away", leagueSlug)) {
    return "TWO_PROVIDER_EXACT_COUNTERPART_WITH_STABLE_SIDE";
  }
  return null;
}

function fixtureSourceRecord(row, dayKey, leagueSlug) {
  return {
    provider: clean(row.source).toLowerCase(),
    providerMatchId: clean(row.sourceId),
    repositoryFixtureId: clean(row.canonicalId),
    dayKey,
    leagueSlug,
    kickoffUtc: clean(row.kickoffUtc),
    homeTeam: clean(row.homeTeam),
    awayTeam: clean(row.awayTeam),
  };
}

function updateLedgerVersion(ledger, runDayKey) {
  const identity = {
    teamBindingDecisionIds: (ledger.teamBindings || [])
      .map(row => row.bindingDecisionId).sort(),
    fixtureDecisionIds: (ledger.fixtureLineageDecisions || [])
      .map(row => row.fixtureRetentionDecisionId).sort(),
  };
  ledger.extensionVersion = `${runDayKey}.auto.${sha256Text(JSON.stringify(identity)).slice(0, 12)}`;
  ledger.summary = {
    ...ledger.summary,
    promotedTeamBindings: ledger.teamBindings.length,
    fixtureLineageDecisions: ledger.fixtureLineageDecisions.length,
    suppressedFixtureAliases: ledger.fixtureLineageDecisions.reduce(
      (sum, row) => sum + (row.suppressedRepositoryFixtureIds || []).length,
      0,
    ),
  };
}

function freshCandidateFor({
  canonicalRoot,
  dayKey,
  leagueSlug,
  key,
  resolver,
  independentConfirmation = false,
}) {
  const filePath = path.join(canonicalRoot, dayKey, `${leagueSlug}.json`);
  if (!fs.existsSync(filePath)) return null;
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(payload?.fixtures)) return null;
  const report = discoverIdentityRecoveryCandidates(payload.fixtures, { leagueSlug, resolver });
  const pool = independentConfirmation
    ? report.pendingIndependentConfirmation
    : report.autoPromotable;
  return pool.find(item => candidateKey(item) === key) || null;
}

function isAlreadyManaged(resolver, candidate) {
  const left = resolver.resolveFixtureId(clean(candidate?.left?.canonicalId));
  const right = resolver.resolveFixtureId(clean(candidate?.right?.canonicalId));
  return Boolean(
    left?.ok && right?.ok &&
    clean(left.resolvedFixtureId) &&
    clean(left.resolvedFixtureId) === clean(right.resolvedFixtureId)
  );
}

function recoveryCandidates(artifact) {
  const out = [];
  for (const day of artifact?.targetDays || []) {
    for (const report of day?.recoveryLeagueReports || []) {
      for (const candidate of report?.autoPromotable || []) {
        out.push({
          dayKey: clean(day.dayKey),
          leagueSlug: clean(report.leagueSlug),
          candidate,
        });
      }
    }
  }
  return out.sort((a, b) =>
    a.dayKey.localeCompare(b.dayKey) ||
    a.leagueSlug.localeCompare(b.leagueSlug) ||
    candidateKey(a.candidate).localeCompare(candidateKey(b.candidate))
  );
}

export function promoteIdentityRecoveryArtifact({
  runDayKey,
  recoveryArtifactPath,
  extensionLedgerPath,
  canonicalRoot,
  baseResolver,
  write = true,
} = {}) {
  if (!baseResolver) throw new Error("identity_promoter_base_resolver_required");
  const artifact = JSON.parse(fs.readFileSync(recoveryArtifactPath, "utf8"));
  if (artifact?.schema !== "ai-matchlab.identity-recovery-window.v1" ||
      clean(artifact?.runDayKey) !== clean(runDayKey)) {
    throw new Error("identity_promoter_recovery_artifact_invalid");
  }

  const initialHash = sha256File(extensionLedgerPath);
  const initialLedger = JSON.parse(fs.readFileSync(extensionLedgerPath, "utf8"));
  let proposedLedger = clone(initialLedger);
  let currentResolver = buildExtendedProductionIdentityResolver({
    baseResolver,
    ledger: proposedLedger,
  });

  const promoted = [];
  const alreadyApplied = [];
  const blocked = [];
  for (const item of recoveryCandidates(artifact)) {
    const { dayKey, leagueSlug, candidate } = item;
    const key = candidateKey(candidate);
    const independentlyConfirmed =
      clean(candidate?.recoveryStatus) === "AUTO_PROMOTABLE_INDEPENDENT_CONFIRMATION";
    if (!candidate?.promotionAuthorized || !/^AUTO_PROMOTABLE_/u.test(clean(candidate?.recoveryStatus))) {
      blocked.push({ dayKey, leagueSlug, key, reason: "RECOVERY_ROW_NOT_AUTHORIZED" });
      continue;
    }
    if (isAlreadyManaged(currentResolver, candidate)) {
      alreadyApplied.push({ dayKey, leagueSlug, key });
      continue;
    }

    const fresh = freshCandidateFor({
      canonicalRoot,
      dayKey,
      leagueSlug,
      key,
      resolver: currentResolver,
      independentConfirmation: independentlyConfirmed,
    });
    const independentValidation = independentlyConfirmed && fresh
      ? validateIndependentFixtureConfirmation(
          { ...fresh, dayKey },
          candidate.independentConfirmation,
        )
      : null;
    const freshAuthorized = independentlyConfirmed
      ? Boolean(
          fresh?.recoveryStatus === "PENDING_INDEPENDENT_CONFIRMATION" &&
          fresh?.promotionAuthorized === false &&
          independentValidation?.ok
        )
      : Boolean(
          fresh?.promotionAuthorized &&
          /^AUTO_PROMOTABLE_/u.test(clean(fresh?.recoveryStatus))
        );
    if (!fresh || !freshAuthorized) {
      blocked.push({ dayKey, leagueSlug, key, reason: "RAW_SOURCE_REVALIDATION_FAILED" });
      continue;
    }

    const sources = sortedSources(fresh);
    if (sources.length !== 2 || sources.some(row => !row.sourceId || !row.canonicalId)) {
      blocked.push({ dayKey, leagueSlug, key, reason: "TWO_SOURCE_IDENTITIES_REQUIRED" });
      continue;
    }
    const retained = sources[0];
    const suppressed = sources[1];
    const decisionShell = {
      dayKey,
      leagueSlug,
      retainedRepositoryFixtureId: retained.canonicalId,
      suppressedRepositoryFixtureIds: [suppressed.canonicalId],
    };
    const fixtureDecisionId = deriveExtensionFixtureDecisionId(decisionShell);
    const homePlan = sideIdentityPlan({
      candidate: fresh,
      side: "home",
      resolver: currentResolver,
      leagueSlug,
      fixtureDecisionId,
    });
    const awayPlan = sideIdentityPlan({
      candidate: fresh,
      side: "away",
      resolver: currentResolver,
      leagueSlug,
      fixtureDecisionId,
    });
    if (!homePlan.ok || !awayPlan.ok) {
      blocked.push({
        dayKey,
        leagueSlug,
        key,
        reason: homePlan.reason || awayPlan.reason,
      });
      continue;
    }

    const basis = promotionBasis(
      baseResolver,
      fresh,
      leagueSlug,
      homePlan,
      awayPlan,
      {
        independentConfirmation: independentlyConfirmed
          ? candidate.independentConfirmation
          : null,
      },
    );
    if (!basis) {
      blocked.push({ dayKey, leagueSlug, key, reason: "STABLE_PROMOTION_BASIS_NOT_PROVABLE" });
      continue;
    }

    const fixtureDecision = {
      ...decisionShell,
      promotionBasis: basis,
      sourceFixtures: sources.map(row => fixtureSourceRecord(row, dayKey, leagueSlug)),
      ...(independentlyConfirmed
        ? {
            independentConfirmationContract: "api_football_exact_bridge_v1",
            independentConfirmations: [clone(candidate.independentConfirmation)],
          }
        : {}),
      fixtureRetentionDecisionId: fixtureDecisionId,
      homeGlobalClubId: homePlan.globalClubId,
      awayGlobalClubId: awayPlan.globalClubId,
    };
    const trialLedger = clone(proposedLedger);
    for (const plan of [homePlan, awayPlan]) {
      if (plan.binding) trialLedger.teamBindings.push(plan.binding);
    }
    trialLedger.fixtureLineageDecisions.push(fixtureDecision);
    updateLedgerVersion(trialLedger, runDayKey);

    const validation = validateProductionIdentityExtension({
      ledger: trialLedger,
      baseResolver,
    });
    if (!validation.ok) {
      blocked.push({
        dayKey,
        leagueSlug,
        key,
        reason: "FINAL_EXTENSION_VALIDATION_FAILED",
        validationIssues: validation.issues.map(issue => issue.code),
      });
      continue;
    }

    proposedLedger = trialLedger;
    currentResolver = buildExtendedProductionIdentityResolver({
      baseResolver,
      ledger: proposedLedger,
    });
    promoted.push({
      dayKey,
      leagueSlug,
      key,
      fixtureRetentionDecisionId: fixtureDecisionId,
      newTeamBindingDecisionIds: [homePlan, awayPlan]
        .map(plan => plan.binding?.bindingDecisionId)
        .filter(Boolean),
    });
  }

  const finalValidation = validateProductionIdentityExtension({
    ledger: proposedLedger,
    baseResolver,
  });
  if (!finalValidation.ok) {
    throw new Error("identity_promoter_final_ledger_invalid");
  }

  if (write && promoted.length > 0) {
    if (sha256File(extensionLedgerPath) !== initialHash) {
      throw new Error("identity_promoter_concurrent_ledger_change");
    }
    const serialized = `${JSON.stringify(proposedLedger, null, 2)}\n`;
    const tempPath = `${extensionLedgerPath}.tmp-${process.pid}`;
    fs.writeFileSync(tempPath, serialized, "utf8");
    fs.renameSync(tempPath, extensionLedgerPath);
  }

  return {
    schema: "ai-matchlab.identity-extension-promotion-result.v1",
    runDayKey: clean(runDayKey),
    initialLedgerSha256: initialHash,
    finalLedgerSha256: sha256Text(`${JSON.stringify(proposedLedger, null, 2)}\n`),
    changed: promoted.length > 0,
    promoted,
    alreadyApplied,
    blocked,
    refusedRecoveryStates: {
      pendingIndependentConfirmation: Number(artifact?.summary?.pendingIndependentConfirmation || 0),
      ambiguous: Number(artifact?.summary?.ambiguous || 0),
      conflictRejected: Number(artifact?.summary?.conflictRejected || 0),
    },
    validation: finalValidation,
    proposedLedger,
  };
}
