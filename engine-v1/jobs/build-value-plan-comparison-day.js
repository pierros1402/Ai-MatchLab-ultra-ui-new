import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPlanAObservationDay,
  planAObservationFile,
  readPlanAObservationDay,
  PLAN_A_OBSERVATION_START_DAY
} from "../value/plan-a-observation.js";
import { verifiedFinalVetoReason } from "../core/non-played-state.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { validatePicksAgainstCanonicalFixtures } from "../core/plan-b-canonical-membership.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

function dataPath(...parts) {
  return path.join(ROOT, "data", ...parts);
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonPretty(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function clean(value) {
  return String(value ?? "").trim();
}

// slug -> { country, name } from the shared league catalogue, so comparison
// rows carry a real country + league name (e.g. "isl.1" -> Iceland / Besta
// deild karla) instead of a bare slug. Value picks/fixtures don't carry these.
let _leagueCatalogueMap = null;
function leagueCatalogueMap() {
  if (_leagueCatalogueMap) return _leagueCatalogueMap;
  const map = new Map();
  try {
    const j = JSON.parse(
      fs.readFileSync(path.join(ROOT, "assets", "data", "leagues-catalogue.json"), "utf8")
    );
    const stack = [j];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        for (const x of node) stack.push(x);
        continue;
      }
      if (node && typeof node === "object") {
        if (node.country_name && Array.isArray(node.leagues)) {
          for (const l of node.leagues) {
            if (l?.league_id) {
              map.set(String(l.league_id), {
                country: String(node.country_name || ""),
                name: String(l.display_name || l.league_name || "")
              });
            }
          }
        }
        for (const v of Object.values(node)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    }
  } catch {
    /* catalogue optional — rows fall back to slug */
  }
  _leagueCatalogueMap = map;
  return map;
}

function rowsFromPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const key of ["picks", "valuePicks", "rows", "items"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function rowId(row) {
  return clean(row?.matchId || row?.id || row?.fixtureId || row?.eventId || row?.gameId);
}

function addExactIdentityAlias(target, value) {
  const alias = clean(value);
  if (alias) target.add(alias);
}

export function exactIdentityAliases(row) {
  const aliases = new Set();

  for (const key of [
    "matchId",
    "canonicalId",
    "id",
    "fixtureId",
    "eventId",
    "gameId",
    "sourceId",
    "sourceMatchId",
    "providerMatchId"
  ]) {
    addExactIdentityAlias(aliases, row?.[key]);
  }

  const sources = row?.sources;

  if (Array.isArray(sources)) {
    for (const sourceRow of sources) {
      for (const key of [
        "matchId",
        "canonicalId",
        "sourceId",
        "sourceMatchId",
        "providerMatchId"
      ]) {
        addExactIdentityAlias(aliases, sourceRow?.[key]);
      }
    }
  } else if (sources && typeof sources === "object") {
    for (const sourceRow of Object.values(sources)) {
      for (const key of [
        "matchId",
        "canonicalId",
        "sourceId",
        "sourceMatchId",
        "providerMatchId"
      ]) {
        addExactIdentityAlias(aliases, sourceRow?.[key]);
      }
    }
  }

  return [...aliases];
}

export function buildExactIdentityIndex(rows = []) {
  const byId = new Map();
  const ambiguousIds = new Set();

  for (const row of rows) {
    for (const alias of exactIdentityAliases(row)) {
      if (ambiguousIds.has(alias)) continue;

      const existing = byId.get(alias);

      if (!existing) {
        byId.set(alias, row);
        continue;
      }

      if (existing !== row) {
        byId.delete(alias);
        ambiguousIds.add(alias);
      }
    }
  }

  return {
    byId,
    ambiguousIds: [...ambiguousIds].sort()
  };
}

function strictExplicitScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);

  return (
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= 0
  )
    ? parsed
    : null;
}

function resolveConsistentScore(values) {
  const present = values.filter(value =>
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim() === "")
  );

  if (!present.length) return null;

  const parsed = present.map(strictExplicitScore);
  if (parsed.some(value => value === null)) return null;

  return new Set(parsed).size === 1
    ? parsed[0]
    : null;
}

