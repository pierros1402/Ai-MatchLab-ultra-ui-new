/**
 * derive-value-from-odds.js
 *
 * Reads odds.json ONLY to obtain each match's `aiAssessment` (our pure-stats
 * Poisson-over-standings model + form + xG) and turns those model probabilities
 * into value.json picks.
 *
 * FIREWALL: real (scraped bookmaker) odds NEVER participate in value. Picks
 * qualify purely on model probability — no edge, no implied probability, no
 * bookmaker price. Real odds are display-only (opening→current drift) and live
 * exclusively in the odds panels. (The filename is legacy; it is a model→value
 * bridge, not an odds→value one.)
 *
 * Thresholds (model-only — conservative, precision over recall):
 *     MIN_PROB    = 0.65   (model prob must be at least 65%)
 *     formSample ≥ 3 for both sides (enough evidence)
 *     crossLeague penalty: MIN_PROB += 0.05 (less reliable attribution)
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
 *       impliedProb,    always null (odds never enter value)
 *       edge,           always null (odds never enter value)
 *       bookOdds,       always null (odds never enter value)
 *       modelOdds,      our fair decimal odds
 *       confidence,     "high" | "medium"
 *       basis,          "model_only"
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

// ── Thresholds (model-only — real odds never participate in value) ──────────────
const MODEL_ONLY_MIN_PROB   = 0.65;
const MODEL_ONLY_MIN_SAMPLE = 3;
const CROSS_LEAGUE_PENALTY  = 0.05;

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function round3(v) { return Math.round(v * 1000) / 1000; }

// Fair (no-margin) decimal odds from probability
function fairOdds(prob) {
  if (!prob || prob <= 0 || prob >= 1) return null;
  return round3(1 / prob);
}

// ── Per-market selectors ──────────────────────────────────────────────────────

// FIREWALL: value picks are derived PURELY from the statistical model
// (aiAssessment), never from real bookmaker odds. 1X2 qualifies on model
// probability alone — identical treatment to OU25/BTTS. Real scraped odds are
// display-only (opening→current drift) and live exclusively in the odds panels.
function evaluate1X2(match) {
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

    const crossPenalty = isCrossLeague ? CROSS_LEAGUE_PENALTY : 0;
    const minProb = MODEL_ONLY_MIN_PROB + crossPenalty;
    if (modelP < minProb) continue;
    if (!formUsed || minFormSample < MODEL_ONLY_MIN_SAMPLE) continue;

    const flags = [];
    if (formUsed) flags.push("form_used");
    if (xgUsed)   flags.push("xg_used");
    if (isCrossLeague) flags.push("cross_league");

    picks.push({
      type: "model_lean",
      market: "1X2",
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
      type: "model_lean",
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
      type: "model_lean",
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

export function deriveValueFromOdds(dayKey = athensDayKey(), { freeze = false } = {}) {
  const oddsFile    = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  const outFile     = resolveDataPath("deploy-snapshots", dayKey, "value.json");
  const canonicalOut = resolveDataPath("value", `${dayKey}.json`);
  const snapshotDir  = resolveDataPath("deploy-snapshots", dayKey);
  const valueDir     = resolveDataPath("value");

  ensureDir(snapshotDir);
  ensureDir(valueDir);

  // FREEZE-ONCE GUARD (odds↔value firewall): the value panel is computed once
  // per day and must NOT change when odds refresh through the day. Callers on
  // the intraday odds-refresh path pass { freeze: true }: if today's value.json
  // already has picks, return it untouched instead of re-deriving from newer
  // odds. An empty snapshot is still allowed to be filled (e.g. the morning run
  // produced 0 picks because odds had not arrived yet).
  if (freeze) {
    const existing = readJsonSafe(outFile);
    if (existing && Array.isArray(existing.picks) && existing.picks.length > 0) {
      return { ...existing, frozen: true };
    }
  }

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
      || buildCanonicalId(match.leagueSlug, match.home, match.away, match.dayKey || match.kickoffUtc)
      || match.matchId;

    const matchMeta = {
      canonicalId,
      matchId:    match.matchId,
      leagueSlug: match.leagueSlug,
      home:       match.home,
      away:       match.away,
      kickoffUtc: match.kickoffUtc
    };

    // FIREWALL: real odds (match.market.current) are NOT read here — value is
    // model-only. Odds remain display-only in the odds panels.
    const marketPicks = [
      ...evaluate1X2(match),
      ...evaluateOU25(match),
      ...evaluateBTTS(match)
    ];

    for (const p of marketPicks) {
      picks.push({ ...matchMeta, ...p });
    }
  }

  // Sort: confidence desc, then by modelProb desc (all picks are model-only)
  picks.sort((a, b) => {
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
    // All picks are model-only (odds never enter value). Kept for downstream readers.
    verifiedValue:  0,
    modelLean:      picks.length,
    withMarket:     0,
    modelOnly:      picks.length,
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
