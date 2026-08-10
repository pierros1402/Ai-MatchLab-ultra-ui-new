import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getProjectRoot } from "../storage/data-root.js";
import { deriveGenesisGlobalClubId } from "./production-identity-retention-decisions.js";

export const PRODUCTION_TEAM_IDENTITY_DISAMBIGUATION_SCHEMA =
  "ai-matchlab.production-team-identity-disambiguation-ledger.v1";

export const PRODUCTION_TEAM_IDENTITY_DISAMBIGUATION_RELATIVE_PATH =
  "data/identity-decisions/production-team-identity-disambiguation-ledger.v1.json";

function clean(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stable(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

export function normalizeExactDisambiguationAlias(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function identitySeed(decision = {}) {
  return {
    namespace: "ai-matchlab.team-disambiguation-identity.v1",
    leagueSlug: clean(decision.leagueSlug),
    exactAlias: normalizeExactDisambiguationAlias(decision.exactAlias),
    preferredDisplayName: clean(decision.preferredDisplayName),
  };
}

export function deriveDisambiguationTeamIdentityKey(decision) {
  return `p0dteam_${sha256(canonicalJson(identitySeed(decision))).slice(0, 20)}`;
}

export function deriveDisambiguationSourceIdentityHash(decision) {
  return sha256(canonicalJson({
    ...identitySeed(decision),
    namespace: "ai-matchlab.team-disambiguation-source.v1",
  }));
}

export function deriveDisambiguationGlobalClubId(decision) {
  return deriveGenesisGlobalClubId({
    ledgerTeamIdentityKey: deriveDisambiguationTeamIdentityKey(decision),
    identityHash: deriveDisambiguationSourceIdentityHash(decision),
  });
}

export function deriveDisambiguationDecisionId(decision) {
  return `p0ddis_${sha256(canonicalJson({
    ...identitySeed(decision),
    fixtureId: clean(decision?.evidence?.fixtureId),
    dayKey: clean(decision?.evidence?.dayKey),
    conflictingBaseGlobalClubId: clean(decision?.conflictingBaseGlobalClubId),
  })).slice(0, 20)}`;
}

function issue(code, details = {}) {
  return { code, severity: "error", details };
}

function isFiniteScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function externalEvidenceHosts(values) {
  const hosts = new Set();
  for (const value of values || []) {
    try {
      const url = new URL(clean(value));
      if (url.protocol !== "https:") continue;
      hosts.add(url.hostname.toLowerCase());
    } catch {
      // Invalid evidence URLs are rejected by the host-count requirement below.
    }
  }
  return hosts;
}

function resolveAlias(resolver, alias, leagueSlug) {
  if (!resolver || typeof resolver.resolveTeamReference !== "function") {
    return null;
  }
  return resolver.resolveTeamReference({ alias, leagueSlug });
}

export function validateProductionTeamIdentityDisambiguation({
  ledger,
  baseResolver,
} = {}) {
  const issues = [];

  if (ledger?.schema !== PRODUCTION_TEAM_IDENTITY_DISAMBIGUATION_SCHEMA) {
    issues.push(issue("DISAMBIGUATION_SCHEMA_INVALID"));
  }
  if (!clean(ledger?.version)) {
    issues.push(issue("DISAMBIGUATION_VERSION_REQUIRED"));
  }
  if (ledger?.policy?.matchingMode !== "LEAGUE_SCOPED_EXACT_ALIAS_ONLY") {
    issues.push(issue("DISAMBIGUATION_MATCHING_MODE_INVALID"));
  }
  if (ledger?.policy?.fuzzyMatchingAllowed !== false) {
    issues.push(issue("DISAMBIGUATION_FUZZY_MATCHING_FORBIDDEN"));
  }
  if (ledger?.policy?.explicitManagedIdentityOverrideAllowed !== false) {
    issues.push(issue("DISAMBIGUATION_EXPLICIT_IDENTITY_OVERRIDE_FORBIDDEN"));
  }
  if (!baseResolver || typeof baseResolver.resolveTeamReference !== "function") {
    issues.push(issue("DISAMBIGUATION_BASE_RESOLVER_REQUIRED"));
  }

  const decisions = Array.isArray(ledger?.decisions) ? ledger.decisions : [];
  const keys = new Set();
  const ids = new Set();

  for (const decision of decisions) {
    const decisionId = clean(decision?.decisionId);
    const leagueSlug = clean(decision?.leagueSlug);
    const exactAlias = clean(decision?.exactAlias);
    const exactKey = normalizeExactDisambiguationAlias(exactAlias);
    const lookupKey = `${leagueSlug}\0${exactKey}`;
    const evidence = decision?.evidence || {};

    if (!decisionId || ids.has(decisionId)) {
      issues.push(issue("DISAMBIGUATION_DECISION_ID_INVALID", { decisionId }));
    } else {
      ids.add(decisionId);
    }
    if (!leagueSlug || !exactKey || keys.has(lookupKey)) {
      issues.push(issue("DISAMBIGUATION_LOOKUP_KEY_INVALID", { leagueSlug, exactAlias }));
    } else {
      keys.add(lookupKey);
    }
    if (decision?.status !== "CONFIRMED_DISTINCT_CLUB_IDENTITY") {
      issues.push(issue("DISAMBIGUATION_DECISION_NOT_CONFIRMED", { decisionId }));
    }
    if (decision?.matchingMode !== "LEAGUE_SCOPED_EXACT_ALIAS_ONLY") {
      issues.push(issue("DISAMBIGUATION_DECISION_MATCHING_MODE_INVALID", { decisionId }));
    }
    if (clean(decision?.ledgerTeamIdentityKey) !== deriveDisambiguationTeamIdentityKey(decision) ||
        clean(decision?.sourceIdentityHash) !== deriveDisambiguationSourceIdentityHash(decision) ||
        clean(decision?.globalClubId) !== deriveDisambiguationGlobalClubId(decision) ||
        decisionId !== deriveDisambiguationDecisionId(decision)) {
      issues.push(issue("DISAMBIGUATION_IDENTITY_DERIVATION_MISMATCH", { decisionId }));
    }
    if (!clean(decision?.conflictingBaseGlobalClubId)) {
      issues.push(issue("DISAMBIGUATION_CONFLICTING_BASE_ID_REQUIRED", { decisionId }));
    }
    if (!clean(decision?.opposingAlias) || clean(decision?.opposingAlias) === exactAlias) {
      issues.push(issue("DISAMBIGUATION_OPPOSING_ALIAS_REQUIRED", { decisionId }));
    }
    if (!clean(evidence.fixtureId) || !clean(evidence.dayKey) ||
        !clean(evidence.homeTeam) || !clean(evidence.awayTeam) ||
        !isFiniteScore(evidence.scoreHome) || !isFiniteScore(evidence.scoreAway)) {
      issues.push(issue("DISAMBIGUATION_FIXTURE_EVIDENCE_INVALID", { decisionId }));
    }
    if (![clean(evidence.homeTeam), clean(evidence.awayTeam)].includes(exactAlias) ||
        ![clean(evidence.homeTeam), clean(evidence.awayTeam)].includes(clean(decision?.opposingAlias))) {
      issues.push(issue("DISAMBIGUATION_FIXTURE_TEAMS_DO_NOT_BIND_DECISION", { decisionId }));
    }
    if (externalEvidenceHosts(evidence.externalEvidenceUrls).size < 2) {
      issues.push(issue("DISAMBIGUATION_TWO_INDEPENDENT_HTTPS_SOURCES_REQUIRED", { decisionId }));
    }

    if (baseResolver) {
      const aliasResolution = resolveAlias(baseResolver, exactAlias, leagueSlug);
      const opposingResolution = resolveAlias(
        baseResolver,
        clean(decision?.opposingAlias),
        leagueSlug,
      );
      const conflictingBaseGlobalClubId = clean(decision?.conflictingBaseGlobalClubId);

      if (!aliasResolution?.ok ||
          clean(aliasResolution.globalClubId) !== conflictingBaseGlobalClubId) {
        issues.push(issue("DISAMBIGUATION_BASE_ALIAS_COLLISION_NOT_REPRODUCED", {
          decisionId,
          aliasResolution,
        }));
      }
      if (!opposingResolution?.ok ||
          clean(opposingResolution.globalClubId) !== conflictingBaseGlobalClubId) {
        issues.push(issue("DISAMBIGUATION_OPPOSING_ALIAS_BASE_ID_MISMATCH", {
          decisionId,
          opposingResolution,
        }));
      }
      if (clean(decision?.globalClubId) === conflictingBaseGlobalClubId) {
        issues.push(issue("DISAMBIGUATION_DISTINCT_GLOBAL_ID_REQUIRED", { decisionId }));
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    issueCount: issues.length,
    counts: { decisions: decisions.length },
  };
}

function readLedger(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function createProductionTeamIdentityDisambiguator({
  ledger,
  baseResolver,
  ledgerPath = path.join(
    getProjectRoot(),
    PRODUCTION_TEAM_IDENTITY_DISAMBIGUATION_RELATIVE_PATH,
  ),
} = {}) {
  const effectiveLedger = ledger || readLedger(ledgerPath);
  const validation = validateProductionTeamIdentityDisambiguation({
    ledger: effectiveLedger,
    baseResolver,
  });
  if (!validation.ok) {
    const error = new Error("production_team_identity_disambiguation_invalid");
    error.code = "production_team_identity_disambiguation_invalid";
    error.details = validation;
    throw error;
  }

  const byKey = new Map(
    effectiveLedger.decisions.map(decision => [
      `${clean(decision.leagueSlug)}\0${normalizeExactDisambiguationAlias(decision.exactAlias)}`,
      Object.freeze({ ...decision }),
    ]),
  );

  function resolveBoundReference(reference = {}) {
    const alias = clean(reference.alias);
    const leagueSlug = clean(reference.leagueSlug);
    const globalClubId = clean(reference.globalClubId);
    const ledgerTeamIdentityKey = clean(reference.ledgerTeamIdentityKey);
    if (!alias || !leagueSlug || (!globalClubId && !ledgerTeamIdentityKey)) {
      return { ok: false, status: "DISAMBIGUATION_BOUND_REFERENCE_REQUIRED" };
    }
    const decision = byKey.get(
      `${leagueSlug}\0${normalizeExactDisambiguationAlias(alias)}`,
    );
    if (!decision) return { ok: false, status: "DISAMBIGUATION_EXACT_ALIAS_NOT_FOUND" };
    if (globalClubId && globalClubId !== clean(decision.globalClubId)) {
      return { ok: false, status: "DISAMBIGUATION_BOUND_GLOBAL_ID_MISMATCH" };
    }
    if (ledgerTeamIdentityKey && ledgerTeamIdentityKey !== clean(decision.ledgerTeamIdentityKey)) {
      return { ok: false, status: "DISAMBIGUATION_BOUND_IDENTITY_KEY_MISMATCH" };
    }
    return {
      ok: true,
      status: "VALIDATED_LEAGUE_SCOPED_EXACT_DISAMBIGUATION_IDENTITY",
      managed: true,
      globalClubId: decision.globalClubId,
      ledgerTeamIdentityKey: decision.ledgerTeamIdentityKey,
      preferredDisplayName: decision.preferredDisplayName,
      matchedSignals: ["leagueScopedExactDisambiguationAlias", "explicitDisambiguationIdentity"],
      fuzzyMatchingAttempted: false,
      disambiguationDecisionId: decision.decisionId,
      conflictingBaseGlobalClubId: decision.conflictingBaseGlobalClubId,
      readOnly: true,
      productionMutationAuthorized: false,
    };
  }

  function resolve(reference = {}) {
    const alias = clean(reference.alias);
    const leagueSlug = clean(reference.leagueSlug);
    if (!alias || !leagueSlug) {
      return { ok: false, status: "DISAMBIGUATION_EXACT_ALIAS_AND_LEAGUE_REQUIRED" };
    }
    if (clean(reference.globalClubId) || clean(reference.ledgerTeamIdentityKey)) {
      return { ok: false, status: "DISAMBIGUATION_EXPLICIT_IDENTITY_SIGNAL_NOT_OVERRIDDEN" };
    }

    const decision = byKey.get(
      `${leagueSlug}\0${normalizeExactDisambiguationAlias(alias)}`,
    );
    if (!decision) {
      return { ok: false, status: "DISAMBIGUATION_EXACT_ALIAS_NOT_FOUND" };
    }

    return {
      ok: true,
      status: "RESOLVED_LEAGUE_SCOPED_EXACT_DISAMBIGUATION",
      managed: true,
      globalClubId: decision.globalClubId,
      ledgerTeamIdentityKey: decision.ledgerTeamIdentityKey,
      preferredDisplayName: decision.preferredDisplayName,
      matchedSignals: ["leagueScopedExactDisambiguationAlias"],
      fuzzyMatchingAttempted: false,
      disambiguationDecisionId: decision.decisionId,
      conflictingBaseGlobalClubId: decision.conflictingBaseGlobalClubId,
      readOnly: true,
      productionMutationAuthorized: false,
    };
  }

  return Object.freeze({
    schema: "ai-matchlab.production-team-identity-disambiguator.v1",
    resolve,
    resolveBoundReference,
    validation: Object.freeze(validation),
    authorization: Object.freeze({
      productionMutationAuthorized: false,
      fuzzyMatchingAuthorized: false,
      explicitIdentityOverrideAuthorized: false,
    }),
  });
}
