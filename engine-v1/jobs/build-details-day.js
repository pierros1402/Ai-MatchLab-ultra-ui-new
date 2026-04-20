import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFixturesByDay, getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { buildAiDetailsBlock } from "../ai-match-intelligence/build-ai-details-block.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function classifyCompetitionType(match) {
  const slug = String(match?.leagueSlug || "").toLowerCase();

  // -----------------------------
  // INTERNATIONAL CLUB COMPETITIONS
  // -----------------------------
  if (
    slug.includes("champions") ||
    slug.includes("europa") ||
    slug.includes("conference") ||
    slug.includes("libertadores") ||
    slug.includes("sudamericana") ||
    slug.includes("afc.champions")
  ) {
    return "international_cup";
  }

  // -----------------------------
  // DOMESTIC CUPS
  // -----------------------------
  if (
    slug.includes(".cup") ||
    slug.includes("fa") ||
    slug.includes("super_cup") ||
    slug.includes("league_cup") ||
    slug.includes("trophy")
  ) {
    return "domestic_cup";
  }

  // -----------------------------
  // LEAGUE
  // -----------------------------
  return "league";
}

function isLiveLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "LIVE" || s.includes("LIVE") || s.includes("IN_PROGRESS");
}

function isFinalLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "FT" || s.includes("FT") || s.includes("FINAL") || s.includes("COMPLETE");
}

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function kickoffDay(match) {
  if (match?.dayKey) return String(match.dayKey);
  if (match?.kickoffUtc) return athensDayFromKickoff(match.kickoffUtc);
  return null;
}

function readValuePicksForDay(dayKey) {
  if (!dayKey) return [];
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);
  return Array.isArray(payload?.picks) ? payload.picks : [];
}

function getValueForMatch(dayKey, matchId) {
  const all = readValuePicksForDay(dayKey);
  return all.filter(p => String(p?.matchId) === String(matchId));
}

function buildDetailsSignature(match, valuePicks, payload) {
  const topPick = (valuePicks || [])
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0] || null;

  const signaturePayload = {
    matchId: String(match?.matchId || ""),
    dayKey: kickoffDay(match),
    status: String(match?.status || ""),
    rawStatus: String(match?.rawStatus || ""),
    minute: String(match?.minute || ""),
    scoreHome: Number.isFinite(Number(match?.scoreHome)) ? Number(match.scoreHome) : null,
    scoreAway: Number.isFinite(Number(match?.scoreAway)) ? Number(match.scoreAway) : null,
    referee: String(
      match?.referee ||
      match?.sources?.espn?.referee ||
      ""
    ),
    competitionType: String(payload?.context?.competitionType || ""),
    importance: String(payload?.context?.importance || ""),
    teamNewsStatus: String(payload?.teamNews?.status || ""),
    teamNewsSource: String(payload?.teamNews?.source || ""),
    teamNewsHomeNotes: Array.isArray(payload?.teamNews?.data?.homeTeam?.notes)
      ? payload.teamNews.data.homeTeam.notes.length
      : 0,
    teamNewsAwayNotes: Array.isArray(payload?.teamNews?.data?.awayTeam?.notes)
      ? payload.teamNews.data.awayTeam.notes.length
      : 0,
    valueCount: Array.isArray(valuePicks) ? valuePicks.length : 0,
    topValue: topPick
      ? {
          market: String(topPick.market || ""),
          pick: String(topPick.pick || ""),
          score: Number.isFinite(Number(topPick.score)) ? Number(topPick.score) : null
        }
      : null,
    schemaVersion: "details-snapshot-v2",
    builderVersion: "2026-04-08-update-on-change"
  };

  return JSON.stringify(signaturePayload);
}