export function resolveVerifiedFinalScore(finalResult) {
  if (!finalResult || typeof finalResult !== "object") return null;

  const homeScore = resolveConsistentScore([
    finalResult.homeScore,
    finalResult.scoreHome,
    finalResult?.finalScore?.homeScore,
    finalResult?.finalScore?.home
  ]);

  const awayScore = resolveConsistentScore([
    finalResult.awayScore,
    finalResult.scoreAway,
    finalResult?.finalScore?.awayScore,
    finalResult?.finalScore?.away
  ]);

  if (homeScore === null || awayScore === null) return null;

  return {
    homeScore,
    awayScore,
    scoreKey: clean(finalResult.scoreKey || finalResult?.finalScore?.scoreKey) ||
      String(homeScore) + "-" + String(awayScore)
  };
}

function homeName(row) {
  return clean(row?.homeTeam || row?.home || row?.homeName || row?.teams?.home?.name || row?.home?.name);
}

function awayName(row) {
  return clean(row?.awayTeam || row?.away || row?.awayName || row?.teams?.away?.name || row?.away?.name);
}

function normalizeMarket(value) {
  return clean(value).toUpperCase();
}

function normalizeSelection(row) {
  return clean(row?.pick || row?.selection || row?.prediction || row?.side || row?.outcome).toUpperCase();
}

function decimalOdds(row) {
  const keys = [
    "odds",
    "price",
    "decimalOdds",
    "displayOdds",
    "bookOdds",
    "marketOdds",
    "selectionOdds",
    "bestOdds"
  ];

  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 1) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 1) return parsed;
    }
    if (value && typeof value === "object") {
      for (const nestedKey of ["decimal", "value", "odds", "price"]) {
        const nested = value[nestedKey];
        if (typeof nested === "number" && Number.isFinite(nested) && nested > 1) return nested;
        if (typeof nested === "string") {
          const parsed = Number(nested.replace(",", "."));
          if (Number.isFinite(parsed) && parsed > 1) return parsed;
        }
      }
    }
  }

  return null;
}

export function evaluatePickResult(pick, finalResult) {
  const score = resolveVerifiedFinalScore(finalResult);
  if (!score) return null;

  const home = score.homeScore;
  const away = score.awayScore;

  const market = normalizeMarket(pick?.market || pick?.marketName || pick?.type);
  const selection = normalizeSelection(pick);
  const total = home + away;

  const compactMarket = market.replace(/[^A-Z0-9]/gu, "");
  const compactSelection = selection.replace(/[^A-Z0-9.]/gu, "");

  const compactOuMatch = compactMarket.match(/^OU([0-9]{2})$/u);
  if (compactOuMatch) {
    const line = Number(compactOuMatch[1]) / 10;
    if (compactSelection === "OVER" || compactSelection.startsWith("OVER")) return total > line;
    if (compactSelection === "UNDER" || compactSelection.startsWith("UNDER")) return total < line;
  }

  if (compactMarket === "BTTS") {
    const bothTeamsScored = home > 0 && away > 0;
    if (compactSelection === "YES") return bothTeamsScored;
    if (compactSelection === "NO") return !bothTeamsScored;
  }

  if (market.includes("OVER") || market.includes("UNDER")) {
    const lineMatch = market.match(/([0-9]+(?:\.[0-9]+)?)/u) || selection.match(/([0-9]+(?:\.[0-9]+)?)/u);
    const line = lineMatch ? Number(lineMatch[1]) : null;

    if (!Number.isFinite(line)) return null;
    if (market.includes("OVER") || selection.includes("OVER")) return total > line;
    if (market.includes("UNDER") || selection.includes("UNDER")) return total < line;
  }

  if (market === "BTTS" || market.includes("BOTH TEAMS")) {
    if (selection === "YES" || selection === "Y" || selection.includes("YES")) return home > 0 && away > 0;
    if (selection === "NO" || selection === "N" || selection.includes("NO")) return !(home > 0 && away > 0);
    return null;
  }

  if (market === "1X2" || market.includes("MATCH WINNER") || market.includes("FULL TIME RESULT")) {
    if (selection === "HOME" || selection === "1") return home > away;
    if (selection === "AWAY" || selection === "2") return away > home;
    if (selection === "DRAW" || selection === "X") return home === away;
    return null;
  }

  return null;
}

