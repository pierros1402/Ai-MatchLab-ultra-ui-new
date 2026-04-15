import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesLikelyMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (!na || !nb) return false;
  if (na === nb) return true;

  if (na.includes(nb) || nb.includes(na)) return true;

  const aTokens = new Set(na.split(" ").filter(Boolean));
  const bTokens = new Set(nb.split(" ").filter(Boolean));

  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++;
  }

  return overlap >= Math.min(2, Math.min(aTokens.size, bTokens.size));
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getAllFixturesLocal() {
  const filePath = resolveDataPath("fixtures.json");
  return safeArray(readJsonSafe(filePath, []));
}

function getStandingsMap() {
  const dirPath = resolveDataPath("standings");
  const byLeague = new Map();

  try {
    if (!fs.existsSync(dirPath)) return byLeague;

    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const slug = file.replace(".json", "");
      const filePath = path.join(dirPath, file);

      const data = readJsonSafe(filePath, null);
      if (!data) continue;

      byLeague.set(slug, data);
    }
  } catch {
    return byLeague;
  }

  return byLeague;
}

function getHistorySeason(season = "2025-2026") {
  const filePath = resolveDataPath(path.join("history", `${season}.json`));
  const raw = readJsonSafe(filePath, null);

  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw;
  }

  if (raw.days && typeof raw.days === "object") {
    const rows = [];

    for (const dayKey of Object.keys(raw.days)) {
      const bucket = raw.days[dayKey];
      if (Array.isArray(bucket?.rows)) {
        rows.push(...bucket.rows);
      }
    }

    return rows;
  }

  return [];
}

function getRecentTeamMatches(historyRows, teamName, limit = 5, excludeMatchId = null) {
  const matches = historyRows
    .filter(row => {
      if (excludeMatchId && String(row?.id || row?.matchId) === String(excludeMatchId)) {
        return false;
      }

      if (String(row?.status || "").toUpperCase() !== "FT") return false;

      return (
        namesLikelyMatch(row?.homeTeam, teamName) ||
        namesLikelyMatch(row?.awayTeam, teamName)
      );
    })
    .sort((a, b) => new Date(b?.kickoff || b?.kickoffUtc || 0) - new Date(a?.kickoff || a?.kickoffUtc || 0))
    .slice(0, limit);

  if (matches.length > 0) {
    return matches;
  }

  const fixtures = getAllFixturesLocal();

  return fixtures
    .filter(row => {
      if (excludeMatchId && String(row?.id || row?.matchId) === String(excludeMatchId)) {
        return false;
      }

      if (String(row?.status || "").toUpperCase() !== "FT") return false;

      return (
        namesLikelyMatch(row?.homeTeam, teamName) ||
        namesLikelyMatch(row?.awayTeam, teamName)
      );
    })
    .sort((a, b) => new Date(b?.kickoff || b?.kickoffUtc || 0) - new Date(a?.kickoff || a?.kickoffUtc || 0))
    .slice(0, limit);
}

function summarizeTeamForm(matches, teamName) {
  const teamKey = normalizeName(teamName);

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const row of matches) {
    const homeKey = normalizeName(row?.homeTeam);
    const awayKey = normalizeName(row?.awayTeam);

    const isHome = homeKey === teamKey;
    const gf = isHome ? safeNum(row?.scoreHome) : safeNum(row?.scoreAway);
    const ga = isHome ? safeNum(row?.scoreAway) : safeNum(row?.scoreHome);

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  }

  return {
    matches: matches.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst
  };
}

