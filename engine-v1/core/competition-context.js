import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqueStrings(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}

const STOPWORDS = new Set([
  "fc", "cf", "sc", "afc", "club", "athletic", "de", "the", "ac", "as",
  "fk", "nk", "sk", "if", "bk", "ik", "ff", "sv", "tsv"
]);

function normalizeTeamName(name) {
  if (!name) return "";

  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(token => token && !STOPWORDS.has(token))
    .join(" ")
    .trim();
}

function tokenizeTeamName(name) {
  return normalizeTeamName(name)
    .split(" ")
    .filter(Boolean);
}

function sameTeam(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);

  if (!na || !nb) return false;

  // exact canonical match
  if (na === nb) return true;

  const tokensA = tokenizeTeamName(a);
  const tokensB = tokenizeTeamName(b);

  if (!tokensA.length || !tokensB.length) return false;

  // one side fully contained in the other
  const allAInB = tokensA.every(token => tokensB.includes(token));
  const allBInA = tokensB.every(token => tokensA.includes(token));

  if (allAInB || allBInA) return true;

  // controlled overlap fallback
  const overlap = tokensA.filter(token => tokensB.includes(token));

  return overlap.length >= 2;
}

function normalizePosition(pos) {
  const n = safeNum(pos, null);
  return n && n > 0 ? n : null;
}

function findTeamRow(table, teamName) {
  return table.find(row =>
    sameTeam(row?.team, teamName) ||
    sameTeam(row?.teamName, teamName) ||
    sameTeam(row?.name, teamName)
  );
}

function classifySeasonPhase(matchesLeft) {
  const n = safeNum(matchesLeft, 0);
  if (n <= 6) return "late";
  if (n <= 12) return "mid";
  return "early";
}

function classifyGapTier(gap) {
  const n = safeNum(gap, null);
  if (n === null) return "unknown";
  if (n <= 3) return "tight";
  if (n <= 6) return "live";
  if (n <= 9) return "reachable";
  return "far";
}

function resolveStandingsMeta(standings) {
  const table = Array.isArray(standings?.table)
    ? standings.table
    : Array.isArray(standings?.standings)
      ? standings.standings
      : Array.isArray(standings?.rows)
        ? standings.rows
        : [];

  const totalTeams =
    safeNum(standings?.meta?.totalTeams, null) ||
    safeNum(standings?.totalTeams, null) ||
    table.length ||
    0;

  const matchesPlayedMax = table.reduce((acc, row) => {
    const played =
      safeNum(row?.played, null) ??
      safeNum(row?.games, null) ??
      safeNum(row?.matchesPlayed, null) ??
      0;

    return Math.max(acc, played);
  }, 0);

  const seasonMatches =
    safeNum(standings?.meta?.seasonMatches, null) ||
    safeNum(standings?.seasonMatches, null) ||
    (totalTeams > 0 ? (totalTeams - 1) * 2 : null);

  const matchesLeftEstimate =
    seasonMatches !== null
      ? Math.max(seasonMatches - matchesPlayedMax, 0)
      : null;

  return {
    table,
    totalTeams,
    matchesPlayedMax,
    matchesLeftEstimate
  };
}

function resolveCutoffMap(totalTeams) {
  const n = safeNum(totalTeams, 0);

  return {
    title: 1,
    europe: n >= 18 ? 4 : n >= 14 ? 3 : 2,
    playoff: n >= 20 ? 6 : n >= 16 ? 4 : null,
    relegationStart: n >= 20 ? n - 2 : n >= 16 ? n - 1 : n
  };
}

function sortTableByPoints(table) {
  return [...table].sort((a, b) => {
    const pa = safeNum(a?.points, 0);
    const pb = safeNum(b?.points, 0);

    if (pb !== pa) return pb - pa;

    const ga = safeNum(a?.goalDifference, 0) ?? safeNum(a?.gd, 0) ?? 0;
    const gb = safeNum(b?.goalDifference, 0) ?? safeNum(b?.gd, 0) ?? 0;

    return gb - ga;
  });
}