function loadFixtures(dayKey) {
  const file = dataPath("deploy-snapshots", dayKey, "fixtures.json");
  const rows = rowsFromPayload(readJsonSafe(file, null));
  const identity = buildExactIdentityIndex(rows);

  return {
    file,
    rows,
    byId: identity.byId,
    ambiguousIds: identity.ambiguousIds
  };
}

// AI-priced market odds + implied probabilities from odds.json, plus kickoff.
// Firewall-safe: display context only, never feeds settlement math beyond the
// already-present oddsDecimal.
function loadOddsMap(dayKey) {
  const file = dataPath("deploy-snapshots", dayKey, "odds.json");
  const parsed = readJsonSafe(file, null);
  const byId = new Map();
  for (const m of parsed?.matches || []) {
    const markets = m?.aiAssessment?.markets || null;
    if (!markets && !m?.kickoffUtc) continue;
    const entry = { markets, kickoff: m?.kickoffUtc || null };
    for (const id of [m?.matchId, m?.canonicalId]) {
      if (id) byId.set(String(id), entry);
    }
  }
  return byId;
}

// Real bookmaker odds from the multi-odds store (odds-api.io + OddsPapi
// panels), keyed by our own matchId. Display/settlement-report join only —
// picks are frozen before this build step runs, so this can never influence
// pick selection (odds↔value firewall).
const MULTI_ODDS_PANELS = ["greek", "european", "asian", "betfair"];

function loadMultiOddsMap(dayKey) {
  const parsed = readJsonSafe(dataPath("multi-odds", `${dayKey}.json`), null);
  const byId = new Map();
  for (const [id, entry] of Object.entries(parsed?.matches || {})) {
    if (entry?.markets) byId.set(String(id), entry.markets);
  }
  return byId;
}

// Average real-book odd across every panel/bookmaker for one market+side.
function realBookOdds(multiMarkets, marketKey, side) {
  const block = multiMarkets?.[marketKey];
  if (!block || !side) return null;
  const vals = [];
  for (const panel of MULTI_ODDS_PANELS) {
    for (const bk of Object.values(block[panel] || {})) {
      const v = Number(bk?.[side]);
      if (Number.isFinite(v) && v > 1) vals.push(v);
    }
  }
  if (!vals.length) return null;
  return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2));
}

const COMPARISON_MARKET_KEYS = {
  OU15: "OU15", "Over / Under 1.5": "OU15",
  OU25: "OU25", "Over / Under 2.5": "OU25",
  OU35: "OU35", "Over / Under 3.5": "OU35",
  BTTS: "BTTS", "1X2": "1X2", DC: "DC", "Double Chance": "DC"
};

function oddsSideForPick(marketKey, pick) {
  const p = String(pick || "").toUpperCase().trim();
  if (marketKey === "OU15" || marketKey === "OU25" || marketKey === "OU35") {
    if (p.includes("OVER")) return "over";
    if (p.includes("UNDER")) return "under";
    return null;
  }
  if (marketKey === "BTTS") {
    if (p.includes("YES")) return "yes";
    if (p.includes("NO")) return "no";
    return null;
  }
  if (marketKey === "1X2") {
    if (p === "1" || p === "HOME") return "home";
    if (p === "X" || p === "DRAW") return "draw";
    if (p === "2" || p === "AWAY") return "away";
    return null;
  }
  if (marketKey === "DC") {
    if (["1X", "X2", "12"].includes(p)) return p;
    return null;
  }
  return null;
}

function resolveMarketFor(oddsEntry, market, pick) {
  const markets = oddsEntry?.markets;
  if (!markets) return { prob: null, odds: null };
  const key = COMPARISON_MARKET_KEYS[market] || market;
  const block = markets[key];
  if (!block) return { prob: null, odds: null };
  const side = oddsSideForPick(key, pick);
  if (!side) return { prob: null, odds: null };
  const prob = Number(block.probs?.[side]);
  const odds = Number(block.odds?.[side]);
  return {
    prob: Number.isFinite(prob) ? prob : null,
    odds: Number.isFinite(odds) ? odds : null
  };
}