function getH2H(historyRows, homeTeam, awayTeam, limit = 5, excludeMatchId = null) {
  const fromHistory = historyRows
    .filter(row => {
      if (excludeMatchId && String(row?.id || row?.matchId) === String(excludeMatchId)) {
        return false;
      }

      if (String(row?.status || "").toUpperCase() !== "FT") return false;

      return (
        (
          namesLikelyMatch(row?.homeTeam, homeTeam) &&
          namesLikelyMatch(row?.awayTeam, awayTeam)
        ) ||
        (
          namesLikelyMatch(row?.homeTeam, awayTeam) &&
          namesLikelyMatch(row?.awayTeam, homeTeam)
        )
      );
    })
    .sort((a, b) => new Date(b?.kickoff || b?.kickoffUtc || 0) - new Date(a?.kickoff || a?.kickoffUtc || 0))
    .slice(0, limit);

  if (fromHistory.length > 0) {
    return fromHistory;
  }

  const fixtures = getAllFixturesLocal();

  return fixtures
    .filter(row => {
      if (excludeMatchId && String(row?.id || row?.matchId) === String(excludeMatchId)) {
        return false;
      }

      if (String(row?.status || "").toUpperCase() !== "FT") return false;

      return (
        (
          namesLikelyMatch(row?.homeTeam, homeTeam) &&
          namesLikelyMatch(row?.awayTeam, awayTeam)
        ) ||
        (
          namesLikelyMatch(row?.homeTeam, awayTeam) &&
          namesLikelyMatch(row?.awayTeam, homeTeam)
        )
      );
    })
    .sort((a, b) => new Date(b?.kickoff || b?.kickoffUtc || 0) - new Date(a?.kickoff || a?.kickoffUtc || 0))
    .slice(0, limit);
}

function getPhaseSummary(standingsState) {
  const phases = standingsState?.phases && typeof standingsState.phases === "object"
    ? standingsState.phases
    : {};

  const keys = Object.keys(phases);

  return {
    hasPhaseTables: keys.length > 0,
    phaseKeys: keys,
    hasRegular: Array.isArray(phases.regular) && phases.regular.length > 0,
    hasPlayoff: Array.isArray(phases.playoff) && phases.playoff.length > 0,
    hasPlayout: Array.isArray(phases.playout) && phases.playout.length > 0,
    hasBarrage: Array.isArray(phases.barrage) && phases.barrage.length > 0
  };
}

function buildMotivationSignal(standingsTable, homeTeam, awayTeam) {
  const table = safeArray(standingsTable?.table);

  const home = table.find(r => normalizeName(r?.teamName || r?.team) === normalizeName(homeTeam));
  const away = table.find(r => normalizeName(r?.teamName || r?.team) === normalizeName(awayTeam));

  if (!home && !away) {
    return {
      summary: "no_standings_context",
      homePressure: 0,
      awayPressure: 0
    };
  }

  function pressure(row, tableSize) {
    if (!row) return 0.3;

    const pos = safeNum(row.position || row.rank, tableSize);
    if (pos <= 3) return 0.8;
    if (pos <= 6) return 0.65;
    if (pos >= tableSize - 2) return 0.9;
    if (pos >= tableSize - 5) return 0.75;
    return 0.4;
  }

  const tableSize = table.length || 20;

  return {
    summary: "standings_pressure_estimated",
    homePressure: pressure(home, tableSize),
    awayPressure: pressure(away, tableSize),
    homePosition: home?.position ?? home?.rank ?? null,
    awayPosition: away?.position ?? away?.rank ?? null
  };
}

function buildMatchSignals({
  homeForm,
  awayForm,
  h2h,
  motivation
}) {
  const signals = [];

  const homePoints = homeForm.wins * 3 + homeForm.draws;
  const awayPoints = awayForm.wins * 3 + awayForm.draws;

  if (homePoints >= awayPoints + 4) {
    signals.push("home_form_edge");
  } else if (awayPoints >= homePoints + 4) {
    signals.push("away_form_edge");
  } else {
    signals.push("form_balanced");
  }

  if ((homeForm.goalsFor + awayForm.goalsFor) >= 10) {
    signals.push("attack_support");
  }

  if ((homeForm.goalsAgainst + awayForm.goalsAgainst) <= 6) {
    signals.push("defensive_resilience");
  }

  if (safeArray(h2h).length >= 3) {
    signals.push("h2h_sample_present");
  }

  if ((motivation.homePressure || 0) >= 0.75 || (motivation.awayPressure || 0) >= 0.75) {
    signals.push("motivation_pressure_high");
  }

  return signals;
}