function buildRefereeBlock(match) {
  const refereeName =
    match?.referee ||
    match?.sources?.espn?.referee ||
    null;

  const refKey = refereeName
    ? String(refereeName).trim().toLowerCase().replace(/\s+/g, "_")
    : null;

  const refFile = refKey ? resolveDataPath("referees", `${refKey}.json`) : null;
  const cached = refFile ? readJsonSafe(refFile, null) : null;

  return {
    status: cached ? "ready" : refereeName ? "partial" : "pending",
    name: cached?.name || refereeName || null,
    stats: {
      avgCards: cached?.avgCards ?? null,
      avgPenalties: cached?.avgPenalties ?? null,
      avgFouls: cached?.avgFouls ?? null,
      sampleSize: cached?.sampleSize ?? null
    },
    style: cached?.style || "unknown",
    note: cached
      ? null
      : refereeName
        ? {
            code: "referee_stats_pending",
            el: "Ο διαιτητής εντοπίστηκε αλλά δεν υπάρχουν ακόμη αποθηκευμένα στατιστικά.",
            en: "Referee identified, but no stored statistics are available yet."
          }
        : {
            code: "referee_pending",
            el: "Δεν υπάρχει ακόμη διαθέσιμος διαιτητής για το snapshot.",
            en: "No referee is available yet for this snapshot."
          }
  };
}

function buildTeamNewsBlock(teamNewsFact) {
  if (!teamNewsFact || teamNewsFact.status !== "ok" || !teamNewsFact.data) {
    return {
      status: teamNewsFact?.status || "empty",
      source: teamNewsFact?.source || null,
      confidence: teamNewsFact?.confidence ?? 0,
      data: null,
      reason: teamNewsFact?.reason || null
    };
  }

  return {
    status: "ok",
    source: teamNewsFact.source || null,
    confidence: teamNewsFact.confidence ?? 0,
    data: teamNewsFact.data,
    reason: null
  };
}

function buildTravelBlock(match) {
  const slug = String(match?.leagueSlug || "").toLowerCase();

  // V1: structure-first. Real geo lookup μπαίνει όταν δημιουργηθεί data/geo/teams.json.
  const hasGeoCache = fs.existsSync(resolveDataPath("geo", "teams.json"));

  return {
    status: hasGeoCache ? "partial" : "pending",
    distanceKm: null,
    impact: "unknown",
    note: {
      code: "travel_pending",
      el:
        slug.includes("champions") || slug.includes("europa")
          ? "Η απόσταση ταξιδιού θα ενεργοποιηθεί όταν μπει το geo cache ομάδων."
          : "Η απόσταση ταξιδιού εκκρεμεί μέχρι να προστεθεί το geo cache ομάδων.",
      en:
        slug.includes("champions") || slug.includes("europa")
          ? "Travel distance will activate once the team geo cache is added."
          : "Travel distance is pending until the team geo cache is added."
    }
  };
}