function loadCanonicalFinalVetoIndex(dayKey) {
  const dir = dataPath("canonical-fixtures", dayKey);
  const byCanonicalId = new Map();
  const ambiguousIds = new Set();

  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;

      const payload = readJsonSafe(path.join(dir, name), null);
      const fixtures = Array.isArray(payload?.fixtures)
        ? payload.fixtures
        : [];

      for (const fixture of fixtures) {
        const canonicalId = clean(fixture?.canonicalId);
        if (!canonicalId) continue;

        if (byCanonicalId.has(canonicalId)) {
          ambiguousIds.add(canonicalId);
          byCanonicalId.delete(canonicalId);
          continue;
        }

        if (!ambiguousIds.has(canonicalId)) {
          byCanonicalId.set(canonicalId, fixture);
        }
      }
    }
  }

  return {
    dir,
    byCanonicalId,
    ambiguousIds
  };
}

export function loadFinalResults(
  dayKey,
  canonicalIndex = loadCanonicalFinalVetoIndex(dayKey)
) {
  const dir = dataPath("final-results", dayKey);
  const rows = [];
  const canonicalContradictions = [];

  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;

      const row = readJsonSafe(path.join(dir, name), null);
      if (!row) continue;

      const id = rowId(row);
      if (!id) continue;

      if (canonicalIndex.ambiguousIds.has(id)) {
        canonicalContradictions.push({
          matchId: id,
          reason: "canonical_identity_ambiguous"
        });
        continue;
      }

      const fixture =
        canonicalIndex.byCanonicalId.get(id) ||
        null;

      const vetoReason = verifiedFinalVetoReason(fixture);

      if (vetoReason) {
        canonicalContradictions.push({
          matchId: id,
          canonicalId: clean(fixture?.canonicalId),
          fixtureStatus: clean(fixture?.status),
          fixtureRawStatus: clean(fixture?.rawStatus),
          reason: vetoReason
        });
        continue;
      }

      rows.push(row);
    }
  }

  const identity = buildExactIdentityIndex(rows);

  return {
    dir,
    rows,
    byId: identity.byId,
    ambiguousIds: identity.ambiguousIds,
    canonicalDir: canonicalIndex.dir,
    canonicalIdentityAmbiguities: [
      ...canonicalIndex.ambiguousIds
    ].sort(),
    canonicalContradictions
  };
}

function enrichPick(row, fixture, finalResult, planId, oddsEntry, multiMarkets) {
  const id = rowId(row);
  const verifiedScore = resolveVerifiedFinalScore(finalResult);
  const win = finalResult ? evaluatePickResult(row, finalResult) : null;

  let settlement = "UNRESOLVED";
  if (finalResult && win === true) settlement = "WIN";
  if (finalResult && win === false) settlement = "LOSS";
  if (finalResult && win === null) settlement = "UNSUPPORTED";

  const leagueSlug = clean(row?.leagueSlug || row?.league || fixture?.leagueSlug || fixture?.league || finalResult?.leagueSlug);
  const cat = leagueCatalogueMap().get(leagueSlug) || null;

  const market = clean(row?.market || row?.marketName || row?.type);
  const pick = clean(row?.pick || row?.selection || row?.prediction || row?.side || row?.outcome);
  const mkt = resolveMarketFor(oddsEntry, market, pick);
  // Real bookmaker odd only: from the pick row itself, else the multi-odds
  // store (average across real books for this market+side). The AI-priced
  // fair odd is kept separately as aiFairOdds.
  const marketKey = COMPARISON_MARKET_KEYS[market] || market;
  const odds = decimalOdds(row)
    ?? realBookOdds(multiMarkets, marketKey, oddsSideForPick(marketKey, pick));
  const kickoff = clean(row?.kickoff || fixture?.kickoff || fixture?.kickoffUtc || oddsEntry?.kickoff) || null;

  return {
    planId,
    matchId: id,
    country: clean(row?.country || fixture?.country || finalResult?.country || cat?.country),
    leagueSlug,
    leagueName: clean(row?.leagueName || row?.competitionName || fixture?.leagueName || fixture?.competitionName || finalResult?.leagueName || finalResult?.competitionName || cat?.name),
    kickoff,
    homeTeam: homeName(row) || homeName(fixture),
    awayTeam: awayName(row) || awayName(fixture),
    market,
    pick,
    band: row?.band ?? null,
    // Plan A carries "score"; Plan B (strict v2.3) has no score — its headline
    // metric is modelProb (the model's probability). Fall back to it so the
    // Plan B row shows a % instead of "—".
    score: (typeof row?.score === "number")
      ? row.score
      : (typeof row?.modelProb === "number" ? row.modelProb : null),
    confidence: row?.confidence ?? null,
    readiness: row?.readiness ?? null,
    marketProb: mkt.prob,
    aiFairOdds: mkt.odds,
    oddsDecimal: odds,
    oddsUse: odds ? "display_settlement_only" : null,
    finalScore: verifiedScore,
    result: settlement
  };
}

