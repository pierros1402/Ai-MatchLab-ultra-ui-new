/**
 * build-matchday-ledger.js
 *
 * Writes a per-FIXTURE matchday (round) ledger for every league whose standings
 * pass the integrity gate. Where build-matchday-axis.js stamps ONE round per
 * league onto league-memory, this stamps a round onto EVERY played fixture of the
 * league's current season and persists it to
 * data/matchday-ledger/<slug>/<season>.json.
 *
 * Closes the re-audit finding FULL_SEASON_MATCHDAY_LEDGER_MISSING (the rolling
 * window had 0 rowsWithRound). Deterministic, no scrape: rounds are imputed from
 * chronological appearance counts (core/matchday-ledger.js), gated by
 * isLeagueIntegrityGreen so a corrupt / cumulative standings table can never mint
 * a bogus ledger. Each league's latestRound is cross-checked against the axis's
 * matchday — the same `played` signal reached by a different path — and the result
 * recorded per league so a disagreement is visible, not silently trusted.
 *
 * Additive: it only stamps matchdayLedger* fields onto each league and clears them
 * for leagues that no longer qualify. It never touches state/seasonWindow/matchday*.
 *
 * Usage:
 *   node engine-v1/jobs/build-matchday-ledger.js            # write files + state + summary
 *   node engine-v1/jobs/build-matchday-ledger.js --dry-run  # summary only, no writes
 */

import fs from "fs";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { readAllStates, writeAllStates } from "../storage/league-memory-db.js";
import { computeMatchdayAxis, isLeagueIntegrityGreen } from "../core/matchday-axis.js";
import { currentArchiveSeason } from "../core/season-model.js";
import { readArchiveLeagueSeasonRows } from "../core/history-layer.js";
import { assignRounds, summarizeLedger, crossCheckAgainstAxis } from "../core/matchday-ledger.js";

const LEDGER_FIELDS = [
  "matchdayLedgerLatestRound",
  "matchdayLedgerRows",
  "matchdayLedgerSeason",
  "matchdayLedgerCrossCheck",
  "matchdayLedgerAnomaly",
  "matchdayLedgerAt"
];

function clearLedgerFields(state) {
  let touched = false;
  for (const f of LEDGER_FIELDS) {
    if (f in state) { delete state[f]; touched = true; }
  }
  return touched;
}

export function buildMatchdayLedger({ dryRun = false } = {}) {
  const all = readAllStates();
  const slugs = Object.keys(all);
  const now = new Date().toISOString();

  const anomalies = [];
  const mismatches = [];
  let built = 0;
  let skipped = 0;
  let cleared = 0;

  for (const slug of slugs) {
    const state = all[slug];
    if (!state) continue;

    // Fail-closed: a ledger is only trustworthy when the league's standings pass
    // the same integrity gate the axis and rich UI already trust.
    if (!isLeagueIntegrityGreen(slug)) {
      if (clearLedgerFields(state)) { cleared++; state.updatedAt = now; }
      skipped++;
      continue;
    }

    const season = currentArchiveSeason(slug);
    // readArchiveLeagueSeasonRows already returns FINAL (played) rows only, which
    // is what aligns the imputed round with standings `played`.
    const matches = readArchiveLeagueSeasonRows(slug, season);
    if (!matches.length) {
      if (clearLedgerFields(state)) { cleared++; state.updatedAt = now; }
      skipped++;
      continue;
    }

    // Preserve the archive fixture id as the ledger key so consumers can join a
    // round back onto a specific fixture.
    const assigned = assignRounds(matches.map(m => ({
      key: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff_ms: m.kickoff_ms
    })));

    const axis = computeMatchdayAxis(slug);
    const summary = summarizeLedger(assigned, axis.matchdayTeams);
    const crossCheck = crossCheckAgainstAxis(summary.latestRound, axis.matchday);

    if (!dryRun) {
      ensureDir(resolveDataPath("matchday-ledger", slug));
      fs.writeFileSync(
        resolveDataPath("matchday-ledger", slug, `${season}.json`),
        JSON.stringify({
          leagueSlug: slug,
          season,
          generatedAt: now,
          roundSource: "imputed_sequential",
          axisMatchday: axis.matchday,
          summary,
          crossCheck,
          rounds: assigned
        }, null, 2),
        "utf8"
      );
    }

    // Additive per-league stamp for coverage reports / active panel / details.
    state.matchdayLedgerLatestRound = summary.latestRound;
    state.matchdayLedgerRows = summary.matchesWithRound;
    state.matchdayLedgerSeason = season;
    state.matchdayLedgerCrossCheck = { agrees: crossCheck.agrees, gap: crossCheck.gap };
    state.matchdayLedgerAnomaly = summary.anomaly;
    state.matchdayLedgerAt = now;
    state.updatedAt = now;
    built++;

    if (summary.anomaly?.bool) {
      anomalies.push({ slug, latestRound: summary.latestRound, oversized: summary.oversizedRounds });
    }
    if (!crossCheck.agrees) {
      mismatches.push({ slug, latestRound: summary.latestRound, axisMatchday: axis.matchday, gap: crossCheck.gap });
    }
  }

  if (!dryRun) writeAllStates(all);

  return {
    ok: true,
    dryRun,
    leaguesTotal: slugs.length,
    ledgersBuilt: built,
    skipped,
    staleCleared: cleared,
    anomalyCount: anomalies.length,
    mismatchCount: mismatches.length,
    anomalies: anomalies.sort((a, b) => (b.latestRound ?? 0) - (a.latestRound ?? 0)),
    mismatches: mismatches.sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  const res = buildMatchdayLedger({ dryRun });
  const { anomalies, mismatches, ...summary } = res;
  console.log(JSON.stringify(summary, null, 2));
  if (mismatches.length) {
    console.log(`\n${dryRun ? "[dry-run] " : ""}ledger↔axis mismatches (round disagrees with standings matchday):`);
    for (const m of mismatches) {
      console.log(`  ${m.slug.padEnd(12)} ledger=${m.latestRound} axis=${m.axisMatchday} gap=${m.gap}`);
    }
  }
  if (anomalies.length) {
    console.log(`\n${dryRun ? "[dry-run] " : ""}oversized-round anomalies (possible identity contamination):`);
    for (const a of anomalies) {
      const top = a.oversized?.[0];
      console.log(`  ${a.slug.padEnd(12)} latestRound=${a.latestRound}${top ? `  round ${top.round}: ${top.matches} matches (expected ~${top.expected})` : ""}`);
    }
  }
}
