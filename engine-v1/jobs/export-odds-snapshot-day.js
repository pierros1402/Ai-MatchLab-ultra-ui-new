/**
 * export-odds-snapshot-day.js
 *
 * Writes the odds part of the deploy artifact: data/deploy-snapshots/{day}/odds.json
 * from odds memory (real bookmaker market line + drift + our AI assessment).
 */

import fs from "fs";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { getOddsForDay } from "../storage/odds-memory-db.js";
import { assessmentIdentityFields } from "../storage/assessment-read-view.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import {
  resolveCanonicalAssessmentOwnership,
  joinCanonicalFixturesWithModelAssessments
} from "../core/plan-b-canonical-membership.js";
import { classifyAssessmentPublication } from "../core/assessment-publication-identity.js";
import {
  overlayProductionEvidenceDocumentReadView,
} from "../core/production-evidence-identity-overlay.js";

// P0-C P5 READ BOUNDARY: existing deployed odds evidence view before material-change checks.

export function assessmentRowCount(matches = []) {
  return (Array.isArray(matches) ? matches : []).filter(
    match =>
      match?.aiAssessment?.markets &&
      typeof match.aiAssessment.markets === "object" &&
      Object.keys(match.aiAssessment.markets).length > 0
  ).length;
}

export function snapshotRegressionReason(existingMatches = [], candidateMatches = [], canonicalFixtures = null) {
  const existing = Array.isArray(existingMatches) ? existingMatches : [];
  const candidate = Array.isArray(candidateMatches) ? candidateMatches : [];

  if (existing.length > 0 && candidate.length === 0) {
    return "candidate_empty_regression";
  }

  if (Array.isArray(canonicalFixtures)) {
    const certifiedIds = rows => {
      const certified = classifyAssessmentPublication(rows, canonicalFixtures).publishable.map(item => item.row);
      const joined = joinCanonicalFixturesWithModelAssessments(canonicalFixtures, certified);
      return new Set(joined.joinedMatches.map(row => row.canonicalId));
    };
    const after = certifiedIds(candidate);
    for (const id of certifiedIds(existing)) {
      if (!after.has(id)) return "assessment_coverage_regression";
    }
    return null;
  }
  if (assessmentRowCount(existing) > assessmentRowCount(candidate)) {
    return "assessment_coverage_regression";
  }

  return null;
}

/**
 * Carry forward only already-published, exact-canonical, independently
 * certified model evidence. Never synthesize an assessment and never resurrect
 * an orphan/ambiguous row or replace a fresher assessed candidate.
 *
 * A newly acquired fixture with no previously certified evidence remains
 * unassessed and must fail the upstream required-coverage gate.
 */
export function preserveCertifiedAssessmentCoverage(
  existingMatches = [],
  candidateMatches = [],
  canonicalFixtures = []
) {
  const canonicalIds = new Set(
    canonicalFixtures.map(row => String(row?.canonicalId || row?.matchId || "").trim()).filter(Boolean)
  );
  const existingCertified = classifyAssessmentPublication(existingMatches, canonicalFixtures)
    .publishable.map(item => item.row);
  const previous = new Map();
  for (const row of existingCertified) {
    const id = String(row?.canonicalId || "").trim();
    if (!id || !canonicalIds.has(id) || !row?.aiAssessment?.markets ||
        Object.keys(row.aiAssessment.markets).length === 0) continue;
    if (previous.has(id)) {
      // Do not arbitrate conflicting evidence for the same canonical identity.
      previous.set(id, null);
    } else {
      previous.set(id, row);
    }
  }

  const result = candidateMatches.map(row => ({ ...row }));
  const candidateIds = new Set();
  for (let i = 0; i < result.length; i++) {
    const row = result[i];
    const id = String(row?.canonicalId || "").trim();
    if (!id || !canonicalIds.has(id)) continue;
    candidateIds.add(id);
    const old = previous.get(id);
    if (old && assessmentRowCount([row]) === 0) {
      result[i] = { ...row, aiAssessment: old.aiAssessment };
    }
  }
  for (const [id, old] of previous) {
    if (old && !candidateIds.has(id)) result.push({ ...old });
  }

  const certified = classifyAssessmentPublication(result, canonicalFixtures);
  const joined = joinCanonicalFixturesWithModelAssessments(canonicalFixtures, result);
  if (certified.holds.length || joined.ambiguousCanonicalMatches.length ||
      joined.ambiguousAssessmentAliases.length ||
      joined.canonicalRowsMissingIdentity.length) {
    return { ok: false, matches: candidateMatches, reason: "carry_forward_identity_hold" };
  }
  return { ok: true, matches: result };
}

export function contentHash(matches) {
  const stable = matches.map(m => ({
    ...assessmentIdentityFields(m),
    matchId: m.matchId,
    canonicalId: m.canonicalId || null,
    leagueSlug: m.leagueSlug,
    competition: m.competition,
    home: m.home,
    away: m.away,
    dayKey: m.dayKey,
    kickoffUtc: m.kickoffUtc || m.kickoffLocal,
    market: m.market,
    aiAssessment: m.aiAssessment || null
  }));
  return crypto.createHash("sha1").update(JSON.stringify(stable)).digest("hex");
}

