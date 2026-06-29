/**
 * derive-value-from-odds.js
 *
 * The bridge: odds.json (AI model probabilities) → value.json (picks).
 *
 * A "value pick" is a selection where our model probability exceeds the implied
 * probability embedded in the bookmaker's price by a meaningful margin (edge).
 * When no bookmaker odds are available we apply a stricter standalone probability
 * threshold so we don't generate picks purely from model output without market
 * validation.
 *
 * Thresholds (conservative — designed for precision over recall):
 *
 *   With bookmaker odds:
 *     MIN_EDGE  = 0.06   (model prob must beat implied prob by ≥6 pp)
 *     MIN_PROB  = 0.50   (model prob must be at least 50%)
 *
 *   Without bookmaker odds (model-only):
 *     MIN_PROB  = 0.65   (higher bar — no market sanity check)
 *     formSample ≥ 3 for both sides (enough evidence)
 *
 *   Always:
 *     crossLeague penalty: MIN_PROB += 0.05 (less reliable attribution)
 *     xgUsed bonus: MIN_EDGE -= 0.01 (xG improves model reliability)
 *
 * Output: data/deploy-snapshots/{dayKey}/value.json
 * {
 *   ok: true,
 *   date: dayKey,
 *   count: N,
 *   source: "derive-value-from-odds",
 *   picks: [
 *     {
 *       canonicalId,
 *       matchId,
 *       leagueSlug,
 *       home, away,
 *       kickoffUtc,
 *       market,         "1X2" | "OU25" | "BTTS" | "DC"
 *       pick,           "home" | "draw" | "away" | "over" | "under" | "yes" | "no" | "12" | "1X" | "X2"
 *       modelProb,      our probability
 *       impliedProb,    bookmaker's implied probability (null if no bookmaker)
 *       edge,           modelProb - impliedProb (null if no bookmaker)
 *       bookOdds,       bookmaker decimal odds (null if no bookmaker)
 *       modelOdds,      our fair decimal odds
 *       confidence,     "high" | "medium" | "low"
 *       basis,          "model+market" | "model_only"
 *       flags: []       ["xg_used", "form_used", "cross_league", ...]
 *     }
 *   ]
 * }
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildCanonicalId } from "../core/canonical-id.js";

const __filename = fileURLToPath(import.meta.url);

// ── Thresholds ────────────────────────────────────────────────────────────────
const WITH_BOOK_MIN_EDGE    = 0.06;
const WITH_BOOK_MIN_PROB    = 0.50;
const MODEL_ONLY_MIN_PROB   = 0.65;
const MODEL_ONLY_MIN_SAMPLE = 3;
const CROSS_LEAGUE_PENALTY  = 0.05;
const XG_BONUS_EDGE         = 0.01;

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function round3(v) { return Math.round(v * 1000) / 1000; }

// Implied probability from decimal bookmaker odds, margin-adjusted
function impliedProb(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 1) return null;
  return round3(1 / decimalOdds);
}

// Fair (no-margin) decimal odds from probability
function fairOdds(prob) {
  if (!prob || prob <= 0 || prob >= 1) return null;
  return round3(1 / prob);
}

// ── Per-market selectors ──────────────────────────────────────────────────────

function evaluate1X2(match, bookOdds1X2) {
  const probs = match.aiAssessment?.markets?.["1X2"]?.probs;
  const model = match.aiAssessment?.model;
  if (!probs) return [];

  const isCrossLeague = Boolean(match.aiAssessment?.crossLeague);
  const xgUsed = Boolean(model?.xgUsed);
  const formUsed = Boolean(model?.formUsed);
  const homeFormSample = Number(model?.homeFormSample || 0);
  const awayFormSample = Number(model?.awayFormSample || 0);
  const minFormSample = Math.min(homeFormSample, awayFormSample);

  const picks = [];

  for (const sel of ["home", "draw", "away"]) {
    const modelP = Number(probs[sel] || 0);
    if (!modelP) continue;

    const flags = [];
    if (formUsed) flags.push("form_used");
    if (xgUsed)   flags.push("xg_used");
    if (isCrossLeague) flags.push("cross_league");

    const crossPenalty = isCrossLeague ? CROSS_LEAGUE_PENALTY : 0;
    const xgBonus      = xgUsed ? XG_BONUS_EDGE : 0;

    const bookOddsForSel = bookOdds1X2?.[sel] || null;
    const impP = bookOddsForSel ? impliedProb(bookOddsForSel) : null;

    let qualifies = false;
    let basis = "model_only";
    let edge = null;
    let confidence = "low";

    if (impP !== null) {
      // Market-validated path
      edge = round3(modelP - impP - xgBonus);
      const minEdge = WITH_BOOK_MIN_EDGE - xgBonus;
      const minProb = WITH_BOOK_MIN_PROB + crossPenalty;
      qualifies = edge >= minEdge && modelP >= minProb;
      basis = "model+market";
      confidence = edge >= 0.10 ? "high" : edge >= 0.06 ? "medium" : "low";
    } else {
      // Model-only path — stricter thresholds
      const minProb = MODEL_ONLY_MIN_PROB + crossPenalty;
      qualifies = modelP >= minProb && formUsed && minFormSample >= MODEL_ONLY_MIN_SAMPLE;
      confidence = modelP >= 0.72 ? "high" : modelP >= 0.65 ? "medium" : "low";
    }

    if (!qualifies) continue;

    picks.push({
      market: "1X2",
      pick: sel,
      modelProb: round3(modelP),
      impliedProb: impP,
      edge,
      bookOdds: bookOddsForSel,
      modelOdds: fairOdds(modelP),
      confidence,
      basis,
      flags
    });
  }

  return picks;
}

function evaluateOU25(match) {
  const probs = match.aiAssessment?.markets?.["OU25"]?.probs;
  const model = match.aiAssessment?.model;
  if (!probs) return [];

  const isCrossLeague = Boolean(match.aiAssessment?.crossLeague);
  const formUsed = Boolean(model?.formUsed);
  const homeFormSample = Number(model?.homeFormSample || 0);
  const awayFormSample = Number(model?.awayFormSample || 0);
  const minFormSample = Math.min(homeFormSample, awayFormSample);

  const picks = [];

  for (const sel of ["over", "under"]) {
    const modelP = Number(probs[sel] || 0);
    if (!modelP) continue;

    const crossPenalty = isCrossLeague ? CROSS_LEAGUE_PENALTY : 0;
    const minProb = MODEL_ONLY_MIN_PROB + crossPenalty;
    if (modelP < minProb) continue;
    if (!formUsed || minFormSample < MODEL_ONLY_MIN_SAMPLE) continue;

    const flags = [];
    if (formUsed) flags.push("form_used");
    if (isCrossLeague) flags.push("cross_league");

    picks.push({
      market: "OU25",
      pick: sel,
      modelProb: round3(modelP),
      impliedProb: null,
      edge: null,
      bookOdds: null,
      modelOdds: fairOdds(modelP),
      confidence: modelP >= 0.72 ? "high" : "medium",
      basis: "model_only",
      flags
    });
  }

  return picks;
}

function evaluateBTTS(match) {
  const probs = match.aiAssessment?.markets?.["BTTS"]?.probs;
  const model = match.aiAssessment?.model;
  if (!probs) return [];

  const formUsed = Boolean(model?.formUsed);
  const minFormSample = Math.min(
    Number(model?.homeFormSample || 0),
    Number(model?.awayFormSample || 0)
  );

  const picks = [];

  for (const sel of ["yes", "no"]) {
    const modelP = Number(probs[sel] || 0);
    if (modelP < MODEL_ONLY_MIN_PROB) continue;
    if (!formUsed || minFormSample < MODEL_ONLY_MIN_SAMPLE) continue;

    const flags = [];
    if (formUsed) flags.push("form_used");

    picks.push({
      market: "BTTS",
      pick: sel,
      modelProb: round3(modelP),
      impliedProb: null,
      edge: null,
      bookOdds: null,
      modelOdds: fairOdds(modelP),
      confidence: modelP >= 0.72 ? "high" : "medium",
      basis: "model_only",
      flags
    });
  }

  return picks;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function deriveValueFromOdds(dayKey = athensDayKey()) {
  const oddsFile    = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  const outFile     = resolveDataPath("deploy-snapshots", dayKey, "value.json");
  const canonicalOut = resolveDataPath("value", `${dayKey}.json`);
  const snapshotDir  = resolveDataPath("deploy-snapshots", dayKey);
  const valueDir     = resolveDataPath("value");

  ensureDir(snapshotDir);
  ensureDir(valueDir);

  const oddsPayload = readJsonSafe(oddsFile);
  if (!oddsPayload || !Array.isArray(oddsPayload.matches)) {
    const result = { ok: false, date: dayKey, count: 0, picks: [], source: "no_odds_snapshot" };
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
    return result;
  }

  const picks = [];

  for (const match of oddsPayload.matches) {
    if (!match.aiAssessment?.markets) continue;

    const canonicalId = match.canonicalId
      || buildCanonicalId(match.leagueSlug, match.home, match.away, match.kickoffUtc)
      || match.matchId;

    const matchMeta = {
      canonicalId,
      matchId:    match.matchId,
      leagueSlug: match.leagueSlug,
      home:       match.home,
      away:       match.away,
      kickoffUtc: match.kickoffUtc
    };

    // Extract bookmaker 1X2 odds if available (market.current from opening)
    const bookOdds1X2 = match.market?.current || null;

    const marketPicks = [
      ...evaluate1X2(match, bookOdds1X2),
      ...evaluateOU25(match),
      ...evaluateBTTS(match)
    ];

    for (const p of marketPicks) {
      picks.push({ ...matchMeta, ...p });
    }
  }

  // Sort: model+market first, then by confidence desc, then by modelProb desc
  picks.sort((a, b) => {
    if (a.basis !== b.basis) return a.basis === "model+market" ? -1 : 1;
    const cOrder = { high: 0, medium: 1, low: 2 };
    const cd = (cOrder[a.confidence] ?? 3) - (cOrder[b.confidence] ?? 3);
    if (cd !== 0) return cd;
    return (b.modelProb || 0) - (a.modelProb || 0);
  });

  const result = {
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    count: picks.length,
    source: "derive-value-from-odds",
    withMarket:    picks.filter(p => p.basis === "model+market").length,
    modelOnly:     picks.filter(p => p.basis === "model_only").length,
    highConfidence: picks.filter(p => p.confidence === "high").length,
    picks
  };

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  // Also write to the canonical value path so exportDeploySnapshotDay reads it correctly
  fs.writeFileSync(canonicalOut, JSON.stringify(result, null, 2), "utf8");

  return result;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  const r = deriveValueFromOdds(arg);
  console.log(JSON.stringify({
    ok: r.ok, date: r.date, count: r.count,
    withMarket: r.withMarket, modelOnly: r.modelOnly,
    highConfidence: r.highConfidence,
    topPicks: r.picks.slice(0, 5).map(p =>
      `${p.home} v ${p.away} | ${p.market} ${p.pick} | prob=${p.modelProb} edge=${p.edge ?? "-"} [${p.confidence}]`
    )
  }, null, 2));
}