function summarize(rows) {
  const picks = rows.length;
  const uniqueMatches = new Set(rows.map(row => row.matchId).filter(Boolean)).size;
  const settledRows = rows.filter(row => row.result === "WIN" || row.result === "LOSS");
  const wins = rows.filter(row => row.result === "WIN").length;
  const losses = rows.filter(row => row.result === "LOSS").length;
  const unresolved = rows.filter(row => row.result === "UNRESOLVED").length;
  const unsupported = rows.filter(row => row.result === "UNSUPPORTED").length;
  const oddsRows = settledRows.filter(row => Number.isFinite(row.oddsDecimal) && row.oddsDecimal > 1);

  const totalStake = oddsRows.length;
  const totalReturn = oddsRows.reduce((sum, row) => sum + (row.result === "WIN" ? row.oddsDecimal : 0), 0);
  const profit = oddsRows.length ? totalReturn - totalStake : null;

  return {
    picks,
    uniqueMatches,
    settled: settledRows.length,
    wins,
    losses,
    unresolved,
    unsupported,
    hitRate: settledRows.length ? Number((wins / settledRows.length).toFixed(4)) : null,
    oddsAvailable: oddsRows.length,
    averageOdds: oddsRows.length
      ? Number((oddsRows.reduce((sum, row) => sum + row.oddsDecimal, 0) / oddsRows.length).toFixed(4))
      : null,
    totalStake: oddsRows.length ? totalStake : null,
    totalReturn: oddsRows.length ? Number(totalReturn.toFixed(4)) : null,
    profit: profit === null ? null : Number(profit.toFixed(4)),
    roi: profit === null ? null : Number((profit / totalStake).toFixed(4))
  };
}

function buildPlan({ planId, label, sourcePath, payload, fixturesById, finalById, oddsById, multiOddsById }) {
  const rawRows = rowsFromPayload(payload);

  const picks = rawRows.map(row => {
    const id = rowId(row);
    return enrichPick(row, fixturesById.get(id), finalById.get(id), planId, oddsById?.get(id), multiOddsById?.get(id));
  });

  return {
    id: planId,
    label,
    sourcePath,
    policyVersion: payload?.policyVersion || null,
    outputMode: payload?.outputMode || null,
    immutable: payload?.immutable === true,
    frozenAt: payload?.frozenAt || null,
    observationSignature: payload?.observationSignature || null,
    provenance: payload?.provenance || null,
    count: picks.length,
    summary: summarize(picks),
    picks
  };
}

function parseArgs(argv) {
  const out = {
    date: "",
    write: false,
    planA: "",
    planB: "",
    output: ""
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(arg)) out.date = arg;
    else if (arg.startsWith("--date=")) out.date = arg.slice("--date=".length);
    else if (arg === "--write") out.write = true;
    else if (arg.startsWith("--plan-a=")) out.planA = arg.slice("--plan-a=".length);
    else if (arg.startsWith("--plan-b=")) out.planB = arg.slice("--plan-b=".length);
    else if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
  }

  return out;
}

