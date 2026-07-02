import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";
import { normalizeTeamTokens } from "./normalize.js";

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

function normalizedComparableName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function findTeamRow(table, leagueSlug, teamName) {
  const candidates = resolveAliasCandidates(leagueSlug, teamName);
  const normalizedCandidates = candidates
    .map(normalizedComparableName)
    .filter(Boolean);

  return table.find(row => {
    const rowNames = [row?.team, row?.teamName, row?.name].filter(Boolean);
    const normalizedRowNames = rowNames
      .map(normalizedComparableName)
      .filter(Boolean);

    const exactAliasMatch = normalizedCandidates.some(candidate =>
      normalizedRowNames.some(rowName => rowName === candidate)
    );

    if (exactAliasMatch) return true;

    const containsAliasMatch = normalizedCandidates.some(candidate =>
      normalizedRowNames.some(rowName =>
        rowName.includes(candidate) || candidate.includes(rowName)
      )
    );

    if (containsAliasMatch) return true;

    return candidates.some(candidate =>
      rowNames.some(rowName => sameTeam(rowName, candidate))
    );
  });
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
  const phaseSummary =
    standings?.phaseSummary ||
    standings?.meta?.phaseSummary ||
    null;

  const phaseTables =
    standings?.phaseTables && typeof standings.phaseTables === "object"
      ? standings.phaseTables
      : standings?.phases && typeof standings.phases === "object"
        ? standings.phases
        : null;

  const defaultTable = Array.isArray(standings?.table)
    ? standings.table
    : Array.isArray(standings?.standings)
      ? standings.standings
      : Array.isArray(standings?.rows)
        ? standings.rows
        : [];

  let activePhase = "regular";
  let table = defaultTable;

  if (phaseSummary?.hasPhaseTables && phaseTables) {
    const keys = Array.isArray(phaseSummary?.phaseKeys) ? phaseSummary.phaseKeys : Object.keys(phaseTables);

    if (keys.includes("playoff") && Array.isArray(phaseTables.playoff) && phaseTables.playoff.length) {
      activePhase = "playoff";
      table = phaseTables.playoff;
    } else if (keys.includes("playout") && Array.isArray(phaseTables.playout) && phaseTables.playout.length) {
      activePhase = "playout";
      table = phaseTables.playout;
    } else if (keys.includes("regular") && Array.isArray(phaseTables.regular) && phaseTables.regular.length) {
      activePhase = "regular";
      table = phaseTables.regular;
    } else {
      const firstUsableKey = keys.find(k => Array.isArray(phaseTables[k]) && phaseTables[k].length);
      if (firstUsableKey) {
        activePhase = firstUsableKey;
        table = phaseTables[firstUsableKey];
      }
    }
  }

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
    matchesLeftEstimate,
    activePhase,
    phaseSummary
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

// ── Cross-league / cup per-team domestic-standing fallback ──────────────────
// Cup and cross-league fixtures never sit in one shared table, so both teams
// fail the shared-table lookup and the match loses ALL standings context — even
// though each team HAS a position in its own domestic league. Rather than show
// nothing, look each team up in its OWN league table (global search across every
// standings file) and surface each side's position + motivation independently.

const IMPORTANCE_RANK = { low: 0, medium: 1, high: 2 };

function maxImportance(a, b) {
  return (IMPORTANCE_RANK[a] || 0) >= (IMPORTANCE_RANK[b] || 0) ? a : b;
}

// Per-slug standings cache keyed on file mtime (mirrors results-truth-overlay).
const __standingsCache = new Map(); // slug → { mtimeMs, parsed }
let __standingsSlugs = { ts: 0, slugs: [] };

function listStandingsSlugs() {
  const now = Date.now();
  if (__standingsSlugs.slugs.length && now - __standingsSlugs.ts < 5 * 60 * 1000) {
    return __standingsSlugs.slugs;
  }
  try {
    const dir = resolveDataPath("standings");
    const slugs = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(/\.json$/i, ""));
    __standingsSlugs = { ts: now, slugs };
  } catch {
    __standingsSlugs = { ts: now, slugs: [] };
  }
  return __standingsSlugs.slugs;
}

// Domestic league slugs look like "eng.1", "arg.2" (country code + division
// number). Cups and continental/international competitions ("eng.league_cup",
// "caf.champions", "conmebol.libertadores") are named — exclude them from the
// per-team DOMESTIC search: we want each side's LEAGUE position, and cup tables
// otherwise collide (an "Arsenal" row in both eng.1 and eng.league_cup).
function isDomesticLeagueSlug(slug) {
  return /^[a-z]{2,4}\.\d+$/.test(String(slug || ""));
}

function loadStandingsForSlug(slug) {
  const file = resolveDataPath("standings", `${slug}.json`);
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }

  const cached = __standingsCache.get(slug);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.parsed;

  const parsed = readJsonSafe(file, null);
  __standingsCache.set(slug, { mtimeMs: stat.mtimeMs, parsed });
  return parsed;
}

