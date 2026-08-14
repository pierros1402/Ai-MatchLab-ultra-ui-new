/**
 * export-odds-snapshot-day.js
 *
 * Writes the odds part of the deploy artifact: data/deploy-snapshots/{day}/odds.json
 * from odds memory (real bookmaker market line + drift + our AI assessment).
 *
 * This is what gets committed so the deployed UI can read the odds without any
 * live odds API. It is deliberately a SEPARATE, small file so odds refreshes
 * (every 8h, hourly near kickoff) only touch odds.json — keeping commits small
 * and letting material-change gating skip no-op deploys.
 *
 * Usage: node engine-v1/jobs/export-odds-snapshot-day.js [YYYY-MM-DD]
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

// P0-C P5 READ BOUNDARY: existing deployed odds evidence view before material-change checks.

// Hash only meaningful persisted content (not generatedAt/updatedAt timestamps), so
// a re-export with no real change leaves the file byte-identical and avoids a deploy.
// aiAssessment is part of the persistent Value input contract: model-market changes
// must invalidate the hash even when bookmaker odds are unchanged.
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
  const hash = contentHash(day.matches);

  // Skip rewrite if nothing material changed (keeps deploys few).
  try {
    const existing = overlayProductionEvidenceDocumentReadView(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    if (existing.hash === hash) {
      return { ok: true, dayKey, count: day.count, file, changed: false };
    }
  } catch (error) {
    if (
      String(error?.code || "").startsWith(
        "production_evidence_read_",
      )
    ) {
      throw error;
    }
    /* no existing file */
  }

  const payload = {
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    source: "autonomous-odds-capture",
    hash,
    count: day.count,
    matches: day.matches
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return { ok: true, dayKey, count: day.count, file, changed: true };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = (process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))) || athensDayKey();
  const r = exportOddsSnapshotDay(arg);
  console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0, productionWrite: false } }, null, 2));
}