function buildAnalysisBlock(match, valuePicks, competitionContext, referee, travel, teamNews) {
  const codes = [];

  if (isLiveLike(match?.status)) codes.push("live_match");
  if (isFinalLike(match?.status)) codes.push("final_match");
  if ((valuePicks || []).length) codes.push("value_present");

  const importance = competitionContext?.data?.importance || null;
  if (importance === "high") codes.push("high_competition_context");
  if (importance === "medium") codes.push("medium_competition_context");

  if (referee?.style === "low_intervention") codes.push("low_ref_intervention");
  if (travel?.impact === "high") codes.push("high_travel_load");

  const topPick = (valuePicks || [])
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0];

  const partsEl = [];
  const partsEn = [];

  if (topPick) {
    partsEl.push(
      `Το ισχυρότερο διαθέσιμο value snapshot είναι ${topPick.market} → ${topPick.pick} με score ${Number(topPick.score || 0).toFixed(3)}.`
    );
    partsEn.push(
      `The strongest available value snapshot is ${topPick.market} → ${topPick.pick} with score ${Number(topPick.score || 0).toFixed(3)}.`
    );
  } else {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο value snapshot για τον αγώνα.");
    partsEn.push("No value snapshot is available yet for this match.");
  }

  if (competitionContext?.data) {
    if (importance === "high") {
      partsEl.push("Υπάρχει ένδειξη αυξημένης σημασίας από το competition context.");
      partsEn.push("There is an indication of elevated importance from the competition context.");
    } else if (importance === "medium") {
      partsEl.push("Υπάρχει ένδειξη μεσαίας σημασίας από το competition context.");
      partsEn.push("There is an indication of medium importance from the competition context.");
    }
  } else if (competitionContext?.status === "empty") {
    partsEl.push("Δεν υπάρχει ακόμη επαρκές standings context για να εκτιμηθεί η βαθμολογική σημασία.");
    partsEn.push("There is not yet enough standings context to assess competitive importance.");
  }

  if (referee?.status === "pending") {
    partsEl.push("Τα στοιχεία διαιτητή δεν είναι ακόμη διαθέσιμα στο snapshot.");
    partsEn.push("Referee information is not yet available in the snapshot.");
  } else if (referee?.status === "partial") {
    partsEl.push("Ο διαιτητής έχει εντοπιστεί, αλλά λείπουν ακόμη τα στατιστικά του profile.");
    partsEn.push("The referee has been identified, but profile statistics are still missing.");
  }

  const homeTeamNewsNotes = Array.isArray(teamNews?.data?.homeTeam?.notes)
    ? teamNews.data.homeTeam.notes.length
    : 0;

  const awayTeamNewsNotes = Array.isArray(teamNews?.data?.awayTeam?.notes)
    ? teamNews.data.awayTeam.notes.length
    : 0;

  const totalTeamNewsNotes = homeTeamNewsNotes + awayTeamNewsNotes;

  if (teamNews?.status === "ok") {
    partsEl.push(
      totalTeamNewsNotes > 0
        ? `Υπάρχει διαθέσιμο team news context για τον αγώνα με ${totalTeamNewsNotes} συνολικές σημειώσεις ομάδων.`
        : "Υπάρχει διαθέσιμο team news context για τον αγώνα."
    );
    partsEn.push(
      totalTeamNewsNotes > 0
        ? `Team news context is available for this match with ${totalTeamNewsNotes} combined team notes.`
        : "Team news context is available for this match."
    );
  } else if (teamNews?.status === "empty" || teamNews?.status === "pending") {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο team news context στο snapshot.");
    partsEn.push("Team news context is not yet available in the snapshot.");
  }


  if (travel?.status !== "ready") {
    partsEl.push("Η εκτίμηση ταξιδιού θα ενεργοποιηθεί όταν προστεθεί geo cache ομάδων.");
    partsEn.push("Travel estimation will activate once the team geo cache is added.");
  }

  return {
    codes,
    summary: {
      el: partsEl.join(" "),
      en: partsEn.join(" ")
    }
  };
}

function buildSourceIntelligence(match) {
  if (!match?.reconcileMeta) return null;

  const decision = match.reconcileMeta.decision || {
    status: {
      type: "consensus",
      chosen: match.status,
      source: match.reconcileMeta?.chosenStatusSource || null,
      sources: Object.keys(match.sources || {})
    },
    score: {
      type: "consensus",
      chosen: `${match.scoreHome}-${match.scoreAway}`,
      source: match.reconcileMeta?.chosenScoreSource || null
    },
    minute: {
      type: "consensus",
      chosen: match.minute,
      source: match.reconcileMeta?.chosenMinuteSource || null
    }
  };

  const decisionSources = Array.from(
    new Set([
      ...(Array.isArray(decision?.status?.sources) ? decision.status.sources : []),
      decision?.status?.source || null,
      decision?.score?.source || null,
      decision?.minute?.source || null
    ].filter(Boolean))
  );

  return {
    decision,
    confidence: match.reconcileMeta.confidence ?? null,
    conflicts: match.reconcileMeta.conflictTypes || [],
    disagreement: match.reconcileMeta.disagreement || false,
    sources: decisionSources.length
  };
}

