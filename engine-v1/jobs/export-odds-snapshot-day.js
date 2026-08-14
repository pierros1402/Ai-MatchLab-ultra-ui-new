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
import {
  overlayProductionEvidenceDocumentReadView,
} from "../core/production-evidence-identity-overlay.js";

export function assessmentRowCount(matches = []) {
  return (Array.isArray(matches) ? matches : []).filter(
    match =>
      match?.aiAssessment?.markets &&
      typeof match.aiAssessment.markets === "object" &&
      Object.keys(match.aiAssessment.markets).length > 0
  ).length;
}

export function snapshotRegressionReason(existingMatches = [], candidateMatches = []) {
  const existing = Array.isArray(existingMatches) ? existingMatches : [];
  const candidate = Array.isArray(candidateMatches) ? candidateMatches : [];

  if (existing.length > 0 && candidate.length === 0) {
    return "candidate_empty_regression";
  }

  if (assessmentRowCount(existing) > assessmentRowCount(candidate)) {
    return "assessment_coverage_regression";
  }

  return null;
}

export function contentHash(matches) {
  const stable = matches.map(m => ({
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
  const day = getOddsForDay(dayKey);
  const dir = resolveDataPath("deploy-snapshots", dayKey);
  ensureDir(dir);

  const file = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  const candidateMatches = Array.isArray(day?.matches) ? day.matches : [];
  const hash = contentHash(candidateMatches);

  let existing = null;
  try {
    existing = overlayProductionEvidenceDocumentReadView(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
  } catch (error) {
    if (String(error?.code || "").startsWith("production_evidence_read_")) {
      throw error;
    }
  }

  if (existing) {
    const existingMatches = Array.isArray(existing?.matches) ? existing.matches : [];
    const regressionReason = snapshotRegressionReason(existingMatches, candidateMatches);
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

    if (existing.hash === hash) {
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

  const payload = {
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    source: "autonomous-odds-capture",
    hash,
    count: candidateMatches.length,
    assessmentRows: assessmentRowCount(candidateMatches),
    matches: candidateMatches
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
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
