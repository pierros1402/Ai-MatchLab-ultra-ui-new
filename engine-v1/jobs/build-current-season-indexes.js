import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentSeason } from "../core/season.js";
import { isCalendarYearLeague } from "../core/season-model.js";
import { canonicalTeamName } from "../storage/team-aliases-db.js";
import { LEAGUE_NAME_MAP } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_ROOT = path.resolve(__dirname, "..", "..", "data");

export function resolveTargetDateFromDay(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(dayKey || "")
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

const TARGET_DAY =
  process.argv[3] ||
  null;

const TARGET_DATE =
  resolveTargetDateFromDay(TARGET_DAY) ||
  new Date();

const SEASON =
  process.argv[2] ||
  currentSeason(TARGET_DATE);

export function resolveGlobalSeasonBounds(
  seasonLabel
) {
  const match = /^(\d{4})-(\d{4})$/.exec(
    String(seasonLabel || "")
  );

  if (!match) return null;

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);

  if (endYear !== startYear + 1) {
    return null;
  }

  return {
    startYear,
    endYear,
    startDay:
      `${startYear}-08-01`,
    endDay:
      `${endYear}-07-31`
  };
}

export function archiveLabelsForGlobalSeason(
  slug,
  seasonLabel
) {
  const bounds =
    resolveGlobalSeasonBounds(
      seasonLabel
    );

  if (!bounds) return [];

  if (isCalendarYearLeague(slug)) {
    return [
      String(bounds.startYear),
      String(bounds.endYear)
    ];
  }

  return [seasonLabel];
}

export function isTerminalHistoryRow(row) {
  const status = String(
    row?.status || ""
  ).toUpperCase();

  const rawStatus = String(
    row?.rawStatus || ""
  ).toUpperCase();

  const operationalState = String(
    row?.operationalState || ""
  ).toUpperCase();

  if (Number(row?.finalized) === 1) {
    return true;
  }

  if (
    String(row?.state || "")
      .toLowerCase() === "final"
  ) {
    return true;
  }

  if (row?.isDisplayFinal === true) {
    return true;
  }

  if (
    status === "FT" ||
    status === "AET" ||
    status === "PEN" ||
    status === "POST" ||
    status === "FINAL" ||
    status.includes(
      "STATUS_FULL_TIME"
    ) ||
    status.includes(
      "STATUS_FINAL"
    ) ||
    status.includes(
      "STATUS_AET"
    ) ||
    status.includes(
      "STATUS_PEN"
    )
  ) {
    return true;
  }

  if (
    rawStatus.includes(
      "STATUS_FULL_TIME"
    ) ||
    rawStatus.includes(
      "STATUS_FINAL"
    ) ||
    rawStatus.includes(
      "STATUS_AET"
    ) ||
    rawStatus.includes(
      "STATUS_PEN"
    )
  ) {
    return true;
  }

  return (
    operationalState ===
      "TERMINAL_CONFIRMED" ||
    operationalState ===
      "TERMINAL"
  );
}

// Primary source: the per-league, per-season, Flashscore-canonical archive that
// build-history-archive-from-results.js rebuilds every run-day from results-memory.
// It is complete and season-aware per league (calendar-year leagues get "YYYY",
// cross-year leagues "YYYY-YYYY"), unlike the consolidated ESPN history which is
// universal Aug→Jul and coverage-thin. The consolidated file survives only as a
// fallback for leagues that have no archive yet, so coverage never regresses.
const ARCHIVE_DIR = path.join(DATA_ROOT, "history-archive");
const HISTORY_FILE = path.join(DATA_ROOT, "history", `${SEASON}.json`);
const OUT_DIR = path.join(DATA_ROOT, "history-index");

const TEAM_OUT = path.join(OUT_DIR, "team-form", `${SEASON}.json`);
const LEAGUE_OUT = path.join(OUT_DIR, "league-form", `${SEASON}.json`);
const MATCHUP_OUT = path.join(OUT_DIR, "matchups", `${SEASON}.json`);

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

function sortByKickoff(a, b) {
  return safeNum(a.kickoff_ms) - safeNum(b.kickoff_ms);
}

function lastN(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

function computeStats(matches) {
  let gf = 0;
  let ga = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const m of matches) {
    const isHome = !!m.isHome;
    const gs = isHome ? safeNum(m.scoreHome) : safeNum(m.scoreAway);
    const gc = isHome ? safeNum(m.scoreAway) : safeNum(m.scoreHome);

    gf += gs;
    ga += gc;

    if (gs > gc) wins += 1;
    else if (gs < gc) losses += 1;
    else draws += 1;
  }

  const played = matches.length;
  const points = wins * 3 + draws;

  return {
    played,
    gf,
    ga,
    wins,
    draws,
    losses,
    points,
    ppg: played ? points / played : 0
  };
}

