import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFixturesByDay, getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { buildAiDetailsBlock } from "../ai-match-intelligence/build-ai-details-block.js";
import { buildRefereeContext } from "../core/referee-context.js";
import { readPlayerUsageRecord } from "../storage/player-usage-db.js";
import { inferAbsencesFromUsage } from "../ai-match-intelligence/player-usage/absence-inference.js";


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
    competitionStatus: String(payload?.context?.status || ""),
    competitionReason: String(payload?.context?.diagnostics?.reason || ""),
    importance: String(payload?.context?.importance || ""),
    teamNewsStatus: String(payload?.teamNews?.status || ""),
    teamNewsSource: String(payload?.teamNews?.source || ""),
    teamNewsHomeAbsences: Array.isArray(payload?.teamNews?.data?.home?.absences)
      ? payload.teamNews.data.home.absences.length
      : 0,
    teamNewsAwayAbsences: Array.isArray(payload?.teamNews?.data?.away?.absences)
      ? payload.teamNews.data.away.absences.length
      : 0,
    teamNewsNotes: Array.isArray(payload?.teamNews?.data?.notes)
      ? payload.teamNews.data.notes.length
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

function dedupeText(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = String(raw || "").trim();
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function parseAbsencesFromNotes(notes = []) {
  const absences = [];

  for (const raw of Array.isArray(notes) ? notes : []) {
    const text = String(raw || "").trim();
    if (!text) continue;

    const m = text.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;

    const player = String(m[1] || "").trim();
    const reason = String(m[2] || "").trim();

    if (!player && !reason) continue;

    absences.push({
      player: player || null,
      reason: reason || "unknown",
      importance: "high"
    });
  }

  return absences;
}

function impactScoreFromAbsences(absences = []) {
  if (!Array.isArray(absences) || !absences.length) return 0;

  let score = 0;

  for (const p of absences) {
    if (p?.importance === "high") score += 0.4;
    else if (p?.importance === "medium") score += 0.25;
    else score += 0.1;
  }

  return Math.min(score, 1);
}

function impactLevelFromScore(score = 0) {
  if (score >= 0.7) return "severe";
  if (score >= 0.4) return "moderate";
  if (score > 0) return "minor";
  return "none";
}

function synthesizeTeamNewsSide(sideData, fallbackSource) {
  const source = sideData?.source || fallbackSource || "local-team-news";
  const updatedAt = sideData?.updatedAt || null;

  if (sideData?.absences || sideData?.impactScore != null || sideData?.impactLevel) {
    return {
      absences: Array.isArray(sideData?.absences) ? sideData.absences : [],
      impactScore: Number.isFinite(Number(sideData?.impactScore)) ? Number(sideData.impactScore) : 0,
      impactLevel: sideData?.impactLevel || "none",
      source,
      updatedAt
    };
  }

  const notes = Array.isArray(sideData?.notes) ? sideData.notes : [];
  const absences = parseAbsencesFromNotes(notes);
  const impactScore = impactScoreFromAbsences(absences);
  const impactLevel = impactLevelFromScore(impactScore);

  return {
    absences,
    impactScore,
    impactLevel,
    source,
    updatedAt
  };
}

function buildRefereeBlock(match) {
  const refereeContext = buildRefereeContext(match);

  const stats = refereeContext?.data?.stats || null;
  const name = refereeContext?.data?.name || null;
  const style = refereeContext?.data?.style || "unknown";
  const role = refereeContext?.data?.role || "referee";

  let note = null;

  if (refereeContext?.status === "ready") {
    note = null;
  } else if (refereeContext?.status === "partial") {
    note = {
      code: "referee_stats_pending",
      el: "Υπάρχει τοπική ταυτότητα διαιτητή, αλλά δεν υπάρχουν ακόμη αποθηκευμένα στατιστικά προφίλ.",
      en: "A local referee identity is available, but no stored statistical profile exists yet."
    };
  } else {
    note = {
      code: "referee_identity_missing",
      el: "Δεν υπάρχει ακόμη τοπική ταυτότητα διαιτητή για το snapshot.",
      en: "No local referee identity is available yet for this snapshot."
    };
  }

  return {
    status: refereeContext?.status || "empty",
    source: refereeContext?.source || "local-officiating",
    reason: refereeContext?.reason || null,
    confidence: refereeContext?.confidence ?? 0,
    name,
    role,
    stats: {
      avgCards: stats?.avgCards ?? null,
      avgPenalties: stats?.avgPenalties ?? null,
      avgFouls: stats?.avgFouls ?? null,
      sampleSize: stats?.sampleSize ?? null
    },
    style,
    note
  };
}

function buildTeamNewsBlock(teamNewsFact) {
  if (!teamNewsFact || !teamNewsFact.data) {
    return {
      status: teamNewsFact?.status || "empty",
      source: teamNewsFact?.source || "local-team-news",
      confidence: teamNewsFact?.confidence ?? 0,
      data: null,
      reason: teamNewsFact?.reason || "missing_local_team_news"
    };
  }

  const source = teamNewsFact?.source || "local-team-news";

  const homeRaw =
    teamNewsFact?.data?.home ||
    teamNewsFact?.data?.homeTeam ||
    null;

  const awayRaw =
    teamNewsFact?.data?.away ||
    teamNewsFact?.data?.awayTeam ||
    null;

  const home = synthesizeTeamNewsSide(homeRaw, source);
  const away = synthesizeTeamNewsSide(awayRaw, source);

  const topLevelNotes = Array.isArray(teamNewsFact?.data?.notes)
    ? teamNewsFact.data.notes
    : [];

  const homeNotes = Array.isArray(teamNewsFact?.data?.homeTeam?.notes)
    ? teamNewsFact.data.homeTeam.notes
    : [];

  const awayNotes = Array.isArray(teamNewsFact?.data?.awayTeam?.notes)
    ? teamNewsFact.data.awayTeam.notes
    : [];

  const notes = dedupeText([
    ...topLevelNotes,
    ...homeNotes,
    ...awayNotes
  ]);

  return {
    status: teamNewsFact?.status || "ready",
    source,
    confidence: teamNewsFact?.confidence ?? 0,
    data: {
      home,
      away,
      notes
    },
    reason: teamNewsFact?.reason || null
  };
}

function buildTravelBlock(travelContextFact) {
  return {
    status: travelContextFact?.status || "empty",
    source: travelContextFact?.source || "local-team-geo",
    reason: travelContextFact?.reason || null,
    confidence: travelContextFact?.confidence ?? 0,
    distanceKm: travelContextFact?.data?.distanceKm ?? null,
    impact: travelContextFact?.data?.impact || "unknown",
    sameCountry: travelContextFact?.data?.sameCountry ?? null,
    crossBorder: travelContextFact?.data?.crossBorder ?? null,
    travelProfile: travelContextFact?.data?.travelProfile || "unknown",
    home: travelContextFact?.data?.home || null,
    away: travelContextFact?.data?.away || null,
    note: travelContextFact?.data?.note || {
      code: "travel_pending",
      el: "Δεν υπάρχει ακόμη διαθέσιμο local travel context.",
      en: "Local travel context is not yet available."
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

  const competitionReason =
    competitionContext?.data?.diagnostics?.reason || null;

  if (competitionContext?.status === "ready" && competitionContext?.data) {
    if (importance === "high") {
      partsEl.push("Υπάρχει ένδειξη αυξημένης σημασίας από το competition context.");
      partsEn.push("There is an indication of elevated importance from the competition context.");
    } else if (importance === "medium") {
      partsEl.push("Υπάρχει ένδειξη μεσαίας σημασίας από το competition context.");
      partsEn.push("There is an indication of medium importance from the competition context.");
    }
  } else if (competitionReason === "possible_cross_competition_mismatch") {
    partsEl.push("Το competition context υποδεικνύει πιθανή ασυμφωνία διοργάνωσης ή διασταυρούμενο ζευγάρι ομάδων από την πηγή.");
    partsEn.push("The competition context indicates a possible competition mismatch or cross-competition pairing from the source.");
  } else if (
    competitionContext?.status === "fallback" ||
    competitionContext?.status === "partial" ||
    competitionContext?.status === "empty"
  ) {
    partsEl.push("Δεν υπάρχει ακόμη επαρκές αξιόπιστο standings context για ασφαλή εκτίμηση βαθμολογικής σημασίας.");
    partsEn.push("There is not yet enough reliable standings context for a safe assessment of competitive importance.");
  }

  if (referee?.status === "pending") {
    partsEl.push("Τα στοιχεία διαιτητή δεν είναι ακόμη διαθέσιμα στο snapshot.");
    partsEn.push("Referee information is not yet available in the snapshot.");
  } else if (referee?.status === "partial") {
    partsEl.push("Ο διαιτητής έχει εντοπιστεί, αλλά λείπουν ακόμη τα στατιστικά του profile.");
    partsEn.push("The referee has been identified, but profile statistics are still missing.");
  }

  const homeAbsenceCount = Array.isArray(teamNews?.data?.home?.absences)
    ? teamNews.data.home.absences.length
    : 0;

  const awayAbsenceCount = Array.isArray(teamNews?.data?.away?.absences)
    ? teamNews.data.away.absences.length
    : 0;

  const totalAbsences = homeAbsenceCount + awayAbsenceCount;
  const totalTeamNewsNotes = Array.isArray(teamNews?.data?.notes)
    ? teamNews.data.notes.length
    : 0;

  if (teamNews?.status === "ready" || teamNews?.status === "ok") {
    partsEl.push(
      totalAbsences > 0
        ? `Υπάρχει διαθέσιμο team news context για τον αγώνα με ${totalAbsences} συνολικές καταγεγραμμένες απουσίες.`
        : totalTeamNewsNotes > 0
          ? `Υπάρχει διαθέσιμο team news context για τον αγώνα με ${totalTeamNewsNotes} συνολικές σημειώσεις ομάδων.`
          : "Υπάρχει διαθέσιμο team news context για τον αγώνα."
    );
    partsEn.push(
      totalAbsences > 0
        ? `Team news context is available for this match with ${totalAbsences} recorded absences in total.`
        : totalTeamNewsNotes > 0
          ? `Team news context is available for this match with ${totalTeamNewsNotes} combined team notes.`
          : "Team news context is available for this match."
    );
  } else if (teamNews?.status === "empty" || teamNews?.status === "pending") {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο team news context στο snapshot.");
    partsEn.push("Team news context is not yet available in the snapshot.");
  }


  if (travel?.status === "ready" && Number.isFinite(travel?.distanceKm)) {
    partsEl.push(`Η εκτίμηση ταξιδιού είναι περίπου ${travel.distanceKm} χλμ (${travel.impact}).`);
    partsEn.push(`Estimated travel distance is approximately ${travel.distanceKm} km (${travel.impact}).`);
  } else if (travel?.status === "partial") {
    partsEl.push("Υπάρχει μερικό local travel context, αλλά δεν επαρκεί ακόμη για πλήρη εκτίμηση απόστασης.");
    partsEn.push("Partial local travel context exists, but it is not yet sufficient for a full distance estimate.");
  } else if (travel?.status === "empty" || travel?.status === "pending") {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο local travel context στο snapshot.");
    partsEn.push("Local travel context is not yet available in the snapshot.");
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
  const travelContextFact = aiBlocks?.researchedFacts?.travelContext || null;

  const referee = buildRefereeBlock(match);
  const travel = buildTravelBlock(travelContextFact);
  const teamNews = buildTeamNewsBlock(teamNewsFact);
  const analysis = buildAnalysisBlock(
    match,
    valuePicks,
    competitionContext,
    referee,
    travel,
    teamNews
  );

// ---------- PLAYER USAGE INTELLIGENCE ----------

const homeUsage = readPlayerUsageRecord(match?.homeTeam);
const awayUsage = readPlayerUsageRecord(match?.awayTeam);

const homeAbsenceIntel = inferAbsencesFromUsage({
  playerUsage: homeUsage,
  teamNews: teamNews?.data?.home
});

const awayAbsenceIntel = inferAbsencesFromUsage({
  playerUsage: awayUsage,
  teamNews: teamNews?.data?.away
});

const playerUsageIntel = {
  home: homeAbsenceIntel,
  away: awayAbsenceIntel
};

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
      status: competitionContext?.status || "empty",
      confidence: competitionContext?.confidence ?? 0,
      competitionType: competitionContext?.data?.type || classifyCompetitionType(match),
      importance: competitionContext?.data?.importance || "unknown",
      positions: competitionContext?.data?.positions || null,
      stakes: competitionContext?.data?.stakes || null,
      pressure: competitionContext?.data?.pressure || null,
      notes: Array.isArray(competitionContext?.data?.notes) ? competitionContext.data.notes : [],
      diagnostics: competitionContext?.data?.diagnostics || null,
      sourceReliability:
        competitionContext?.status === "ready"
          ? "usable"
          : competitionContext?.data?.diagnostics?.reason === "possible_cross_competition_mismatch"
            ? "suspect"
            : "limited",
      travelImpact: travel.impact,
      travelProfile: travel.travelProfile,
      crossBorder: travel.crossBorder
    },
    referee: refereeProfile?.data
      ? {
          status: refereeProfile.status || "ready",
          ...refereeProfile.data
        }
      : referee,
    teamNews,
    lineups: {
      home: {
        starters: Array.isArray(match?.lineups?.home?.starters)
          ? match.lineups.home.starters
          : [],
        bench: Array.isArray(match?.lineups?.home?.bench)
          ? match.lineups.home.bench
          : []
      },
      away: {
        starters: Array.isArray(match?.lineups?.away?.starters)
          ? match.lineups.away.starters
          : [],
        bench: Array.isArray(match?.lineups?.away?.bench)
          ? match.lineups.away.bench
          : []
      },
      source: match?.lineups ? "fixture.lineups" : "missing",
      status: match?.lineups ? "partial" : "missing"
    },
    travel,
    value: Array.isArray(valuePicks) ? valuePicks : [],
    analysis,
    playerUsageIntel,
    meta: {
      version: "details-snapshot-v2",
      builderVersion: "2026-04-11-unified-competition-context",
      languageReady: ["el", "en"],
      source: "engine-v1",
      snapshotMode: "update_on_change",
      signature: null,
      pendingSignals: {
        standings: competitionContext?.status !== "ready",
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
    aiSummary: aiBlocks?.aiContext?.summary || null,
    valueSummary:
      aiBlocks?.aiContext?.valueSummary ||
      aiBlocks?.researchedFacts?.valueContext ||
      null,
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
    aiSummary: aiBlocks?.aiContext?.summary || null,
    valueSummary:
      aiBlocks?.aiContext?.valueSummary ||
      aiBlocks?.researchedFacts?.valueContext ||
      null,
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