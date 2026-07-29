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
import { fetchFlashscoreMatchRound } from "../odds/flashscore-match-round-source.js";
import { resolveFlashscoreCompetitionIdentity } from "../core/flashscore-competition-identity.js";
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

function stableIdentityDiagnostic(row) {
  return [
    row?.status || "",
    row?.reasonCode || "",
    row?.provider || "",
    row?.providerCompetitionId || "",
    row?.rawCountry || "",
    row?.rawLeagueName || "",
    row?.rawLeaguePath || "",
    row?.sourceId || "",
    row?.home || "",
    row?.away || "",
    row?.kickoffUtc || ""
  ].join("|");
}

export function contentHash({
  matches = [],
  excludedCompetitions = [],
  quarantinedCompetitions = []
} = {}) {
  const stable = {
    matches: matches.map(m =>
      [
        m?.id || "",
        m?.kickoffUtc || "",
        m?.home || "",
        m?.away || "",
        m?.leagueSlug || "",
        m?.providerCompetitionId || "",
        m?.providerLeaguePath || "",
        m?.competitionResolution?.status || "",
        m?.competitionResolution?.method || "",
        m?.competitionResolution?.reasonCode || "",
        m?.providerRound?.verified === true ? m?.providerRound?.roundNumber : ""
      ].join("|")
    ),
    excludedCompetitions:
      excludedCompetitions.map(
        stableIdentityDiagnostic
      ),
    quarantinedCompetitions:
      quarantinedCompetitions.map(
        stableIdentityDiagnostic
      )
  };

  return crypto
    .createHash("sha1")
    .update(JSON.stringify(stable))
    .digest("hex");
}