function buildTeamIndex(allMatches) {
  const teams = {};

  for (const m of allMatches) {
    const base = {
      id: m.id,
      dayKey: m.dayKey,
      kickoff: m.kickoff,
      kickoff_ms: m.kickoff_ms,
      leagueSlug: m.leagueSlug,
      leagueName: m.leagueName,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      scoreHome: safeNum(m.scoreHome),
      scoreAway: safeNum(m.scoreAway),
      status: m.status,
      outcome: m.outcome
    };

    if (!teams[m.homeTeam]) teams[m.homeTeam] = [];
    teams[m.homeTeam].push({
      ...base,
      team: m.homeTeam,
      opponent: m.awayTeam,
      isHome: true
    });

    if (!teams[m.awayTeam]) teams[m.awayTeam] = [];
    teams[m.awayTeam].push({
      ...base,
      team: m.awayTeam,
      opponent: m.homeTeam,
      isHome: false
    });
  }

  const result = {};

  for (const [team, matches] of Object.entries(teams)) {
    matches.sort(sortByKickoff);

    const homeMatches = matches.filter(m => m.isHome);
    const awayMatches = matches.filter(m => !m.isHome);

    result[team] = {
      team,
      total: computeStats(matches),
      last5: computeStats(lastN(matches, 5)),
      last10: computeStats(lastN(matches, 10)),
      homeLast5: computeStats(lastN(homeMatches, 5)),
      awayLast5: computeStats(lastN(awayMatches, 5)),
      matches
    };
  }

  return result;
}

function buildLeagueIndex(allMatches) {
  const leagues = {};

  for (const m of allMatches) {
    if (!leagues[m.leagueSlug]) {
      leagues[m.leagueSlug] = {
        leagueSlug: m.leagueSlug,
        leagueName: m.leagueName || m.leagueSlug,
        matches: []
      };
    }
    leagues[m.leagueSlug].matches.push(m);
  }

  const result = {};

  for (const [slug, data] of Object.entries(leagues)) {
    let totalGoals = 0;
    let draws = 0;
    let btts = 0;
    let over25 = 0;

    for (const m of data.matches) {
      const h = safeNum(m.scoreHome);
      const a = safeNum(m.scoreAway);
      const goals = h + a;

      totalGoals += goals;
      if (h === a) draws += 1;
      if (h > 0 && a > 0) btts += 1;
      if (goals > 2.5) over25 += 1;
    }

    const count = data.matches.length;

    result[slug] = {
      leagueSlug: slug,
      leagueName: data.leagueName,
      matches: count,
      avgGoals: count ? totalGoals / count : 0,
      drawRate: count ? draws / count : 0,
      bttsRate: count ? btts / count : 0,
      over25Rate: count ? over25 / count : 0
    };
  }

  return result;
}

function buildMatchupIndex(allMatches) {
  const map = {};

  function key(a, b) {
    return [String(a), String(b)].sort().join("::");
  }

  for (const m of allMatches) {
    const k = key(m.homeTeam, m.awayTeam);

    if (!map[k]) {
      map[k] = {
        teams: [m.homeTeam, m.awayTeam].sort(),
        matches: []
      };
    }

    map[k].matches.push(m);
  }

  const result = {};

  for (const [k, data] of Object.entries(map)) {
    const matches = data.matches.sort(sortByKickoff);
    const last = matches[matches.length - 1] || null;

    result[k] = {
      teams: data.teams,
      totalMatches: matches.length,
      lastMatch: last,
      matches
    };
  }

  return result;
}

/**
 * Reconcile a match's team names to their canonical identity via the alias
 * tables. Archive rows are already Flashscore-canonical so this is a no-op for
 * them, but the ESPN fallback rows ("Dinamo Minsk", "Gomel") must be bridged to
 * the canonical spelling the details form/H2H blocks look up with ("Din. Minsk",
 * "FC Gomel") — otherwise a club's games split across two spellings and a lookup
 * by the fixture name resolves only a fraction (blr.1 "Din. Minsk" last5 was 1
 * of ~10). The alias tables already list the ESPN spelling as a variant.
 */
function canonicalizeTeams(m) {
  const slug = m?.leagueSlug;
  const home = (slug && canonicalTeamName(slug, m.homeTeam)) || m.homeTeam;
  const away = (slug && canonicalTeamName(slug, m.awayTeam)) || m.awayTeam;
  if (home === m.homeTeam && away === m.awayTeam) return m;
  return { ...m, homeTeam: home, awayTeam: away };
}