export function exportOddsSnapshotDay(dayKey = athensDayKey()) {
  const day = getOddsForDay(dayKey, { publication: true });
  const dir = resolveDataPath("deploy-snapshots", dayKey);
  // Delay filesystem mutation until all identity/read/regression gates pass.

  const file = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  const canonical = canonicalFixturesForDay(dayKey);
  const ownership = resolveCanonicalAssessmentOwnership(canonical, Array.isArray(day?.matches) ? day.matches : []);
  // Canonical membership is the only authority for publication eligibility.
  // Retain raw market/price rows; quarantine orphan model evidence only in
  // this derived public snapshot. Never alter odds memory or historic models.
  const sourceMatches = ownership.matches;
  const publication = joinCanonicalFixturesWithModelAssessments(canonical, sourceMatches);
  const strictIdentity = classifyAssessmentPublication(sourceMatches, canonical);
  if (strictIdentity.holds.length > 0 ||
      publication.ambiguousCanonicalMatches.length > 0 ||
      publication.ambiguousAssessmentAliases.length > 0 ||
      publication.canonicalRowsMissingIdentity.length > 0) {
    return {
      ok: false,
      dayKey,
      file,
      changed: false,
      reason: "ambiguous_canonical_ownership_publication_hold",
      ownershipIssues: {
        orphanAssessments: publication.orphanAssessmentRows.length,
        strictIdentityHolds: strictIdentity.holds.map(({row,reason})=>({canonicalId:row.canonicalId ?? null,reason})),
        ambiguousCanonicalMatches: publication.ambiguousCanonicalMatches.length,
        ambiguousAssessmentAliases: publication.ambiguousAssessmentAliases.length,
        canonicalRowsMissingIdentity: publication.canonicalRowsMissingIdentity.length
      }
    };
  }
  // Real membership returns original input-row references in orphanAssessmentRows.
  // Distinct object identities are intentional: never match or drop by fuzzy names.
  const quarantined = new Set([
    ...publication.orphanAssessmentRows,
    ...strictIdentity.quarantined.map(x=>x.row)
  ]);
  let candidateMatches = sourceMatches.map(row => quarantined.has(row)
    ? { ...row, aiAssessment: null } : row);
  const quarantinedAssessments = sourceMatches.reduce((count, row) =>
    count + (quarantined.has(row) && assessmentRowCount([row]) === 1 ? 1 : 0), 0);

  let existing = null;
  try {
    const previous = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!previous || !Array.isArray(previous.matches)) throw new Error("invalid_existing_odds_snapshot");
    existing = overlayProductionEvidenceDocumentReadView(previous);
  } catch (error) {
    // Missing is the only acceptable absence. Corrupt/unreadable evidence must
    // never be replaced by silently treating it as an empty previous snapshot.
    if (error?.code !== "ENOENT") throw error;
  }

  if (existing) {
    const existingMatches = Array.isArray(existing?.matches) ? existing.matches : [];
    let regressionReason = snapshotRegressionReason(resolveCanonicalAssessmentOwnership(canonical, existingMatches).matches, candidateMatches, canonical);
    if (regressionReason === "assessment_coverage_regression") {
      const carry = preserveCertifiedAssessmentCoverage(existingMatches, candidateMatches, canonical);
      if (carry.ok) {
        candidateMatches = carry.matches;
        regressionReason = snapshotRegressionReason(
          resolveCanonicalAssessmentOwnership(canonical, existingMatches).matches,
          candidateMatches,
          canonical
        );
      }
    }
    if (regressionReason) {
      return {
        ok: true,
        dayKey,
        count: existingMatches.length,
        assessmentRows: assessmentRowCount(existingMatches),
        file,
        changed: false,
        preservedExisting: true,
        reason: regressionReason
      };
    }

    const candidateHash = contentHash(candidateMatches);
    if (existing.hash === candidateHash && contentHash(existingMatches) === candidateHash) {
      return {
        ok: true,
        dayKey,
        count: candidateMatches.length,
        assessmentRows: assessmentRowCount(candidateMatches),
        file,
        changed: false
      };
    }
  }

  const hash = contentHash(candidateMatches);
  const payload = {
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    source: "autonomous-odds-capture",
    hash,
    count: candidateMatches.length,
    assessmentRows: assessmentRowCount(candidateMatches),
    assessmentOwnership: {
      supersededLegacyAssessments: ownership.superseded.length,
      decisions: ownership.superseded,
      quarantinedOrphanAssessments: quarantinedAssessments,
      policy: "canonical_join_plus_strict_identity_verified_or_model_quarantined",
      certifiedAssessmentRows: assessmentRowCount(candidateMatches)
    },
    matches: candidateMatches
  };

  // Atomic same-directory replacement: an interrupted write must not leave
  // a partially serialized public snapshot. Preserve the old file on failure.
  ensureDir(dir);
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  let descriptor;
  let created = false;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    created = true;
    fs.writeFileSync(descriptor, JSON.stringify(payload, null, 2), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temp, file);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { if (created) fs.unlinkSync(temp); } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") {
        error.cleanupError = String(cleanupError?.message || cleanupError);
      }
    }
    throw error;
  }
  return {
    ok: true,
    dayKey,
    count: candidateMatches.length,
    assessmentRows: payload.assessmentRows,
    file,
    changed: true
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = (process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))) || athensDayKey();
  const r = exportOddsSnapshotDay(arg);
  console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0, productionWrite: false } }, null, 2));
}