function computeGapToTopZone(row, sortedTable, zoneRank) {
  if (!row || !Array.isArray(sortedTable) || !zoneRank) return null;

  const targetRow = sortedTable[zoneRank - 1];
  if (!targetRow) return null;

  const points = safeNum(row?.points, 0);
  const targetPoints = safeNum(targetRow?.points, 0);

  return Math.max(targetPoints - points, 0);
}

function computeRelegationMargin(row, sortedTable, relegationStartRank) {
  if (!row || !Array.isArray(sortedTable) || !relegationStartRank) return null;

  const cutoffRow = sortedTable[relegationStartRank - 1];
  if (!cutoffRow) return null;

  const points = safeNum(row?.points, 0);
  const cutoffPoints = safeNum(cutoffRow?.points, 0);

  return Math.max(points - cutoffPoints, 0);
}

export function buildCompetitionContext(match) {
  const standingsFile = resolveDataPath("standings", `${match?.leagueSlug}.json`);
  const standings = readJsonSafe(standingsFile, null);

  const standingsConfidence = Number(standings?.confidence || 0);
  const MIN_STANDINGS_CONFIDENCE = 0.4;

  const meta = resolveStandingsMeta(standings);
  const table = meta.table;

  if (!standings || !table.length || standingsConfidence < MIN_STANDINGS_CONFIDENCE) {
    console.log("[competition-context] skipped", {
      league: match?.leagueSlug || null,
      reason: !standings
        ? "no_standings_file"
        : !table.length
          ? "empty_table"
          : "low_confidence_table",
      confidence: standingsConfidence,
      standingsFile
    });

    return {
      key: "competition_context",
      ok: true,
      status: "fallback",
      data: {
        type: "league",
        phase: "unknown",
        positions: null,
        stakes: [],
        pressure: ["low_confidence_table"],
        importance: "low",
        notes: ["Fallback: missing or low-confidence standings"]
      },
      confidence: 0.3
    };
  }

  const sortedTable = sortTableByPoints(table);
  const totalTeams = meta.totalTeams || sortedTable.length || 0;
  const matchesLeft = meta.matchesLeftEstimate;
  const phase = classifySeasonPhase(matchesLeft ?? 0);
  const cutoffs = resolveCutoffMap(totalTeams);

  const homeRow = findTeamRow(sortedTable, match?.homeTeam);
  const awayRow = findTeamRow(sortedTable, match?.awayTeam);

  if (!homeRow || !awayRow) {
    console.log("[competition-context] partial", {
      league: match?.leagueSlug || null,
      reason: "team_not_found_in_table",
      homeTeam: match?.homeTeam || null,
      awayTeam: match?.awayTeam || null,
      foundHome: !!homeRow,
      foundAway: !!awayRow
    });

    return {
      key: "competition_context",
      ok: true,
      status: "fallback",
      data: {
        type: "league",
        phase: "unknown",
        positions: null,
        stakes: [],
        pressure: ["unknown_table_context"],
        importance: "low",
        notes: ["Fallback: team not found in standings"]
      },
      confidence: 0.3
    };
  }

  const homePos = normalizePosition(homeRow?.position ?? homeRow?.rank) || (sortedTable.indexOf(homeRow) + 1);
  const awayPos = normalizePosition(awayRow?.position ?? awayRow?.rank) || (sortedTable.indexOf(awayRow) + 1);

  const homePts = safeNum(homeRow?.points, 0);
  const awayPts = safeNum(awayRow?.points, 0);

  const homeTitleGap = computeGapToTopZone(homeRow, sortedTable, cutoffs.title);
  const awayTitleGap = computeGapToTopZone(awayRow, sortedTable, cutoffs.title);

  const homeEuropeGap = computeGapToTopZone(homeRow, sortedTable, cutoffs.europe);
  const awayEuropeGap = computeGapToTopZone(awayRow, sortedTable, cutoffs.europe);

  const homePlayoffGap =
    cutoffs.playoff ? computeGapToTopZone(homeRow, sortedTable, cutoffs.playoff) : null;
  const awayPlayoffGap =
    cutoffs.playoff ? computeGapToTopZone(awayRow, sortedTable, cutoffs.playoff) : null;

  const homeRelegMargin = computeRelegationMargin(homeRow, sortedTable, cutoffs.relegationStart);
  const awayRelegMargin = computeRelegationMargin(awayRow, sortedTable, cutoffs.relegationStart);

  const homeTitleTier = classifyGapTier(homeTitleGap);
  const awayTitleTier = classifyGapTier(awayTitleGap);
  const homeEuropeTier = classifyGapTier(homeEuropeGap);
  const awayEuropeTier = classifyGapTier(awayEuropeGap);
  const homePlayoffTier = classifyGapTier(homePlayoffGap);
  const awayPlayoffTier = classifyGapTier(awayPlayoffGap);

  const stakes = [];
  const pressure = [];
  const notes = [];

  const homeVsAwayGap = Math.abs(homePts - awayPts);
  const directRival = homeVsAwayGap <= 3 && Math.abs(homePos - awayPos) <= 3;

  const latePhase = phase === "late";
  const midPhase = phase === "mid";

  if (latePhase && (homeTitleTier === "tight" || awayTitleTier === "tight")) {
    stakes.push("title_race");
    pressure.push("must_win");
    notes.push("Late-season title race pressure");
  }

  if (
    (latePhase || midPhase) &&
    (
      homeEuropeTier === "tight" ||
      homeEuropeTier === "live" ||
      awayEuropeTier === "tight" ||
      awayEuropeTier === "live"
    )
  ) {
    stakes.push("europe_race");
    pressure.push("protect_position");
  }

  if (
    cutoffs.playoff &&
    (
      homePlayoffTier === "tight" ||
      homePlayoffTier === "live" ||
      awayPlayoffTier === "tight" ||
      awayPlayoffTier === "live"
    )
  ) {
    stakes.push("playoff_race");
    pressure.push("chasing_cutoff");
  }

  if (
    latePhase &&
    (
      (homeRelegMargin !== null && homeRelegMargin <= 6) ||
      (awayRelegMargin !== null && awayRelegMargin <= 6)
    )
  ) {
    stakes.push("relegation_battle");
    pressure.push("must_win");
    notes.push("Relegation pressure near bottom zone");
  }

  if (
    latePhase &&
    (
      (homeRelegMargin !== null && homeRelegMargin <= 3) ||
      (awayRelegMargin !== null && awayRelegMargin <= 3)
    )
  ) {
    stakes.push("survival");
  }

  if (directRival && stakes.length) {
    stakes.push("direct_rival_match");
    pressure.push("cannot_lose");
  }

  const safeMidTable =
    !stakes.length &&
    homePos > cutoffs.europe &&
    awayPos > cutoffs.europe &&
    (homeRelegMargin === null || homeRelegMargin > 9) &&
    (awayRelegMargin === null || awayRelegMargin > 9);

  if (safeMidTable) {
    pressure.push("safe_table_state");
    notes.push("Mid-table low-pressure league game");
  }

  let importance = "low";

  if (
    stakes.includes("title_race") ||
    stakes.includes("relegation_battle") ||
    stakes.includes("survival") ||
    (stakes.includes("direct_rival_match") && latePhase)
  ) {
    importance = "high";
  } else if (
    stakes.includes("europe_race") ||
    stakes.includes("playoff_race") ||
    stakes.includes("direct_rival_match")
  ) {
    importance = "medium";
  }

  return {
    key: "competition_context",
    status: "ready",
    data: {
      type: "league",
      phase,
      positions: {
        home: homePos,
        away: awayPos,
        pointsHome: homePts,
        pointsAway: awayPts,
        matchesLeft,
        totalTeams
      },
      stakes: uniqueStrings(stakes),
      pressure: uniqueStrings(pressure),
      importance,
      notes: uniqueStrings(notes)
    },
    confidence: 0.86
  };
}