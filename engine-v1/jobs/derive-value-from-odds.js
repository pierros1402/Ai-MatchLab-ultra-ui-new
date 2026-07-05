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
 *   source: "derive-value-from-model-assessment",
    policyVersion: "value-policy-v2.3",
    sourceContract: {
      valueInput: "odds_memory_ai_assessment",
      deploySnapshotInput: false,
      realBookmakerOddsUsed: false,
      note: "Transitional model-assessment bridge; value reads aiAssessment from memory, not deploy snapshot odds.json."
    },
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
import { getOddsForDay } from "../storage/odds-memory-db.js";
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


function confidenceRank(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "high") return 0;
  if (normalized === "medium") return 1;
  if (normalized === "low") return 2;
  return 9;
}

function valuePickStrength(pick) {
  return {
    confidenceScore: confidenceRank(pick?.confidence),
    modelProb: Number(pick?.modelProb || 0)
  };
}

function compareValuePicks(a, b) {
  const aa = valuePickStrength(a);
  const bb = valuePickStrength(b);

  if (aa.confidenceScore !== bb.confidenceScore) {
    return aa.confidenceScore - bb.confidenceScore;
  }

  if (bb.modelProb !== aa.modelProb) {
    return bb.modelProb - aa.modelProb;
  }

  return String(a?.market || "").localeCompare(String(b?.market || ""));
}

function pickMatchKey(pick) {
  return String(
    pick?.canonicalId ||
    pick?.matchId ||
    `${pick?.leagueSlug || "unknown"}::${pick?.home || "home"}::${pick?.away || "away"}::${pick?.kickoffUtc || ""}`
  );
}

function normalizeMarket(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[./-]/g, "_");
}

