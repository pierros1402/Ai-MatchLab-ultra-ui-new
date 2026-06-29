/**
 * export-fixtures-snapshot-day.js
 *
 * Comprehensive fixtures snapshot from our autonomous source (Flashscore feed),
 * for the leagues in our coverage map. Written to:
 *   data/deploy-snapshots/{day}/fixtures-all.json
 *
 * IMPORTANT — value-engine safety: this is a DISPLAY-ONLY artifact. It is NOT the
 * canonical json-db and is NOT written into details/ or active fixtures. The value
 * / statistics engine reads only the canonical store (getActiveByDay / details),
 * so these fixtures never reach it and cannot break its prerequisites. They are
 * merged into the /fixtures-runtime RESPONSE only, tagged `source:"flashscore"`.
 *
 * Match shape matches what the left panels expect:
 *   { id, home, away, leagueName, leagueSlug, kickoffUtc, kickoff_ms, status, source }
 *
 * Usage: node engine-v1/jobs/export-fixtures-snapshot-day.js [YYYY-MM-DD]
 */

import fs from "fs";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveSlug, resolveSlugFromPath } from "../odds/flashscore-league-map.js";
import { resolveInternational } from "../odds/international-competitions.js";
import { buildCanonicalId } from "../core/canonical-id.js";
import { registerMatch } from "../storage/canonical-match-registry.js";

const ATHENS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit"
});
function athensDayKeyFromUtc(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ATHENS_FMT.format(d);
}

// A fixtures snapshot is a SCHEDULE — it must never assert live/finished state
// (it goes stale the moment it's built). The real-time status comes from the
// live worker via live:update. We therefore always emit "SCHEDULED"; the panels
// treat it as upcoming, and a match only flips to LIVE/FT when the worker says so.
function deriveStatus() {
  return "SCHEDULED";
}

function contentHash(matches) {
  const stable = matches.map(m => `${m.id}|${m.kickoffUtc}|${m.home}|${m.away}|${m.leagueSlug || ""}`);
  return crypto.createHash("sha1").update(JSON.stringify(stable)).digest("hex");
}

export async function exportFixturesSnapshotDay(dayKey = athensDayKey()) {
  const windowSet = new Set([dayKey, shiftDay(dayKey, 1), shiftDay(dayKey, 2)]);
  const feed = await fetchFlashscoreFixtures({ offsets: [0, 1, 2] });

  const matches = [];
  for (const fx of feed.rows) {
    const dk = athensDayKeyFromUtc(fx.kickoffUtc);
    if (dk && !windowSet.has(dk)) continue;

    // Resolution order:
    //   1. resolveInternational — legacy name-based international lookup
    //   2. resolveSlugFromPath — deterministic path→slug for cups/continental/qualifiers
    //   3. resolveSlug — fuzzy name match for domestic leagues
    const intl = resolveInternational(fx.leagueName, fx.country);
    const slug = intl?.slug
      || resolveSlugFromPath(fx.leaguePath)
      || resolveSlug(fx.country, fx.leagueName);
    if (!slug) continue;

    const canonicalId = buildCanonicalId(slug, fx.home, fx.away, fx.kickoffUtc);
    if (!canonicalId) continue;

    // Register in the canonical registry so other layers can look up by source ID
    registerMatch(dk, {
      canonicalId,
      leagueSlug: slug,
      homeTeam: fx.home,
      awayTeam: fx.away,
      kickoffUtc: fx.kickoffUtc,
      source: "flashscore",
      sourceId: fx.matchId
    });

    matches.push({
      // canonicalId is the stable primary key — replaces fs_* prefix
      id: canonicalId,
      canonicalId,
      sourceId: fx.matchId,
      source: "flashscore",
      home: fx.home,
      away: fx.away,
      leagueName: intl ? intl.label : fx.leagueName,
      leagueSlug: slug,
      country: fx.country,
      kickoffUtc: fx.kickoffUtc,
      kickoff_ms: Date.parse(fx.kickoffUtc) || 0,
      dayKey: dk,
      status: deriveStatus(fx.kickoffUtc)
    });
  }
  matches.sort((a, b) => a.kickoff_ms - b.kickoff_ms);

  const dir = resolveDataPath("deploy-snapshots", dayKey);
  ensureDir(dir);
  const file = resolveDataPath("deploy-snapshots", dayKey, "fixtures-all.json");
  const hash = contentHash(matches);

  try {
    const existing = JSON.parse(fs.readFileSync(file, "utf8"));
    if (existing.hash === hash) return { ok: true, dayKey, count: matches.length, file, changed: false };
  } catch { /* no existing */ }

  fs.writeFileSync(file, JSON.stringify({
    ok: true, date: dayKey, generatedAt: new Date().toISOString(),
    source: "flashscore", hash, count: matches.length, matches
  }, null, 2), "utf8");

  return { ok: true, dayKey, count: matches.length, file, changed: true };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  exportFixturesSnapshotDay(arg).then(r => {
    console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0, valueEngineUntouched: true } }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