function buildDetailsPayload(match, valuePicks, aiBlocks = {}) {
  const competitionContext = aiBlocks?.researchedFacts?.competitionContext || null;
  const refereeProfile = aiBlocks?.researchedFacts?.refereeProfile || null;
  const teamNewsFact = aiBlocks?.researchedFacts?.teamNews || null;

  const referee = buildRefereeBlock(match);
  const travel = buildTravelBlock(match);
  const teamNews = buildTeamNewsBlock(teamNewsFact);
  const analysis = buildAnalysisBlock(
    match,
    valuePicks,
    competitionContext,
    referee,
    travel,
    teamNews
  );

  return {
    matchId: String(match.matchId),
    dayKey: kickoffDay(match),
    generatedAt: new Date().toISOString(),
    basic: {
      matchId: String(match.matchId),
      leagueSlug: match.leagueSlug || null,
      leagueName: match.leagueName || null,
      competitionType: classifyCompetitionType(match),
      homeTeam: match.homeTeam || null,
      awayTeam: match.awayTeam || null,
      kickoffUtc: toIsoOrNull(match.kickoffUtc),
      status: match.status || null,
      rawStatus: match.rawStatus || null,
      minute: match.minute || null,
      scoreHome: Number.isFinite(Number(match.scoreHome)) ? Number(match.scoreHome) : null,
      scoreAway: Number.isFinite(Number(match.scoreAway)) ? Number(match.scoreAway) : null,
      venue: match.venue || null
    },
    context: {
      competitionType: competitionContext?.data?.type || classifyCompetitionType(match),
      importance: competitionContext?.data?.importance || "unknown",
      positions: competitionContext?.data?.positions || null,
      stakes: competitionContext?.data?.stakes || null,
      pressure: competitionContext?.data?.pressure || null,
      notes: Array.isArray(competitionContext?.data?.notes) ? competitionContext.data.notes : [],
      travelImpact: travel.impact
    },
    referee: refereeProfile?.data
      ? {
          status: refereeProfile.status || "ready",
          ...refereeProfile.data
        }
      : referee,
    teamNews,
    travel,
    value: Array.isArray(valuePicks) ? valuePicks : [],
    analysis,
    meta: {
      version: "details-snapshot-v2",
      builderVersion: "2026-04-11-unified-competition-context",
      languageReady: ["el", "en"],
      source: "engine-v1",
      snapshotMode: "update_on_change",
      signature: null,
      pendingSignals: {
        standings: !competitionContext?.data,
        refereeStats: !refereeProfile?.data && referee.status !== "ready",
        teamNews: !teamNewsFact?.data,
        travelGeo: travel.status !== "ready"
      }
    }
  };
}


function detailsFilePath(dayKey, matchId) {
  return resolveDataPath("details", dayKey, `${matchId}.json`);
}

export async function buildDetailsForMatch(matchId, { rebuild = false } = {}) {
  const match = getFixtureById(String(matchId));
  if (!match) {
    return { ok: false, error: "match_not_found", matchId: String(matchId) };
  }

  const dayKey = kickoffDay(match);
  if (!dayKey) {
    return { ok: false, error: "missing_day_key", matchId: String(matchId) };
  }

  const file = detailsFilePath(dayKey, match.matchId);
  const existing = fs.existsSync(file) ? readJsonSafe(file, null) : null;

  const valuePicks = getValueForMatch(dayKey, match.matchId);

  const aiBlocks = await buildAiDetailsBlock(match, {
    dayKey,
    valuePicks,
    allFixtures: getFixturesByDay(dayKey) || []
  });

  const payload = {
    ...buildDetailsPayload(match, valuePicks, aiBlocks),

    ai: aiBlocks.ai || null,
    researchedFacts: aiBlocks.researchedFacts,
    aiContext: aiBlocks.aiContext,
    sourceAudit: aiBlocks.sourceAudit,
    learningMeta: aiBlocks.learningMeta,
    remoteTaskQueue: aiBlocks.remoteTaskQueue || [],
    remoteTaskRouter: aiBlocks.remoteTaskRouter || {
      status: "idle",
      queueSize: 0,
      queuedCapabilities: []
    },
    remoteExecution: aiBlocks.remoteExecution || {
      status: "idle",
      mode: "stub",
      queueSize: 0,
      executedCount: 0,
      queuedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      providersTried: [],
      results: [],
      meta: {
        matchId: String(match?.matchId || ""),
        dayKey,
        executorVersion: "remote-executor-stub-v1"
      }
    },

    sourceIntelligence: buildSourceIntelligence(match)
  };

  const nextSignature = buildDetailsSignature(match, valuePicks, payload);

  if (!rebuild && existing?.meta?.signature === nextSignature) {
    return {
      ok: true,
      dayKey,
      matchId: String(match.matchId),
      file,
      reused: true,
      details: existing
    };
  }

  payload.meta.signature = nextSignature;
  writeJson(file, payload);

  return {
    ok: true,
    dayKey,
    matchId: String(match.matchId),
    file,
    reused: false,
    details: payload
  };
}