function normalizeSelection(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function goalLineFromPick(pick) {
  const market = normalizeMarket(pick?.market);
  const raw = `${market}_${normalizeSelection(pick?.pick)}`;

  if (raw.includes("15") || raw.includes("1_5")) return "1.5";
  if (raw.includes("25") || raw.includes("2_5")) return "2.5";
  if (raw.includes("35") || raw.includes("3_5")) return "3.5";

  return null;
}

function isOverPick(pick) {
  const selection = normalizeSelection(pick?.pick);
  const market = normalizeMarket(pick?.market);
  return selection === "over" || market.startsWith("OVER");
}

function isUnderPick(pick) {
  const selection = normalizeSelection(pick?.pick);
  const market = normalizeMarket(pick?.market);
  return selection === "under" || market.startsWith("UNDER");
}

function isOver15Pick(pick) {
  return isOverPick(pick) && goalLineFromPick(pick) === "1.5";
}

function isOver25HighPick(pick) {
  return isOverPick(pick) && goalLineFromPick(pick) === "2.5" && String(pick?.confidence || "").toLowerCase() === "high";
}

function contradictionSlot(pick) {
  const market = normalizeMarket(pick?.market);
  const line = goalLineFromPick(pick);

  if (market.includes("BTTS")) return "BTTS";
  if (market.includes("1X2") || market === "MATCH_RESULT" || market === "RESULT") return "1X2";
  if (market.includes("DOUBLE_CHANCE") || market === "DC") return "DOUBLE_CHANCE";
  if (line && (isOverPick(pick) || isUnderPick(pick))) return `GOALS_${line}`;

  return market || "UNKNOWN";
}

function contradictionSelection(pick) {
  const market = normalizeMarket(pick?.market);
  const selection = normalizeSelection(pick?.pick);

  if (isOverPick(pick)) return "over";
  if (isUnderPick(pick)) return "under";
  if (market.includes("BTTS")) return selection;
  if (market.includes("1X2") || market === "MATCH_RESULT" || market === "RESULT") return selection;
  if (market.includes("DOUBLE_CHANCE") || market === "DC") return selection;

  return selection || "unknown";
}

function makeRejectedLedgerRow(pick, reasonCode) {
  return {
    matchId: pick?.matchId || null,
    canonicalId: pick?.canonicalId || null,
    leagueSlug: pick?.leagueSlug || null,
    home: pick?.home || null,
    away: pick?.away || null,
    market: pick?.market || null,
    pick: pick?.pick || null,
    status: "rejected",
    reasonCode,
    modelProb: pick?.modelProb ?? null,
    confidence: pick?.confidence ?? null,
    basis: pick?.basis || null
  };
}

function filterContradictoryAndRedundantValuePicks(candidatePicks) {
  const byMatch = new Map();

  for (const pick of candidatePicks || []) {
    const key = pickMatchKey(pick);
    if (!byMatch.has(key)) byMatch.set(key, []);
    byMatch.get(key).push(pick);
  }

  const accepted = [];
  const rejected = [];

  for (const group of byMatch.values()) {
    const sorted = [...group].sort(compareValuePicks);
    const hasOver25High = sorted.some(isOver25HighPick);
    const seenSlots = new Map();

    for (const pick of sorted) {
      if (hasOver25High && isOver15Pick(pick)) {
        rejected.push(makeRejectedLedgerRow(
          pick,
          "redundant_lower_goal_line_suppressed_by_over25_high"
        ));
        continue;
      }

      const slot = contradictionSlot(pick);
      const selection = contradictionSelection(pick);
      const previous = seenSlots.get(slot);

      if (!previous) {
        seenSlots.set(slot, {
          selection,
          pick
        });
        accepted.push(pick);
        continue;
      }

      if (previous.selection === selection) {
        rejected.push(makeRejectedLedgerRow(
          pick,
          "duplicate_same_market_selection_suppressed"
        ));
        continue;
      }

      rejected.push(makeRejectedLedgerRow(
        pick,
        "contradictory_value_pick_suppressed"
      ));
    }
  }

  return {
    picks: accepted.sort(compareValuePicks),
    rejected
  };
}


function isOutOfScopeValueLeague(pick) {
  const league = String(pick?.leagueSlug || "").toLowerCase();

  if (!league) return true;

  if (league.startsWith("fs.")) return true;
  if (league.includes("copa")) return true;
  if (league.includes("cup")) return true;
  if (league.includes("friendly")) return true;
  if (league.includes("u20")) return true;
  if (league.includes("u19")) return true;
  if (league.includes("reserve")) return true;

  return false;
}

function strictValuePolicyRejectionReason(pick) {
  const market = normalizeMarket(pick?.market);
  const selection = normalizeSelection(pick?.pick);
  const modelProb = Number(pick?.modelProb || 0);
  const confidence = String(pick?.confidence || "").toLowerCase();

  if (isOutOfScopeValueLeague(pick)) {
    return "out_of_scope_league_suppressed";
  }

  if (market === "OU25" && selection === "under") {
    if (confidence !== "high" || modelProb < 0.78) {
      return "under25_strict_gate_failed";
    }
  }

  if (market === "OU25" && selection === "over") {
    if (confidence !== "high") {
      return "ordinary_medium_over25_excluded";
    }
  }

  if (market === "BTTS") {
    if (confidence !== "high") {
      return "ordinary_medium_btts_excluded";
    }
  }

  if ((market.includes("1X2") || market === "MATCH_RESULT" || market === "RESULT") && confidence !== "high") {
    return "one_x_two_not_strong_enough";
  }

  return null;
}

function applyStrictValuePolicy(candidatePicks) {
  const accepted = [];
  const rejected = [];

  for (const pick of candidatePicks || []) {
    const reason = strictValuePolicyRejectionReason(pick);

    if (reason) {
      rejected.push(makeRejectedLedgerRow(pick, reason));
      continue;
    }

    accepted.push(pick);
  }

  return {
    picks: accepted,
    rejected
  };
}
function enrichValuePick(pick) {
  const reasonCodes = Array.isArray(pick?.reasonCodes) ? pick.reasonCodes : [];
  const riskFlags = Array.isArray(pick?.riskFlags) ? pick.riskFlags : [];

  return {
    ...pick,
    policyVersion: "value-policy-v2.3",
    reasonCodes: [
      ...new Set([
        ...reasonCodes,
        "passed_model_probability_gate",
        "passed_strict_value_policy",
        "passed_non_contradictory_value_filter"
      ])
    ],
    riskFlags: [
      ...new Set([
        ...riskFlags,
        "context_coverage_not_bound_to_value_pick",
        "lineups_missing",
        "referee_missing",
        "weather_missing",
        "xg_missing"
      ])
    ],
    dataCoverage: {
      modelAssessment: pick?.modelProb ? "available" : "missing",
      odds: "not_used",
      standings: "partial",
      form: Array.isArray(pick?.flags) && pick.flags.includes("form_used") ? "available" : "partial",
      h2h: "missing",
      teamNews: "missing",
      playerUsage: "missing",
      travel: "missing",
      lineups: "missing",
      referee: "missing",
      weather: "missing",
      xg: "missing"
    }
  };
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows || []) {
    const key = String(keyFn(row) || "unknown");
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildCandidateLedger(candidatePicks, finalPicks, rejectedRows) {
  const approvedKeys = new Set(
    finalPicks.map((pick) => `${pickMatchKey(pick)}::${pick.market}::${pick.pick}`)
  );

  const rows = (candidatePicks || []).map((pick) => {
    const key = `${pickMatchKey(pick)}::${pick.market}::${pick.pick}`;

    return {
      matchId: pick?.matchId || null,
      canonicalId: pick?.canonicalId || null,
      leagueSlug: pick?.leagueSlug || null,
      home: pick?.home || null,
      away: pick?.away || null,
      market: pick?.market || null,
      pick: pick?.pick || null,
      status: approvedKeys.has(key) ? "approved" : "rejected",
      reasonCode: approvedKeys.has(key)
        ? "passed_non_contradictory_value_filter"
        : "filtered_by_value_policy",
      modelProb: pick?.modelProb ?? null,
      confidence: pick?.confidence ?? null,
      basis: pick?.basis || null
    };
  });

  const explicitRejected = rejectedRows || [];

  for (const rejected of explicitRejected) {
    const idx = rows.findIndex((row) =>
      row.status === "rejected" &&
      row.matchId === rejected.matchId &&
      row.market === rejected.market &&
      row.pick === rejected.pick
    );

    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        reasonCode: rejected.reasonCode
      };
    } else {
      rows.push(rejected);
    }
  }

  return rows;
}