async function listArchiveLeagues() {
  try {
    const entries = await fs.readdir(ARCHIVE_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

function rowDayKey(row) {
  const direct = String(
    row?.dayKey ||
    row?.day ||
    row?.date ||
    ""
  );

  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct;
  }

  const timestamp = Date.parse(
    row?.kickoff ||
    row?.kickoffUtc ||
    ""
  );

  return Number.isFinite(timestamp)
    ? new Date(timestamp)
        .toISOString()
        .slice(0, 10)
    : null;
}

export function rowHasFiniteScore(row) {
  const rawHome =
    row?.scoreHome;

  const rawAway =
    row?.scoreAway;

  if (
    rawHome === null ||
    rawHome === undefined ||
    rawAway === null ||
    rawAway === undefined
  ) {
    return false;
  }

  if (
    String(rawHome).trim() === "" ||
    String(rawAway).trim() === ""
  ) {
    return false;
  }

  const scoreHome =
    Number(rawHome);

  const scoreAway =
    Number(rawAway);

  return (
    Number.isInteger(scoreHome) &&
    Number.isInteger(scoreAway) &&
    scoreHome >= 0 &&
    scoreAway >= 0
  );
}

function rowIsInsideGlobalSeason(
  row,
  bounds
) {
  const dayKey = rowDayKey(row);

  return Boolean(
    dayKey &&
    bounds &&
    dayKey >= bounds.startDay &&
    dayKey <= bounds.endDay
  );
}

function archiveRowKey(row) {
  const id = String(
    row?.id ||
    row?.matchId ||
    ""
  ).trim();

  if (id) {
    return `id:${id}`;
  }

  return [
    row?.leagueSlug || "",
    rowDayKey(row) || "",
    row?.homeTeam || "",
    row?.awayTeam || ""
  ].join("|");
}

function normalizedIdentityText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function rowFixtureIdentityKey(row) {
  return [
    normalizedIdentityText(
      row?.leagueSlug
    ),
    rowDayKey(row) || "",
    normalizedIdentityText(
      row?.homeTeam
    ),
    normalizedIdentityText(
      row?.awayTeam
    )
  ].join("|");
}

export function rowSemanticIdentityKey(row) {
  return [
    rowFixtureIdentityKey(row),
    Number(row?.scoreHome),
    Number(row?.scoreAway)
  ].join("|");
}

function rowStableId(row) {
  return String(
    row?.id ||
    row?.matchId ||
    ""
  ).trim();
}

function absoluteDayDifference(
  leftDay,
  rightDay
) {
  if (!leftDay || !rightDay) {
    return null;
  }

  const leftMs = Date.parse(
    `${leftDay}T00:00:00Z`
  );

  const rightMs = Date.parse(
    `${rightDay}T00:00:00Z`
  );

  if (
    !Number.isFinite(leftMs) ||
    !Number.isFinite(rightMs)
  ) {
    return null;
  }

  return Math.abs(
    Math.round(
      (rightMs - leftMs) /
      86400000
    )
  );
}

export function rowPairScoreIdentityKey(
  row
) {
  return [
    normalizedIdentityText(
      row?.leagueSlug
    ),
    normalizedIdentityText(
      row?.homeTeam
    ),
    normalizedIdentityText(
      row?.awayTeam
    ),
    Number(row?.scoreHome),
    Number(row?.scoreAway)
  ].join("|");
}

function addMapValue(
  map,
  key,
  value
) {
  if (!key) return;

  if (!map.has(key)) {
    map.set(key, []);
  }

  map.get(key).push(value);
}

export function mergeIdentityStableRows(
  historyRows,
  archiveRows
) {
  const selected = [];

  const selectedIds =
    new Set();

  const selectedSemanticKeys =
    new Set();

  const selectedFixtureScores =
    new Map();

  const historyByPairScore =
    new Map();

  const metrics = {
    historyInput:
      Array.isArray(historyRows)
        ? historyRows.length
        : 0,

    archiveInput:
      Array.isArray(archiveRows)
        ? archiveRows.length
        : 0,

    historyAccepted: 0,
    archiveAccepted: 0,

    duplicateIdRejected: 0,
    semanticDuplicateRejected: 0,
    adjacentDayHistoryDuplicateRejected: 0,
    scoreConflictRejected: 0,
    malformedRejected: 0
  };

  function tryAccept(
    row,
    source
  ) {
    if (
      !row ||
      !rowDayKey(row) ||
      !rowHasFiniteScore(row) ||
      !String(
        row?.leagueSlug || ""
      ).trim() ||
      !String(
        row?.homeTeam || ""
      ).trim() ||
      !String(
        row?.awayTeam || ""
      ).trim()
    ) {
      metrics.malformedRejected += 1;
      return false;
    }

    const id =
      rowStableId(row);

    const fixtureKey =
      rowFixtureIdentityKey(row);

    const semanticKey =
      rowSemanticIdentityKey(row);

    const pairScoreKey =
      rowPairScoreIdentityKey(row);

    const scoreKey = [
      Number(row.scoreHome),
      Number(row.scoreAway)
    ].join(":");

    if (
      id &&
      selectedIds.has(id)
    ) {
      metrics.duplicateIdRejected += 1;
      return false;
    }

    if (
      selectedSemanticKeys.has(
        semanticKey
      )
    ) {
      metrics.semanticDuplicateRejected += 1;
      return false;
    }

    if (source === "archive") {
      const historyCandidates =
        historyByPairScore.get(
          pairScoreKey
        ) || [];

      const adjacentHistoryMatch =
        historyCandidates.some(
          historyRow =>
            absoluteDayDifference(
              rowDayKey(historyRow),
              rowDayKey(row)
            ) <= 1
        );

      if (adjacentHistoryMatch) {
        metrics
          .adjacentDayHistoryDuplicateRejected += 1;

        return false;
      }
    }

    if (
      selectedFixtureScores.has(
        fixtureKey
      ) &&
      selectedFixtureScores.get(
        fixtureKey
      ) !== scoreKey
    ) {
      metrics.scoreConflictRejected += 1;
      return false;
    }

    selected.push(row);

    if (id) {
      selectedIds.add(id);
    }

    selectedSemanticKeys.add(
      semanticKey
    );

    selectedFixtureScores.set(
      fixtureKey,
      scoreKey
    );

    if (source === "history") {
      metrics.historyAccepted += 1;

      addMapValue(
        historyByPairScore,
        pairScoreKey,
        row
      );
    } else {
      metrics.archiveAccepted += 1;
    }

    return true;
  }

  for (
    const row of
    Array.isArray(historyRows)
      ? historyRows
      : []
  ) {
    tryAccept(
      row,
      "history"
    );
  }

  for (
    const row of
    Array.isArray(archiveRows)
      ? archiveRows
      : []
  ) {
    tryAccept(
      row,
      "archive"
    );
  }

  return {
    rows: selected,
    metrics
  };
}

// The consolidated history store is the identity-stable primary source.
// It is populated only from finalized canonical rows and preserves the match
// IDs already consumed by Value, form and H2H readers.
async function readGlobalHistoryPrimary(
  bounds
) {
  let history;

  try {
    history = JSON.parse(
      await fs.readFile(
        HISTORY_FILE,
        "utf8"
      )
    );
  } catch {
    return [];
  }

  if (!Array.isArray(history?.days)) {
    return [];
  }

  const byKey = new Map();

  for (const day of history.days) {
    if (!Array.isArray(day?.rows)) {
      continue;
    }

    for (const rawRow of day.rows) {
      const row = canonicalizeTeams(
        rawRow
      );

      if (
        !rowIsInsideGlobalSeason(
          row,
          bounds
        ) ||
        !rowHasFiniteScore(row)
      ) {
        continue;
      }

      const key = archiveRowKey(row);

      if (!byKey.has(key)) {
        byKey.set(key, row);
      }
    }
  }

  return [...byKey.values()];
}

// Archive data supplements only leagues absent from the consolidated history.
// Calendar-year leagues need both calendar files touched by one Aug-to-Jul
// global season. Non-terminal or scoreless archive rows are never admitted.
function currentMatchupIndexFile() {
  return path.join(
    path.dirname(ARCHIVE_DIR),
    "history-index",
    "matchups",
    `${SEASON}.json`
  );
}

async function readExistingMatchupRows() {
  let payload;

  try {
    payload = JSON.parse(
      await fs.readFile(
        currentMatchupIndexFile(),
        "utf8"
      )
    );
  } catch {
    return [];
  }

  const rows = [];

  for (
    const value of
    Object.values(payload || {})
  ) {
    if (
      !Array.isArray(value?.matches)
    ) {
      continue;
    }

    for (const row of value.matches) {
      rows.push(
        canonicalizeTeams(row)
      );
    }
  }

  return rows;
}

export function applyLegacyIdentityLineage(
  truthRows,
  legacyRows,
  bounds
) {
  const truth =
    Array.isArray(truthRows)
      ? truthRows
      : [];

  const legacy =
    Array.isArray(legacyRows)
      ? legacyRows
      : [];

  const truthById =
    new Map();

  const truthBySemantic =
    new Map();

  const truthByFixture =
    new Map();

  const truthByPairScore =
    new Map();

  for (
    let index = 0;
    index < truth.length;
    index += 1
  ) {
    const row = truth[index];

    addMapValue(
      truthById,
      rowStableId(row),
      index
    );

    addMapValue(
      truthBySemantic,
      rowSemanticIdentityKey(row),
      index
    );

    addMapValue(
      truthByFixture,
      rowFixtureIdentityKey(row),
      index
    );

    addMapValue(
      truthByPairScore,
      rowPairScoreIdentityKey(row),
      index
    );
  }

  const legacyLineageByTruthIndex =
    new Map();

  const strategies =
    new Map();

  function sortedUniqueIds(values) {
    return [
      ...new Set(
        (
          Array.isArray(values)
            ? values
            : []
        )
          .map(value =>
            String(value || "").trim()
          )
          .filter(Boolean)
      )
    ].sort(
      (left, right) =>
        left.localeCompare(right)
    );
  }

  function legacyPrimaryId(row) {
    return rowStableId(row);
  }

  function legacyAliasIds(row) {
    return sortedUniqueIds(
      Array.isArray(
        row?.legacyMatchIds
      )
        ? row.legacyMatchIds
        : []
    );
  }

  function legacySourceIds(row) {
    return sortedUniqueIds(
      Array.isArray(
        row?.sourceMatchIds
      )
        ? row.sourceMatchIds
        : []
    );
  }

  const legacyRowsByPrimaryId =
    new Map();

  for (const legacyRow of legacy) {
    const primaryId =
      legacyPrimaryId(
        legacyRow
      );

    if (
      primaryId &&
      !legacyRowsByPrimaryId.has(
        primaryId
      )
    ) {
      legacyRowsByPrimaryId.set(
        primaryId,
        legacyRow
      );
    }
  }

  const unresolved = [];
  const ambiguous = [];

  const metrics = {
    legacyInput:
      legacy.length,

    excludedOutsideSeason: 0,
    excludedNonTerminalWithoutTruth: 0,

    exactIdMapped: 0,
    semanticMapped: 0,
    fixtureMapped: 0,
    adjacentDayMapped: 0,

    mappedLegacyIds: 0,
    eventsWithMultipleLegacyIds: 0,
    providerIdChanges: 0,

    stableIdCollisions: 0,
    representedLegacyIds: 0,
    missingMappedLegacyIds: 0
  };

  function assign(
    truthIndex,
    legacyId,
    strategy
  ) {
    const legacyRow =
      legacyRowsByPrimaryId.get(
        legacyId
      );

    if (!legacyRow) {
      unresolved.push({
        legacyId,
        reason:
          "legacy_row_missing_for_assignment"
      });

      return;
    }

    if (
      !legacyLineageByTruthIndex.has(
        truthIndex
      )
    ) {
      legacyLineageByTruthIndex.set(
        truthIndex,
        {
          primaryIds:
            new Set(),

          legacyIds:
            new Set(),

          sourceIds:
            new Set()
        }
      );
    }

    const lineage =
      legacyLineageByTruthIndex.get(
        truthIndex
      );

    lineage.primaryIds.add(
      legacyId
    );

    for (
      const aliasId of
      legacyAliasIds(
        legacyRow
      )
    ) {
      lineage.legacyIds.add(
        aliasId
      );
    }

    for (
      const sourceId of
      legacySourceIds(
        legacyRow
      )
    ) {
      lineage.sourceIds.add(
        sourceId
      );
    }

    strategies.set(
      legacyId,
      strategy
    );

    metrics.mappedLegacyIds += 1;
  }

  for (const legacyRow of legacy) {
    const legacyId =
      rowStableId(legacyRow);

    const legacyDay =
      rowDayKey(legacyRow);

    if (
      !legacyId ||
      !legacyDay
    ) {
      unresolved.push({
        legacyId,
        reason:
          "legacy_missing_id_or_day"
      });

      continue;
    }

    if (
      !bounds ||
      legacyDay < bounds.startDay ||
      legacyDay > bounds.endDay
    ) {
      metrics.excludedOutsideSeason += 1;
      continue;
    }

    const exactIdCandidates =
      truthById.get(
        legacyId
      ) || [];

    if (exactIdCandidates.length === 1) {
      const truthIndex =
        exactIdCandidates[0];

      const truthRow =
        truth[truthIndex];

      const sameLeague =
        normalizedIdentityText(
          legacyRow?.leagueSlug
        ) ===
        normalizedIdentityText(
          truthRow?.leagueSlug
        );

      const dayDistance =
        absoluteDayDifference(
          legacyDay,
          rowDayKey(truthRow)
        );

      if (
        sameLeague &&
        dayDistance !== null &&
        dayDistance <= 1
      ) {
        assign(
          truthIndex,
          legacyId,
          "exact_id"
        );

        metrics.exactIdMapped += 1;
        continue;
      }

      unresolved.push({
        legacyId,
        reason:
          "exact_id_incompatible",
        truthIds:
          exactIdCandidates.map(
            index =>
              rowStableId(
                truth[index]
              )
          )
      });

      continue;
    }

    if (exactIdCandidates.length > 1) {
      ambiguous.push({
        legacyId,
        reason:
          "exact_id_ambiguous",
        truthIds:
          exactIdCandidates.map(
            index =>
              rowStableId(
                truth[index]
              )
          )
      });

      continue;
    }

    if (
      !isTerminalHistoryRow(
        legacyRow
      )
    ) {
      metrics
        .excludedNonTerminalWithoutTruth += 1;

      continue;
    }

    const semanticCandidates =
      truthBySemantic.get(
        rowSemanticIdentityKey(
          legacyRow
        )
      ) || [];

    if (semanticCandidates.length === 1) {
      assign(
        semanticCandidates[0],
        legacyId,
        "semantic"
      );

      metrics.semanticMapped += 1;
      continue;
    }

    if (semanticCandidates.length > 1) {
      ambiguous.push({
        legacyId,
        reason:
          "semantic_ambiguous",
        truthIds:
          semanticCandidates.map(
            index =>
              rowStableId(
                truth[index]
              )
          )
      });

      continue;
    }

    const fixtureCandidates =
      truthByFixture.get(
        rowFixtureIdentityKey(
          legacyRow
        )
      ) || [];

    if (fixtureCandidates.length === 1) {
      assign(
        fixtureCandidates[0],
        legacyId,
        "fixture_score_update"
      );

      metrics.fixtureMapped += 1;
      continue;
    }

    if (fixtureCandidates.length > 1) {
      ambiguous.push({
        legacyId,
        reason:
          "fixture_ambiguous",
        truthIds:
          fixtureCandidates.map(
            index =>
              rowStableId(
                truth[index]
              )
          )
      });

      continue;
    }

    const adjacentCandidates = (
      truthByPairScore.get(
        rowPairScoreIdentityKey(
          legacyRow
        )
      ) || []
    ).filter(
      truthIndex => {
        const distance =
          absoluteDayDifference(
            legacyDay,
            rowDayKey(
              truth[truthIndex]
            )
          );

        return (
          distance !== null &&
          distance <= 1
        );
      }
    );

    if (adjacentCandidates.length === 1) {
      assign(
        adjacentCandidates[0],
        legacyId,
        "adjacent_day_same_event"
      );

      metrics.adjacentDayMapped += 1;
      continue;
    }

    if (adjacentCandidates.length > 1) {
      ambiguous.push({
        legacyId,
        reason:
          "adjacent_day_ambiguous",
        truthIds:
          adjacentCandidates.map(
            index =>
              rowStableId(
                truth[index]
              )
          )
      });

      continue;
    }

    unresolved.push({
      legacyId,
      reason:
        "no_truth_event_match"
    });
  }

  const outputRows = [];

  const usedStableIds =
    new Set();

  const representedLegacyIds =
    new Set();

  const stableIdCollisions = [];

  for (
    let index = 0;
    index < truth.length;
    index += 1
  ) {
    const row =
      truth[index];

    const sourceId =
      rowStableId(row);

    const lineage =
      legacyLineageByTruthIndex.get(
        index
      ) || {
        primaryIds:
          new Set(),

        legacyIds:
          new Set(),

        sourceIds:
          new Set()
      };

    const primaryIds =
      sortedUniqueIds([
        ...lineage.primaryIds
      ]);

    const legacyIds =
      sortedUniqueIds([
        ...lineage.legacyIds
      ]);

    const previousSourceIds =
      sortedUniqueIds([
        ...lineage.sourceIds
      ]);

    const lineageLegacyIds =
      sortedUniqueIds([
        ...primaryIds,
        ...legacyIds
      ]);

    if (
      lineageLegacyIds.length > 1
    ) {
      metrics
        .eventsWithMultipleLegacyIds += 1;
    }

    let stableId =
      sourceId;

    if (
      primaryIds.length === 1
    ) {
      stableId =
        primaryIds[0];
    } else if (
      primaryIds.length > 1 &&
      primaryIds.includes(sourceId)
    ) {
      stableId =
        sourceId;
    }

    if (
      !stableId ||
      usedStableIds.has(stableId)
    ) {
      stableIdCollisions.push({
        stableId,
        sourceId,
        legacyIds
      });

      continue;
    }

    usedStableIds.add(stableId);

    for (
      const primaryId of
      primaryIds
    ) {
      representedLegacyIds.add(
        primaryId
      );
    }

    if (
      stableId !== sourceId
    ) {
      metrics.providerIdChanges += 1;
    }

    const allReferenceIds =
      sortedUniqueIds([
        stableId,
        sourceId,
        ...primaryIds,
        ...legacyIds,
        ...previousSourceIds,
        ...(
          Array.isArray(
            row?.sourceMatchIds
          )
            ? row.sourceMatchIds
            : []
        )
      ]);

    const allSourceIds = [
      stableId,
      ...allReferenceIds.filter(
        referenceId =>
          referenceId !== stableId
      )
    ];

    const deterministicLegacyIds =
      lineageLegacyIds.filter(
        legacyId =>
          legacyId !== stableId
      );

    if (
      stableId === sourceId &&
      allSourceIds.length === 1 &&
      deterministicLegacyIds.length === 0
    ) {
      outputRows.push(row);
      continue;
    }

    outputRows.push({
      ...row,
      id: stableId,
      matchId: stableId,
      sourceMatchIds:
        allSourceIds,
      legacyMatchIds:
        deterministicLegacyIds
    });
  }

  metrics.stableIdCollisions =
    stableIdCollisions.length;

  metrics.representedLegacyIds =
    representedLegacyIds.size;

  const mappedLegacyIds = [
    ...strategies.keys()
  ];

  const missingMappedLegacyIds =
    mappedLegacyIds.filter(
      legacyId =>
        !representedLegacyIds.has(
          legacyId
        )
    );

  metrics.missingMappedLegacyIds =
    missingMappedLegacyIds.length;

  return {
    rows: outputRows,
    metrics,
    unresolved,
    ambiguous,
    stableIdCollisions,
    missingMappedLegacyIds,
    strategies:
      Object.fromEntries(
        strategies
      ),
    ok:
      unresolved.length === 0 &&
      ambiguous.length === 0 &&
      stableIdCollisions.length === 0 &&
      missingMappedLegacyIds.length === 0
  };
}

async function readArchiveSupplementForLeague(
  slug,
  bounds
) {
  const labels =
    archiveLabelsForGlobalSeason(
      slug,
      SEASON
    );

  const leagueName =
    LEAGUE_NAME_MAP[slug] ||
    slug;

  const byKey = new Map();

  let filesRead = 0;
  let rejectedOutsideSeason = 0;
  let rejectedNonTerminal = 0;

  for (const label of labels) {
    const file = path.join(
      ARCHIVE_DIR,
      slug,
      `${label}.json`
    );

    let payload;

    try {
      payload = JSON.parse(
        await fs.readFile(
          file,
          "utf8"
        )
      );

      filesRead += 1;
    } catch {
      continue;
    }

    const matches =
      Array.isArray(payload?.matches)
        ? payload.matches
        : [];

    for (const rawRow of matches) {
      const row = canonicalizeTeams({
        ...rawRow,
        leagueName:
          rawRow?.leagueName ||
          leagueName
      });

      if (
        !rowIsInsideGlobalSeason(
          row,
          bounds
        )
      ) {
        rejectedOutsideSeason += 1;
        continue;
      }

      if (
        !isTerminalHistoryRow(row) ||
        !rowHasFiniteScore(row)
      ) {
        rejectedNonTerminal += 1;
        continue;
      }

      const key = archiveRowKey(row);

      if (!byKey.has(key)) {
        byKey.set(key, row);
      }
    }
  }

  return {
    rows: [...byKey.values()],
    labels,
    filesRead,
    rejectedOutsideSeason,
    rejectedNonTerminal
  };
}

export async function buildCurrentSeasonIndexes() {
  console.log("[index] season:", SEASON);
  console.log("[index] target day:", TARGET_DAY);
  console.log(
    "[index] target date:",
    TARGET_DATE.toISOString()
  );
  console.log("[index] archive dir:", ARCHIVE_DIR);

  const bounds =
    resolveGlobalSeasonBounds(
      SEASON
    );

  if (!bounds) {
    throw new Error(
      `invalid_global_season:${SEASON}`
    );
  }

  const historyPrimary =
    await readGlobalHistoryPrimary(
      bounds
    );

  const historyCoveredSlugs =
    new Set(
      historyPrimary
        .map(row =>
          String(
            row?.leagueSlug || ""
          )
        )
        .filter(Boolean)
    );

  const archiveLeagues =
    await listArchiveLeagues();

  const archiveCandidates = [];

  let archiveLeaguesWithRows = 0;
  let archiveFilesRead = 0;
  let archiveRejectedOutsideSeason = 0;
  let archiveRejectedNonTerminal = 0;

  for (const slug of archiveLeagues) {
    const result =
      await readArchiveSupplementForLeague(
        slug,
        bounds
      );

    archiveFilesRead +=
      result.filesRead;

    archiveRejectedOutsideSeason +=
      result.rejectedOutsideSeason;

    archiveRejectedNonTerminal +=
      result.rejectedNonTerminal;

    if (result.rows.length) {
      archiveLeaguesWithRows += 1;

      archiveCandidates.push(
        ...result.rows
      );
    }
  }

  const merged =
    mergeIdentityStableRows(
      historyPrimary,
      archiveCandidates
    );

  const existingMatchupRows =
    await readExistingMatchupRows();

  const lineage =
    applyLegacyIdentityLineage(
      merged.rows,
      existingMatchupRows,
      bounds
    );

  if (!lineage.ok) {
    throw new Error(
      "identity_lineage_failed:" +
      JSON.stringify({
        unresolved:
          lineage.unresolved.slice(
            0,
            20
          ),
        ambiguous:
          lineage.ambiguous.slice(
            0,
            20
          ),
        stableIdCollisions:
          lineage.stableIdCollisions.slice(
            0,
            20
          ),
        missingMappedLegacyIds:
          lineage.missingMappedLegacyIds.slice(
            0,
            20
          )
      })
    );
  }

  const allMatches =
    lineage.rows;

  console.log(
    `[index] matches: ${allMatches.length} ` +
    `(history-primary ${historyPrimary.length} ` +
    `from ${historyCoveredSlugs.size} leagues, ` +
    `archive-candidates ${archiveCandidates.length} ` +
    `from ${archiveLeaguesWithRows} leagues, ` +
    `archive-accepted ${merged.metrics.archiveAccepted}, ` +
    `duplicate-id-rejected ` +
    `${merged.metrics.duplicateIdRejected}, ` +
    `semantic-duplicate-rejected ` +
    `${merged.metrics.semanticDuplicateRejected}, ` +
    `adjacent-day-history-duplicate-rejected ` +
    `${merged.metrics.adjacentDayHistoryDuplicateRejected}, ` +
    `score-conflict-rejected ` +
    `${merged.metrics.scoreConflictRejected}, ` +
    `malformed-rejected ` +
    `${merged.metrics.malformedRejected}, ` +
    `legacy-input ${lineage.metrics.legacyInput}, ` +
    `legacy-outside-season ` +
    `${lineage.metrics.excludedOutsideSeason}, ` +
    `legacy-non-terminal-only ` +
    `${lineage.metrics.excludedNonTerminalWithoutTruth}, ` +
    `legacy-mapped ` +
    `${lineage.metrics.mappedLegacyIds}, ` +
    `legacy-represented ` +
    `${lineage.metrics.representedLegacyIds}, ` +
    `multi-legacy-events ` +
    `${lineage.metrics.eventsWithMultipleLegacyIds}, ` +
    `provider-id-changes ` +
    `${lineage.metrics.providerIdChanges}, ` +
    `archive-files ${archiveFilesRead}, ` +
    `archive-rejected-outside-season ` +
    `${archiveRejectedOutsideSeason}, ` +
    `archive-rejected-non-terminal ` +
    `${archiveRejectedNonTerminal})`
  );

  const teamIndex = buildTeamIndex(allMatches);
  const leagueIndex = buildLeagueIndex(allMatches);
  const matchupIndex = buildMatchupIndex(allMatches);

  await writeJson(TEAM_OUT, teamIndex);
  await writeJson(LEAGUE_OUT, leagueIndex);
  await writeJson(MATCHUP_OUT, matchupIndex);

  console.log("[index] done");
  console.log("[index] wrote:", TEAM_OUT);
  console.log("[index] wrote:", LEAGUE_OUT);
  console.log("[index] wrote:", MATCHUP_OUT);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  buildCurrentSeasonIndexes().catch(err => {
    console.error("[index] failed", err);
    process.exit(1);
  });
}