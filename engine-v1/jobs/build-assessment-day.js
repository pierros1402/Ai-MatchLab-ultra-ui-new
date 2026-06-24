/**
 * build-assessment-day.js
 *
 * Builds AI Poisson assessments for a given date's canonical fixtures.
 * - First run: freezes opening assessment (openAssessment + openedAt)
 * - Subsequent runs: compares, sets revised:true if any 1X2 prob shifts >THRESHOLD
 * - Writes to data/assessments/{date}.json
 *
 * Called by prefetchUpcomingOdds() after odds fetch, for D+1..D+6.
 * Also callable standalone: node engine-v1/jobs/build-assessment-day.js 2026-07-03
 */

import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";
import { priceMatchFromStandings } from "../odds/ai-odds-model.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { readLeagueState } from "../storage/league-memory-db.js";
import { teamFormRates } from "../storage/results-memory-db.js";
import { teamXgRates } from "../storage/discipline-memory-db.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";
import { normalizeTeamKey as normalizeTeam } from "../core/normalize.js";

const REVISION_THRESHOLD = 0.05; // flag REVISED if any 1X2 prob shifts >5pp

function tokenJaccard(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

function buildLeagueIndex() {
  const dir = resolveDataPath("league-memory", "standings");
  const leagues = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /**/ }

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (readLeagueState(slug)?.state !== "active") continue;
    const rows = readStandings(slug)?.accepted?.rows;
    if (!Array.isArray(rows) || rows.length < 4) continue;

    const teams = [];
    for (const r of rows) {
      for (const cand of resolveAliasCandidates(slug, r.teamName)) {
        const n = normalizeTeam(cand);
        if (n) teams.push({ norm: n, row: r });
      }
    }
    let gf = 0, pld = 0;
    for (const r of rows) { gf += Number(r.goalsFor) || 0; pld += Number(r.played) || 0; }
    leagues.push({ slug, teams, leagueAvg: pld > 0 ? gf / pld : 1.35 });
  }
  return leagues;
}

function findTeam(name, teams) {
  const norm = normalizeTeam(name);
  if (!norm) return null;
  let best = null, bestScore = 0;
  for (const t of teams) {
    const s = t.norm === norm ? 1 : tokenJaccard(norm, t.norm);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return bestScore >= 0.6 ? best : null;
}

function attributeMatch(home, away, leagues) {
  let best = null, bestScore = 0;
  for (const lg of leagues) {
    const h = findTeam(home, lg.teams);
    const a = findTeam(away, lg.teams);
    if (!h || !a) continue;
    const s = (tokenJaccard(normalizeTeam(home), h.norm) + tokenJaccard(normalizeTeam(away), a.norm)) / 2;
    if (s > bestScore) { bestScore = s; best = { slug: lg.slug, home: h.row, away: a.row, leagueAvg: lg.leagueAvg }; }
  }
  return bestScore >= 0.5 ? best : null;
}

function loadCanonicalFixtures(dateStr) {
  const dir = resolveDataPath("canonical-fixtures", dateStr);
  const fixtures = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { return []; }

  for (const file of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const fx of (j.fixtures || [])) {
        if (fx.homeTeam && fx.awayTeam) fixtures.push(fx);
      }
    } catch { /**/ }
  }
  return fixtures;
}

function maxProbShift(prev, curr) {
  const keys = ["home", "draw", "away"];
  let max = 0;
  for (const k of keys) {
    const d = Math.abs((curr[k] || 0) - (prev[k] || 0));
    if (d > max) max = d;
  }
  return max;
}

export async function buildAssessmentDay(dateStr) {
  const outPath = resolveDataPath("assessments", `${dateStr}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const fixtures = loadCanonicalFixtures(dateStr);
  if (!fixtures.length) return { date: dateStr, assessed: 0, skipped: 0 };

  const leagues = buildLeagueIndex();

  // Load existing data (for opening freeze + revision detection)
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outPath, "utf8")).matches || {}; } catch { /**/ }

  const matches = {};
  let assessed = 0, skipped = 0;

  for (const fx of fixtures) {
    const matchId = String(fx.matchId || "");
    if (!matchId) { skipped++; continue; }

    const hit = attributeMatch(fx.homeTeam, fx.awayTeam, leagues);
    if (!hit) { skipped++; continue; }

    const homeForm = teamFormRates(hit.slug, fx.homeTeam);
    const awayForm = teamFormRates(hit.slug, fx.awayTeam);
    const homeXg   = teamXgRates(hit.slug, fx.homeTeam);
    const awayXg   = teamXgRates(hit.slug, fx.awayTeam);

    const priced = priceMatchFromStandings(hit.home, hit.away, {
      leagueAvgGoalsPerTeam: hit.leagueAvg,
      homeForm, awayForm, homeXg, awayXg
    });

    const curr1X2probs = priced.markets["1X2"].probs;

    const prev = existing[matchId];
    let openAssessment = prev?.openAssessment || null;
    let openedAt = prev?.openedAt || null;
    let revised = false;

    if (!openAssessment) {
      // First capture — freeze as opening
      openAssessment = curr1X2probs;
      openedAt = Date.now();
    } else {
      // Compare with opening — flag REVISED if significant shift
      const shift = maxProbShift(openAssessment, curr1X2probs);
      if (shift >= REVISION_THRESHOLD) revised = true;
    }

    matches[matchId] = {
      matchId,
      homeTeam:   fx.homeTeam,
      awayTeam:   fx.awayTeam,
      kickoffUtc: fx.kickoffUtc || "",
      leagueSlug: hit.slug,
      leagueName: fx.leagueName || "",
      openedAt,
      assessedAt: Date.now(),
      revised,
      openAssessment,
      currentAssessment: curr1X2probs,
      markets: priced.markets,
      model:   priced.model,
    };
    assessed++;
  }

  const payload = {
    date: dateStr,
    updatedAt: Date.now(),
    assessed,
    skipped,
    matches,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { date: dateStr, assessed, skipped, revised: Object.values(matches).filter(m => m.revised).length };
}

// CLI: node engine-v1/jobs/build-assessment-day.js 2026-07-03
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  buildAssessmentDay(date).then(r => console.log("[build-assessment-day]", r));
}