function buildValueAudit({
  dayKey,
  sourceMatches,
  candidatePicks,
  finalPicks,
  rejectedRows,
  sourceContract,
  inputFailure = null
}) {
  const candidateLedger = buildCandidateLedger(candidatePicks, finalPicks, rejectedRows);
  const rejected = candidateLedger.filter((row) => row.status === "rejected");
  const approved = candidateLedger.filter((row) => row.status === "approved");

  return {
    ok: true,
    schema: "ai-matchlab.value-audit.v1",
    policyVersion: "value-policy-v2.3",
    generatedAt: new Date().toISOString(),
    date: dayKey,
    source: "derive-value-from-model-assessment",
    sourceContract,
    inputFailure,
    summary: {
      fixturesSeen: Array.isArray(sourceMatches) ? sourceMatches.length : 0,
      candidateMarkets: candidatePicks.length,
      approved: approved.length,
      rejected: rejected.length,
      approvedByMarket: countBy(approved, row => row.market),
      rejectedByMarket: countBy(rejected, row => row.market),
      rejectedByReason: countBy(rejected, row => row.reasonCode),
      approvedByLeague: countBy(approved, row => row.leagueSlug),
      rejectedByLeague: countBy(rejected, row => row.leagueSlug)
    },
    candidateLedger
  };
}