export async function buildDetailsDay(dayKey, { rebuild = false } = {}) {
  const rows = getFixturesByDay(dayKey) || [];

  if (!rows.length) {
    return {
      ok: false,
      dayKey,
      reason: "no_rows",
      built: 0,
      skipped: 0,
      files: []
    };
  }

  ensureDir(resolveDataPath("details", dayKey));

  let built = 0;
  let skipped = 0;
  const files = [];

for (const match of rows) {
  console.log("[build-details-day] match:start", {
    matchId: match?.matchId,
    homeTeam: match?.homeTeam,
    awayTeam: match?.awayTeam
  });

  const file = detailsFilePath(dayKey, match.matchId);
  const existing = fs.existsSync(file) ? readJsonSafe(file, null) : null;

  const valuePicks = getValueForMatch(dayKey, match.matchId);

  const aiBlocks = await buildAiDetailsBlock(match, {
    dayKey,
    valuePicks,
    allFixtures: rows
  });

  const payload = {
    ...buildDetailsPayload(match, valuePicks, aiBlocks),

    ai: aiBlocks.ai || null,
    researchedFacts: aiBlocks.researchedFacts,
    aiContext: aiBlocks.aiContext,
    sourceAudit: aiBlocks.sourceAudit,
    learningMeta: aiBlocks.learningMeta,
    remoteTaskQueue: aiBlocks.remoteTaskQueue || [],
    remoteTaskRouter: aiBlocks.remoteTaskRouter || {
      status: "idle",
      queueSize: 0,
      queuedCapabilities: []
    },
    remoteExecution: aiBlocks.remoteExecution || {
      status: "idle",
      mode: "stub",
      queueSize: 0,
      executedCount: 0,
      queuedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      providersTried: [],
      results: [],
      meta: {
        matchId: String(match?.matchId || ""),
        dayKey,
        executorVersion: "remote-executor-stub-v1"
      }
    },

    sourceIntelligence: buildSourceIntelligence(match)
  };

  const nextSignature = buildDetailsSignature(match, valuePicks, payload);

  if (!rebuild && existing?.meta?.signature === nextSignature) {
    console.log("[build-details-day] match:skip", {
      matchId: match?.matchId
    });

    skipped += 1;
    files.push(file);
    continue;
  }

  payload.meta.signature = nextSignature;
  writeJson(file, payload);

  console.log("[build-details-day] match:write", {
    matchId: match?.matchId,
    file
  });

  built += 1;
  files.push(file);
}

  return {
    ok: true,
    dayKey,
    total: rows.length,
    built,
    skipped,
    files
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const rebuild = process.argv.includes("--rebuild");

  console.log("[build-details-day] cli:start", {
    argv: process.argv.slice(2),
    dayKey,
    rebuild
  });

  if (!dayKey) {
    console.error("[build-details-day] missing dayKey");
    process.exit(1);
  }

  buildDetailsDay(dayKey, { rebuild })
    .then(result => {
      console.log("[build-details-day] cli:done", result);
    })
    .catch(err => {
      console.error("[build-details-day] cli:fatal", err);
      process.exit(1);
    });
}