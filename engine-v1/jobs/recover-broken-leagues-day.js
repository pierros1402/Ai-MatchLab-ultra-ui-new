/**
 * recover-broken-leagues-day.js
 *
 * Self-heal pass for fixture coverage. Instead of a human reading the daily
 * gap report and re-running acquisition by hand, this closes the loop:
 *
 *   1. Find leagues that have expected matches for the day but ZERO canonical
 *      fixtures (the BROKEN set — season-calendar false negatives and
 *      provider-zero-events).
 *   2. Force-acquire exactly those leagues, ignoring the season filter and
 *      using every provider (ESPN → Flashscore fallback).
 *   3. Report what was recovered and what genuinely could not be found.
 *
 * Runs at the START of the daily cycle so recovered fixtures flow through
 * standings/details/value like any other match. Idempotent: leagues already
 * present in canonical are skipped.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { runFixtureAcquisitionChunk } from "./run-fixture-acquisition-chunk.js";

function log(...a) { console.log("[recover-broken-leagues]", ...a); }

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function expectedLeaguesForDay(dayKey) {
  const record = readJsonSafe(resolveDataPath("expected-matches", `${dayKey}.json`), null);
  const counts = new Map();
  for (const match of Array.isArray(record?.matches) ? record.matches : []) {
    const slug = String(match?.leagueSlug || "").trim();
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return counts;
}

function canonicalCountForLeague(dayKey, slug) {
  const payload = readJsonSafe(resolveDataPath("canonical-fixtures", dayKey, `${slug}.json`), null);
  return Array.isArray(payload?.fixtures) ? payload.fixtures.length : 0;
}

export async function recoverBrokenLeaguesDay(dayKey = athensDayKey(), options = {}) {
  const date = String(dayKey);
  const expected = expectedLeaguesForDay(date);

  // BROKEN = expected matches recorded, but nothing in canonical for the day.
  const brokenLeagues = [...expected.keys()]
    .filter(slug => canonicalCountForLeague(date, slug) === 0)
    .sort();

  if (brokenLeagues.length === 0) {
    log("nothing to recover", { dayKey: date });
    return { ok: true, dayKey: date, brokenLeagues: [], recovered: [], stillBroken: [] };
  }

  log("recovering", { dayKey: date, brokenLeagues });

  let report = null;
  try {
    report = await runFixtureAcquisitionChunk({
      dayKey: date,
      explicitLeagues: brokenLeagues,
      // Recovery only cares about the target day itself.
      daysBack: 0,
      daysForward: 0,
      ...options
    });
  } catch (err) {
    log("acquisition failed", { error: err?.message || String(err) });
    return {
      ok: false,
      dayKey: date,
      brokenLeagues,
      recovered: [],
      stillBroken: brokenLeagues,
      error: err?.message || String(err)
    };
  }

  const recovered = [];
  const stillBroken = [];
  for (const slug of brokenLeagues) {
    const count = canonicalCountForLeague(date, slug);
    if (count > 0) {
      recovered.push({ slug, fixtures: count, expected: expected.get(slug) || 0 });
    } else {
      // Surface the provider attempts so a genuine "provider has nothing"
      // (vs a bug) is distinguishable in the log.
      const attempts = (report?.results || [])
        .filter(r => r.slug === slug)
        .map(r => ({ provider: r.provider, rawEvents: r.rawEvents, providerAttempts: r.providerAttempts, error: r.error }));
      stillBroken.push({ slug, expected: expected.get(slug) || 0, attempts });
    }
  }

  log("done", {
    dayKey: date,
    recovered: recovered.map(r => `${r.slug}(${r.fixtures})`),
    stillBroken: stillBroken.map(s => s.slug)
  });

  return { ok: true, dayKey: date, brokenLeagues, recovered, stillBroken };
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  recoverBrokenLeaguesDay(arg)
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