function writeJsonFile(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}
export function deriveValueFromOdds(dayKey = athensDayKey(), { freeze = false } = {}) {
  const outFile = resolveDataPath("deploy-snapshots", dayKey, "value.json");
  const canonicalOut = resolveDataPath("value", `${dayKey}.json`);
  const canonicalAuditOut = resolveDataPath("value", "_audit", `${dayKey}.json`);
  const snapshotAuditOut = resolveDataPath("deploy-snapshots", dayKey, "value-audit.json");
  const snapshotDir = resolveDataPath("deploy-snapshots", dayKey);
  const valueDir = resolveDataPath("value");

  ensureDir(snapshotDir);
  ensureDir(valueDir);
  ensureDir(path.dirname(canonicalAuditOut));

  const sourceContract = {
    valueInput: "odds_memory_ai_assessment",
    deploySnapshotInput: false,
    realBookmakerOddsUsed: false,
    note: "Transitional model-assessment bridge; value reads aiAssessment from memory, not deploy snapshot odds.json."
  };

  if (freeze) {
    const existing = readJsonSafe(outFile, null);
    if (existing && Array.isArray(existing.picks) && existing.picks.length > 0) {
      return existing;
    }
  }

  const oddsPayload = getOddsForDay(dayKey);
  const sourceMatches = Array.isArray(oddsPayload?.matches) ? oddsPayload.matches : [];

  if (sourceMatches.length === 0) {
    const result = {
      ok: false,
      date: dayKey,
      count: 0,
      picks: [],
      source: "no_model_assessment_memory",
      policyVersion: "value-policy-v2.3",
      reasonCodes: ["missing_model_assessment_memory"],
      riskFlags: ["no_value_input"],
      sourceContract,
      audit: {
        canonical: `data/value/_audit/${dayKey}.json`,
        snapshot: `data/deploy-snapshots/${dayKey}/value-audit.json`
      }
    };

    const audit = buildValueAudit({
      dayKey,
      sourceMatches,
      candidatePicks: [],
      finalPicks: [],
      rejectedRows: [],
      sourceContract,
      inputFailure: "missing_model_assessment_memory"
    });

    writeJsonFile(canonicalAuditOut, audit);
    writeJsonFile(snapshotAuditOut, audit);
    writeJsonFile(canonicalOut, result);
    writeJsonFile(outFile, result);

    return result;
  }

  const candidatePicks = [];

  for (const match of sourceMatches) {
    if (!match.aiAssessment?.markets) continue;

    const canonicalId = match.canonicalId
      || buildCanonicalId(match.leagueSlug, match.home, match.away, match.dayKey || match.kickoffUtc)
      || match.matchId;

    const base = {
      canonicalId,
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      home: match.home,
      away: match.away,
      kickoffUtc: match.kickoffUtc,
      type: "model_lean"
    };

    const marketPicks = [
      evaluate1X2(match),
      evaluateOU25(match),
      evaluateBTTS(match)
    ]
      .flatMap(candidate => Array.isArray(candidate) ? candidate : [candidate])
      .filter(candidate =>
        candidate &&
        typeof candidate === "object" &&
        candidate.market &&
        candidate.pick &&
        Number.isFinite(Number(candidate.modelProb))
      )
      .map(pick => ({
        ...base,
        ...pick
      }));

    candidatePicks.push(...marketPicks);
  }

  candidatePicks.sort(compareValuePicks);

  const strictPolicy = applyStrictValuePolicy(candidatePicks);
  const filtered = filterContradictoryAndRedundantValuePicks(strictPolicy.picks);
  const finalPicks = filtered.picks.map(enrichValuePick);
  const rejectedRows = [
    ...strictPolicy.rejected,
    ...filtered.rejected
  ];

  const audit = buildValueAudit({
    dayKey,
    sourceMatches,
    candidatePicks,
    finalPicks,
    rejectedRows,
    sourceContract
  });

  const result = {
    ok: true,
    date: dayKey,
    count: finalPicks.length,
    source: "derive-value-from-model-assessment",
    policyVersion: "value-policy-v2.3",
    sourceContract,
    audit: {
      canonical: `data/value/_audit/${dayKey}.json`,
      snapshot: `data/deploy-snapshots/${dayKey}/value-audit.json`
    },
    verifiedValue: 0,
    modelLean: finalPicks.length,
    bookEdge: 0,
    highConfidence: finalPicks.filter(p => p.confidence === "high").length,
    mediumConfidence: finalPicks.filter(p => p.confidence === "medium").length,
    picks: finalPicks
  };

  writeJsonFile(canonicalAuditOut, audit);
  writeJsonFile(snapshotAuditOut, audit);
  writeJsonFile(canonicalOut, result);
  writeJsonFile(outFile, result);

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