// Analyse ONE team's standing within its own league table: position, points and
// the stake/importance its table position implies (title / europe / promotion /
// relegation / neutral). Standalone so it never disturbs the shared-table path.
function analyzeTeamPosition(row, sortedTable, meta) {
  const totalTeams = meta.totalTeams || sortedTable.length || 0;
  const cutoffs = resolveCutoffMap(totalTeams);
  const matchesLeft = meta.matchesLeftEstimate;
  const seasonPhase = classifySeasonPhase(matchesLeft ?? 0);
  const late = seasonPhase === "late";
  const mid = seasonPhase === "mid";

  const position = normalizePosition(row?.position ?? row?.rank) || (sortedTable.indexOf(row) + 1);
  const points = safeNum(row?.points, 0);

  const titleTier = classifyGapTier(computeGapToTopZone(row, sortedTable, cutoffs.title));
  const europeTier = classifyGapTier(computeGapToTopZone(row, sortedTable, cutoffs.europe));
  const playoffTier = cutoffs.playoff
    ? classifyGapTier(computeGapToTopZone(row, sortedTable, cutoffs.playoff))
    : "unknown";
  const relegMargin = computeRelegationMargin(row, sortedTable, cutoffs.relegationStart);

  let stake = "neutral";
  let importance = "low";

  if ((late || mid) && titleTier === "tight") {
    stake = "title"; importance = late ? "high" : "medium";
  } else if ((late || mid) && (europeTier === "tight" || europeTier === "live")) {
    stake = "europe"; importance = "medium";
  } else if (cutoffs.playoff && (playoffTier === "tight" || playoffTier === "live")) {
    stake = "promotion"; importance = "medium";
  } else if (relegMargin !== null && relegMargin <= 6) {
    stake = "relegation"; importance = late ? "high" : "medium";
  }

  return { position, points, totalTeams, matchesLeft, seasonPhase, stake, importance };
}

// Best-scoring row for a team in one table, with a match-quality tier so a common
// short name (e.g. "Arsenal") prefers its EXACT table entry over a loose contains
// match elsewhere ("Arsenal Sarandí"). 3 = exact canonical/alias, 2 = substring,
// 1 = controlled token overlap, 0 = no match.
function scoreTeamRow(table, slug, teamName) {
  const candidates = resolveAliasCandidates(slug, teamName);
  const normCands = candidates.map(normalizedComparableName).filter(Boolean);

  let best = { row: null, score: 0 };
  for (const row of table) {
    const rowNames = [row?.team, row?.teamName, row?.name].filter(Boolean);
    const normRows = rowNames.map(normalizedComparableName).filter(Boolean);

    let score = 0;
    if (normCands.some(c => normRows.some(r => r === c))) {
      score = 3;
    } else if (normCands.some(c => normRows.some(r => r.includes(c) || c.includes(r)))) {
      score = 2;
    } else if (candidates.some(c => rowNames.some(r => sameTeam(r, c)))) {
      score = 1;
    }

    if (score > best.score) best = { row, score };
  }
  return best;
}