export async function exportFixturesSnapshotDay(
  dayKey = athensDayKey(),
  options = {}
) {
  const {
    fetchFixtures =
      fetchFlashscoreFixtures,
    registerCanonicalMatch =
      registerMatch,
    writeArtifact = true,
    fetchMatchRound = fetchFlashscoreMatchRound,
    roundConcurrency = 6
  } = options;

  const windowSet = new Set([
    dayKey,
    shiftDay(dayKey, 1),
    shiftDay(dayKey, 2)
  ]);

  const feed = await fetchFixtures({
    offsets: [0, 1, 2]
  });

  const matches = [];
  const excludedCompetitions = [];
  const quarantinedCompetitions = [];

  for (const fx of feed.rows) {
    const dk = athensDayKeyFromUtc(fx.kickoffUtc);
    if (dk && !windowSet.has(dk)) continue;

    const competitionIdentity =
      resolveFlashscoreCompetitionIdentity({
        country: fx.country,
        leagueName: fx.leagueName,
        leaguePath: fx.leaguePath,
        providerCompetitionId:
          fx.leagueId ||
          fx.tournamentId ||
          fx.competitionId
      });

    if (
      competitionIdentity.status ===
      "excluded"
    ) {
      excludedCompetitions.push({
        sourceId: fx.matchId || null,
        home: fx.home || null,
        away: fx.away || null,
        kickoffUtc: fx.kickoffUtc || null,
        ...competitionIdentity
      });

      continue;
    }

    if (
      competitionIdentity.status !==
        "resolved" ||
      !competitionIdentity.canonicalSlug
    ) {
      quarantinedCompetitions.push({
        sourceId: fx.matchId || null,
        home: fx.home || null,
        away: fx.away || null,
        kickoffUtc: fx.kickoffUtc || null,
        ...competitionIdentity
      });

      continue;
    }

    const slug =
      competitionIdentity.canonicalSlug;

    const canonicalId = buildCanonicalId(slug, fx.home, fx.away, fx.dayKey || fx.kickoffUtc);
    if (!canonicalId) continue;

    // Register in the canonical registry so other layers can look up by source ID
    registerCanonicalMatch(dk, {
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
      leagueName:
        competitionIdentity.canonicalLabel ||
        fx.leagueName,
      leagueSlug: slug,
      country: fx.country,
      providerLeaguePath:
        competitionIdentity.rawLeaguePath,
      providerCompetitionId:
        competitionIdentity.providerCompetitionId,
      tournamentId: fx.tournamentId || null,
      stageId: fx.stageId || null,
      competitionResolution: {
        status:
          competitionIdentity.status,
        method:
          competitionIdentity.resolutionMethod,
        reasonCode:
          competitionIdentity.reasonCode
      },
      kickoffUtc: fx.kickoffUtc,
      kickoff_ms: Date.parse(fx.kickoffUtc) || 0,
      dayKey: dk,
      status: deriveStatus(fx.kickoffUtc)
    });
  }
  // Provider-native round enrichment. This is display metadata only and never
  // falls back to standings played counts or a derived matchday axis.
  let roundCursor = 0;
  const roundWorkers = Array.from(
    { length: Math.max(1, Math.min(12, Number(roundConcurrency) || 6)) },
    async () => {
      while (roundCursor < matches.length) {
        const index = roundCursor++;
        const row = matches[index];
        if (!row?.sourceId || !row?.tournamentId || !row?.stageId) continue;
        try {
          const round = await fetchMatchRound(row.sourceId, {
            tournamentId: row.tournamentId,
            stageId: row.stageId
          });
          row.providerRound = {
            status: round?.status || "empty",
            verified: round?.verified === true,
            reason: round?.reason || null,
            source: round?.source || null,
            roundNumber: Number.isInteger(round?.roundNumber) ? round.roundNumber : null,
            roundLabel: round?.roundLabel || null
          };
          if (row.providerRound.verified && row.providerRound.roundNumber != null) {
            row.roundNumber = row.providerRound.roundNumber;
            row.roundLabel = row.providerRound.roundLabel;
          }
        } catch (error) {
          row.providerRound = {
            status: "empty", verified: false,
            reason: "round_fetch_failed", source: null,
            roundNumber: null, roundLabel: null
          };
        }
      }
    }
  );
  await Promise.all(roundWorkers);

  matches.sort((a, b) => a.kickoff_ms - b.kickoff_ms);

  const dir = resolveDataPath(
    "deploy-snapshots",
    dayKey
  );

  const file = resolveDataPath(
    "deploy-snapshots",
    dayKey,
    "fixtures-all.json"
  );

  const hash = contentHash({
    matches,
    excludedCompetitions,
    quarantinedCompetitions
  });

  const artifact = {
    ok: true,
    date: dayKey,
    generatedAt:
      new Date().toISOString(),
    source: "flashscore",
    hash,
    count: matches.length,
    excludedCompetitionCount:
      excludedCompetitions.length,
    quarantinedCompetitionCount:
      quarantinedCompetitions.length,
    excludedCompetitions,
    quarantinedCompetitions,
    matches
  };

  if (!writeArtifact) {
    return {
      ok: true,
      dayKey,
      count: matches.length,
      excludedCompetitionCount:
        excludedCompetitions.length,
      quarantinedCompetitionCount:
        quarantinedCompetitions.length,
      file: null,
      changed: null,
      artifact
    };
  }

  ensureDir(dir);

  try {
    const existing =
      JSON.parse(
        fs.readFileSync(
          file,
          "utf8"
        )
      );

    if (existing.hash === hash) {
      return {
        ok: true,
        dayKey,
        count: matches.length,
        excludedCompetitionCount:
          excludedCompetitions.length,
        quarantinedCompetitionCount:
          quarantinedCompetitions.length,
        file,
        changed: false
      };
    }
  } catch {
    /* no existing artifact */
  }

  fs.writeFileSync(
    file,
    JSON.stringify(
      artifact,
      null,
      2
    ),
    "utf8"
  );

  return {
    ok: true,
    dayKey,
    count: matches.length,
    excludedCompetitionCount:
      excludedCompetitions.length,
    quarantinedCompetitionCount:
      quarantinedCompetitions.length,
    file,
    changed: true
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  exportFixturesSnapshotDay(arg).then(r => {
    console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0, valueEngineUntouched: true } }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