export function buildValuePlanComparisonDay(dayKey, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(dayKey))) {
    return { ok: false, reason: "invalid_day_key", dayKey };
  }

  const observationPeriod = isPlanAObservationDay(dayKey);
  const snapshotPlanAPath = path.resolve(dataPath("deploy-snapshots", dayKey, "value.json"));
  const immutablePlanAPath = path.resolve(planAObservationFile(dayKey));
  if (
    observationPeriod &&
    options.planA &&
    path.resolve(options.planA) !== immutablePlanAPath
  ) {
    return {
      ok: false,
      reason: "plan_a_override_forbidden_during_observation_period",
      dayKey,
      requestedPlanAPath: path.resolve(options.planA),
      requiredPlanAPath: immutablePlanAPath,
      trialStartDate: PLAN_A_OBSERVATION_START_DAY
    };
  }

  let planAPath = path.resolve(
    options.planA || (observationPeriod
      ? immutablePlanAPath
      : snapshotPlanAPath)
  );
  const planBPath = path.resolve(options.planB || dataPath("value-plans", dayKey, "plan-b.json"));
  const outputPath = path.resolve(options.output || dataPath("value-comparison", `${dayKey}.json`));

  let planAPayload = null;
  if (observationPeriod) {
    const observation = readPlanAObservationDay(dayKey);
    if (!observation.ok) {
      return {
        ok: false,
        reason: "invalid_immutable_plan_a_observation",
        planAPath,
        observation,
        trialStartDate: PLAN_A_OBSERVATION_START_DAY
      };
    }
    planAPayload = observation.payload;
  } else {
    planAPayload = readJsonSafe(planAPath, null);
  }

  const planBPayload = readJsonSafe(planBPath, null);

  if (!planAPayload) {
    return {
      ok: false,
      reason: observationPeriod ? "missing_immutable_plan_a_observation" : "missing_plan_a",
      planAPath,
      trialStartDate: observationPeriod ? PLAN_A_OBSERVATION_START_DAY : null
    };
  }
  if (!planBPayload) return { ok: false, reason: "missing_plan_b", planBPath };

  const canonicalFixtures = canonicalFixturesForDay(dayKey);
  const planBMembership = validatePicksAgainstCanonicalFixtures(
    rowsFromPayload(planBPayload),
    canonicalFixtures
  );
  const planBContract = planBPayload?.sourceContract;
  const planBContractOk =
    planBContract?.fixtureUniverse === "canonical_fixtures" &&
    planBContract?.canonicalFixtureUniverseRequired === true &&
    planBContract?.exactIdentityJoinOnly === true &&
    planBContract?.oddsMemoryCanCreateFixture === false;

  if (
    planBPayload?.ok === false ||
    !planBContractOk ||
    !planBMembership.ok
  ) {
    const blockedPayload = {
      ok: false,
      schema: "ai-matchlab.value-plan-comparison.v1",
      date: dayKey,
      generatedAt: new Date().toISOString(),
      reason: planBPayload?.ok === false
        ? "plan_b_artifact_not_ok"
        : !planBContractOk
          ? "plan_b_canonical_membership_contract_missing"
          : "plan_b_canonical_membership_violation",
      sourceContract: {
        planB: "canonical_fixture_membership_required",
        oddsMayCreateFixtures: false
      },
      inputs: {
        planAPath: path.relative(ROOT, planAPath).replaceAll("\\", "/"),
        planBPath: path.relative(ROOT, planBPath).replaceAll("\\", "/"),
        outputPath: path.relative(ROOT, outputPath).replaceAll("\\", "/"),
        canonicalFixtures: canonicalFixtures.length
      },
      membership: {
        contractOk: planBContractOk,
        ...planBMembership.summary,
        orphanPickIds: planBMembership.orphanPicks
          .map(row => clean(row?.canonicalId || row?.matchId))
          .filter(Boolean)
          .sort(),
        ambiguousPickIds: planBMembership.ambiguousPicks
          .map(entry => clean(entry?.pick?.canonicalId || entry?.pick?.matchId))
          .filter(Boolean)
          .sort()
      },
      plans: {
        A: null,
        B: {
          count: 0,
          summary: {
            picks: 0,
            settled: 0,
            wins: 0,
            losses: 0,
            unresolved: 0,
            hitRate: null,
            roi: null
          },
          picks: []
        }
      }
    };

    if (options.write === true) {
      writeJsonPretty(outputPath, blockedPayload);
    }

    return blockedPayload;
  }

  const fixtures = loadFixtures(dayKey);
  const finalResults = loadFinalResults(dayKey);
  const oddsById = loadOddsMap(dayKey);
  const multiOddsById = loadMultiOddsMap(dayKey);

  const planA = buildPlan({
    planId: "plan-a",
    label: observationPeriod
      ? "Plan A - frozen production observation"
      : "Plan A - current UI value",
    sourcePath: path.relative(ROOT, planAPath).replaceAll("\\", "/"),
    payload: planAPayload,
    fixturesById: fixtures.byId,
    finalById: finalResults.byId,
    oddsById,
    multiOddsById
  });

  const planB = buildPlan({
    planId: "plan-b",
    label: "Plan B - strict value-policy-v2.3 observation",
    sourcePath: path.relative(ROOT, planBPath).replaceAll("\\", "/"),
    payload: planBPayload,
    fixturesById: fixtures.byId,
    finalById: finalResults.byId,
    oddsById,
    multiOddsById
  });

  const comparison = {
    pickDeltaPlanBMinusPlanA: planB.summary.picks - planA.summary.picks,
    settledDeltaPlanBMinusPlanA: planB.summary.settled - planA.summary.settled,
    winsDeltaPlanBMinusPlanA: planB.summary.wins - planA.summary.wins,
    lossesDeltaPlanBMinusPlanA: planB.summary.losses - planA.summary.losses,
    hitRateDeltaPlanBMinusPlanA: planA.summary.hitRate === null || planB.summary.hitRate === null
      ? null
      : Number((planB.summary.hitRate - planA.summary.hitRate).toFixed(4)),
    roiDeltaPlanBMinusPlanA: planA.summary.roi === null || planB.summary.roi === null
      ? null
      : Number((planB.summary.roi - planA.summary.roi).toFixed(4))
  };

  const payload = {
    ok: true,
    schema: "ai-matchlab.value-plan-comparison.v1",
    date: dayKey,
    generatedAt: new Date().toISOString(),
    sourceContract: {
      planA: observationPeriod
        ? "immutable_plan_a_observation_artifact"
        : "production_ui_value_snapshot_artifact",
      planAObservationStartDate: PLAN_A_OBSERVATION_START_DAY,
      planAImmutable: observationPeriod,
      planB: "strict_value_policy_v2.3_observation_artifact",
      planBCanonicalFixtureMembershipRequired: true,
      planBOddsMayCreateFixtures: false,
      finalTruth: "verified_final_results",
      deploySnapshotUsedAsFinalTruth: false,
      realBookmakerOddsUsedForValue: false,
      oddsUse: "display_settlement_only_when_present"
    },
    inputs: {
      fixturesPath: path.relative(ROOT, fixtures.file).replaceAll("\\", "/"),
      finalResultsDir: path.relative(ROOT, finalResults.dir).replaceAll("\\", "/"),
      verifiedFinalResults: finalResults.rows.length,
      canonicalFinalVetoDir: path.relative(ROOT, finalResults.canonicalDir).replaceAll("\\", "/"),
      canonicalContradictionsRejected: finalResults.canonicalContradictions,
      canonicalIdentityAmbiguities: finalResults.canonicalIdentityAmbiguities,
      fixtureIdentityAmbiguities: fixtures.ambiguousIds,
      finalIdentityAmbiguities: finalResults.ambiguousIds,
      planAPath: path.relative(ROOT, planAPath).replaceAll("\\", "/"),
      planBMembership: planBMembership.summary,
      planAFreeze: null,
      outputPath: path.relative(ROOT, outputPath).replaceAll("\\", "/")
    },
    plans: {
      A: planA,
      B: planB
    },
    comparison
  };

  if (options.write === true) {
    writeJsonPretty(outputPath, payload);
  }

  return payload;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.date) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_date",
      usage: "node engine-v1/jobs/build-value-plan-comparison-day.js --date=YYYY-MM-DD [--write]"
    }, null, 2));
    process.exitCode = 2;
  } else {
    const result = buildValuePlanComparisonDay(args.date, args);
    console.log(JSON.stringify({
      ok: result.ok,
      date: result.date,
      outputPath: result.inputs?.outputPath || null,
      planA: result.plans?.A?.summary || null,
      planB: result.plans?.B?.summary || null,
      comparison: result.comparison || null
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}