// Find a team's row in ANY league table (excluding the match's own competition
// slug, which is the cup/cross-league one that failed). Ranks every league's best
// match by quality and takes the top — but only if it is STRICTLY better than the
// runner-up. A tie at the top tier is genuine ambiguity, so we skip it (a wrong
// position is worse than none).
function findTeamDomesticStanding(teamName, excludeSlug) {
  const hits = [];
  for (const slug of listStandingsSlugs()) {
    if (slug === excludeSlug) continue;
    if (!isDomesticLeagueSlug(slug)) continue;

    const standings = loadStandingsForSlug(slug);
    if (!standings) continue;
    if (Number(standings?.confidence || 0) < 0.25) continue;

    const meta = resolveStandingsMeta(standings);
    if (!meta.table.length) continue;

    const sortedTable = sortTableByPoints(meta.table);
    const best = scoreTeamRow(sortedTable, slug, teamName);
    if (best.score > 0) hits.push({ slug, row: best.row, sortedTable, meta, score: best.score });
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  if (hits.length > 1 && hits[1].score === hits[0].score) return null; // top-tier tie → ambiguous
  return hits[0];
}

// Build a cross-league context from each team's own domestic standing. Returns
// null unless BOTH teams are uniquely located (partial → keep the plain
// fallback, so we never show one side's motivation as if it were the match's).
function buildCrossLeagueContext(match) {
  const excludeSlug = match?.leagueSlug || null;
  const home = findTeamDomesticStanding(match?.homeTeam, excludeSlug);
  const away = findTeamDomesticStanding(match?.awayTeam, excludeSlug);
  if (!home || !away) return null;

  const h = analyzeTeamPosition(home.row, home.sortedTable, home.meta);
  const a = analyzeTeamPosition(away.row, away.sortedTable, away.meta);

  const importance = maxImportance(h.importance, a.importance);
  const stakeTags = uniqueStrings([
    h.stake !== "neutral" ? h.stake : null,
    a.stake !== "neutral" ? a.stake : null
  ]);

  return {
    key: "competition_context",
    status: "ready",
    data: {
      type: "cross_league",
      phase: "cross_league",
      positions: {
        home: h.position,
        away: a.position,
        pointsHome: h.points,
        pointsAway: a.points,
        matchesLeft: null,
        totalTeams: null,
        homeLeague: home.slug,
        awayLeague: away.slug,
        homeTotalTeams: h.totalTeams,
        awayTotalTeams: a.totalTeams
      },
      perTeam: {
        home: { league: home.slug, position: h.position, points: h.points, totalTeams: h.totalTeams, stake: h.stake, seasonPhase: h.seasonPhase },
        away: { league: away.slug, position: a.position, points: a.points, totalTeams: a.totalTeams, stake: a.stake, seasonPhase: a.seasonPhase }
      },
      stakes: { home: h.stake, away: a.stake, tags: stakeTags },
      pressure: [],
      importance,
      notes: ["Cross-competition fixture: each team shown in its own domestic league table"]
    },
    confidence: 0.55
  };
}

export function buildCompetitionContext(match) {
  const standingsFile = resolveDataPath("standings", `${match?.leagueSlug}.json`);
  const standings = readJsonSafe(standingsFile, null);

  const standingsConfidence = Number(standings?.confidence || 0);
  const MIN_STANDINGS_CONFIDENCE = 0.25;

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

    // Cup / cross-league fixture with no usable shared table: try to surface each
    // team's position + motivation from its OWN domestic league before giving up.
    const crossLeague = buildCrossLeagueContext(match);
    if (crossLeague) return crossLeague;

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
  const seasonPhase = classifySeasonPhase(matchesLeft ?? 0);
  const competitionPhase = meta.activePhase || "regular";
  const cutoffs = resolveCutoffMap(totalTeams);

  const homeRow = findTeamRow(sortedTable, match?.leagueSlug, match?.homeTeam);
  const awayRow = findTeamRow(sortedTable, match?.leagueSlug, match?.awayTeam);

  if (!homeRow || !awayRow) {
    const mismatchReason =
      homeRow || awayRow
        ? "possible_cross_competition_mismatch"
        : "team_not_found_in_table";

    console.log("[competition-context] partial", {
      league: match?.leagueSlug || null,
      reason: mismatchReason,
      homeTeam: match?.homeTeam || null,
      awayTeam: match?.awayTeam || null,
      foundHome: !!homeRow,
      foundAway: !!awayRow
    });

    // One/both teams absent from THIS competition's table (classic cross-league
    // pairing): surface each side from its own domestic league if we can.
    const crossLeague = buildCrossLeagueContext(match);
    if (crossLeague) return crossLeague;

    return {
      key: "competition_context",
      ok: true,
      status: "fallback",
      data: {
        type: "league",
        phase: "unknown",
        positions: null,
        stakes: [],
        pressure: uniqueStrings([
          homeRow || awayRow
            ? "possible_cross_competition_mismatch"
            : "unknown_table_context"
        ]),
        importance: "low",
        notes: uniqueStrings([
          homeRow || awayRow
            ? "Fallback: possible cross-competition mismatch"
            : "Fallback: team not found in standings"
        ]),
        diagnostics: {
          reason: mismatchReason,
          leagueSlug: match?.leagueSlug || null,
          homeTeam: match?.homeTeam || null,
          awayTeam: match?.awayTeam || null,
          foundHome: !!homeRow,
          foundAway: !!awayRow
        }
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

  const latePhase = seasonPhase === "late";
  const midPhase = seasonPhase === "mid";

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

  const resolvedConfidence = Math.max(
    0.55,
    Math.min(0.86, Number((0.45 + standingsConfidence).toFixed(2)))
  );

  return {
    key: "competition_context",
    status: "ready",
    data: {
      type: "league",
      phase: competitionPhase,
      seasonPhase,
      phaseSummary: meta.phaseSummary || null,
      activePhase: competitionPhase,
      positions: {
        home: homePos,
        away: awayPos,
        pointsHome: homePts,
        pointsAway: awayPts,
        matchesLeft,
        totalTeams
      },
      stakes: {
        home:
          homeTitleTier === "tight" ? "title" :
          homeEuropeTier === "tight" || homeEuropeTier === "live" ? "europe" :
          homePlayoffTier === "tight" || homePlayoffTier === "live" ? "promotion" :
          homeRelegMargin !== null && homeRelegMargin <= 6 ? "relegation" :
          "neutral",
        away:
          awayTitleTier === "tight" ? "title" :
          awayEuropeTier === "tight" || awayEuropeTier === "live" ? "europe" :
          awayPlayoffTier === "tight" || awayPlayoffTier === "live" ? "promotion" :
          awayRelegMargin !== null && awayRelegMargin <= 6 ? "relegation" :
          "neutral",
        tags: uniqueStrings(stakes)
      },
      pressure: uniqueStrings(pressure),
      importance,
      notes: uniqueStrings(notes)
    },
    confidence: resolvedConfidence
  };
}