function buildFinalAssessment({
  fixture,
  homeForm,
  awayForm,
  signals,
  motivation
}) {
  let homeLean = 0;
  let awayLean = 0;
  let drawLean = 0;

  const homePoints = homeForm.wins * 3 + homeForm.draws;
  const awayPoints = awayForm.wins * 3 + awayForm.draws;

  homeLean += homePoints;
  awayLean += awayPoints;

  homeLean += (motivation.homePressure || 0) * 2;
  awayLean += (motivation.awayPressure || 0) * 2;

  if (signals.includes("form_balanced")) drawLean += 2;
  if (signals.includes("defensive_resilience")) drawLean += 1;
  if (signals.includes("home_form_edge")) homeLean += 2;
  if (signals.includes("away_form_edge")) awayLean += 2;

  const maxLean = Math.max(homeLean, awayLean, drawLean);

  let lean = "draw";
  if (maxLean === homeLean) lean = "home";
  else if (maxLean === awayLean) lean = "away";

  const confidence = Math.min(
    0.92,
    0.45 + Math.abs(homeLean - awayLean) * 0.04 + signals.length * 0.02
  );

  return {
    lean,
    confidence: Number(confidence.toFixed(3)),
    homeLean: Number(homeLean.toFixed(2)),
    awayLean: Number(awayLean.toFixed(2)),
    drawLean: Number(drawLean.toFixed(2))
  };
}

export async function buildMatchIntelligence(fixture, { season = "2025-2026" } = {}) {
  if (!fixture?.matchId || !fixture?.leagueSlug) {
    return {
      ok: false,
      error: "invalid_fixture"
    };
  }

  const standingsByLeague = getStandingsMap();
  const historyRows = getHistorySeason(season);

  const leagueStandings = standingsByLeague.get(fixture.leagueSlug) || null;
  const phaseSummary = getPhaseSummary(leagueStandings);

  const homeRecent = getRecentTeamMatches(historyRows, fixture.homeTeam, 5, fixture.matchId);
  const awayRecent = getRecentTeamMatches(historyRows, fixture.awayTeam, 5, fixture.matchId);
  const h2h = getH2H(historyRows, fixture.homeTeam, fixture.awayTeam, 5, fixture.matchId);

  const homeForm = summarizeTeamForm(homeRecent, fixture.homeTeam);
  const awayForm = summarizeTeamForm(awayRecent, fixture.awayTeam);

  const motivation = buildMotivationSignal(
    leagueStandings,
    fixture.homeTeam,
    fixture.awayTeam
  );

  const signals = buildMatchSignals({
    homeForm,
    awayForm,
    h2h,
    motivation
  });

  const finalAssessment = buildFinalAssessment({
    fixture,
    homeForm,
    awayForm,
    signals,
    motivation
  });

  const coverage = {
    hasStandings: motivation?.summary !== "no_standings_context",
    hasHomeForm: safeNum(homeForm?.matches, 0) > 0,
    hasAwayForm: safeNum(awayForm?.matches, 0) > 0,
    hasH2H: safeNum(h2h?.length, 0) > 0,
    hasPhaseContext: !!phaseSummary?.hasPhaseTables
  };

  const coverageCount =
    Number(coverage.hasStandings) +
    Number(coverage.hasHomeForm) +
    Number(coverage.hasAwayForm) +
    Number(coverage.hasH2H) +
    Number(coverage.hasPhaseContext);

  let coverageMode = "fallback";
  if (coverageCount >= 4) {
    coverageMode = "full";
  } else if (coverageCount >= 2) {
    coverageMode = "partial";
  }

  return {
    ok: true,
    matchId: fixture.matchId,
    leagueSlug: fixture.leagueSlug,
    dayKey: fixture.dayKey,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,

    competitionContext: {
      leagueSlug: fixture.leagueSlug,
      leagueName: fixture.leagueName || null,
      phaseSummary
    },

    coverage: {
      ...coverage,
      coverageCount,
      mode: coverageMode
    },

    standingsContext: motivation,

    formGuide: {
      home: homeForm,
      away: awayForm
    },

    h2h: {
      count: h2h.length,
      matches: h2h
    },

    signals,

    finalAssessment: {
      ...finalAssessment,
      intelligenceMode: coverageMode
    },

    generatedAt: Date.now()
  };
}
