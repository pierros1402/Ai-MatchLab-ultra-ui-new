import express from "express";
import { athensDayKey, shiftDay } from "./core/daykey.js";
import { ingestDay } from "./jobs/ingest-day.js";
import { finalizeDayIfSafe } from "./jobs/finalize-day.js";
import { auditWindow } from "./jobs/audit-window.js";
import { discoverActiveLeagues } from "./jobs/discover-active-leagues.js";
import { monitorActiveLeagues } from "./jobs/monitor-active-leagues.js";
import { runDailyCycle } from "./jobs/run-daily-cycle.js";
import { discoverWindow } from "./jobs/discover-window.js";
import { buildFixturesRuntime } from "./api/fixtures-runtime.js";
import { getFixtureById, getActiveByDay } from "./storage/json-db.js";
import { evaluateMatchValue } from "./core/value-engine-v1.js";

const app = express();
const PORT = 3010;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

function intParam(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolParam(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function isPlayable(match) {
  if (!match) return false;
  if (!match.homeTeam || !match.awayTeam) return false;
  if (!match.kickoffUtc) return false;

  const s = String(match.status || "").toUpperCase();

  if (s.includes("POSTPONED")) return false;
  if (s.includes("CANCELLED")) return false;

  return true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "engine-v1" });
});

app.get("/fixtures-runtime", (req, res) => {
  const mode = String(req.query.mode || "today");
  const dayKey = String(req.query.date || athensDayKey());

  const rows = buildFixturesRuntime(mode, dayKey);

  res.json({
    ok: true,
    mode,
    date: dayKey,
    count: rows.length,
    matches: rows
  });
});

app.get("/value-picks", async (req, res) => {
  const date = String(req.query.date || athensDayKey());
  const matches = getActiveByDay(date);
  const picks = [];

  for (const match of matches) {
    if (!isPlayable(match)) continue;

    try {
      const value = await evaluateMatchValue(match);
      if (!value) continue;

      picks.push({
        matchId: match.matchId,
        leagueSlug: match.leagueSlug,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoff: match.kickoffUtc,

        homeWinScore: value.homeWinScore ?? null,
        drawScore: value.drawScore ?? null,
        awayWinScore: value.awayWinScore ?? null,

        over25Score: value.over25Score ?? null,
        bttsScore: value.bttsScore ?? null,

        confidence: value.confidence ?? null,
        signals: value.signals ?? [],
        modifiers: value.modifiers ?? {},
        context: value.context ?? {},
        meta: value.meta ?? {}
      });
    } catch (err) {
      console.warn("[value-picks] failed", match.matchId, err?.message || err);
    }
  }

  res.json({
    ok: true,
    date,
    count: picks.length,
    picks
  });
});

app.get("/ingest", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await ingestDay(dayKey);
  res.json({ ok: true, ...result });
});

app.get("/finalize", (req, res) => {
  const dayKey = String(req.query.date || shiftDay(athensDayKey(), -1));
  const result = finalizeDayIfSafe(dayKey);
  res.json(result);
});

app.get("/audit-window", async (req, res) => {
  const baseDay = String(req.query.date || athensDayKey());

  const result = await auditWindow({
    baseDay,
    daysBack: intParam(req.query.daysBack, 1),
    daysForward: intParam(req.query.daysForward, 1),
    includeMatches: boolParam(req.query.includeMatches, false),
    leagueLimit: intParam(req.query.leagueLimit, 0),
    concurrency: intParam(req.query.concurrency, 8),
    nonZeroOnly: boolParam(req.query.nonZeroOnly, true)
  });

  res.json({ ok: true, ...result });
});

app.get("/match", (req, res) => {
  const id = String(req.query.id || "");

  if (!id) {
    res.status(400).json({ ok: false, error: "missing_id" });
    return;
  }

  const match = getFixtureById(id);

  if (!match) {
    res.status(404).json({ ok: false, error: "match_not_found" });
    return;
  }

  res.json({
    ok: true,
    match
  });
});

app.get("/discover-active-leagues", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await discoverActiveLeagues(dayKey);
  res.json({ ok: true, ...result });
});

app.get("/monitor-active-leagues", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await monitorActiveLeagues(dayKey);
  res.json(result);
});

app.get("/run-daily-cycle", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const doFinalize = boolParam(req.query.finalize, true);
  const daysForward = intParam(req.query.daysForward, 2);

  const result = await runDailyCycle({
    dayKey,
    doFinalize,
    daysForward
  });

  res.json(result);
});

app.get("/discover-window", async (req, res) => {
  const baseDay = String(req.query.date || athensDayKey());

  const result = await discoverWindow({
    baseDay,
    daysBack: intParam(req.query.daysBack, 0),
    daysForward: intParam(req.query.daysForward, 3)
  });

  res.json(result);
});

const command = process.argv[2];

if (command === "ingest-today") {
  const result = await ingestDay(athensDayKey());
  console.log(result);
  process.exit(0);
}

if (command === "ingest-yesterday") {
  const result = await ingestDay(shiftDay(athensDayKey(), -1));
  console.log(result);
  process.exit(0);
}

if (command === "finalize-yesterday") {
  const result = finalizeDayIfSafe(shiftDay(athensDayKey(), -1));
  console.log(result);
  process.exit(0);
}

if (command === "audit-window") {
  const result = await auditWindow({
    baseDay: athensDayKey(),
    daysBack: 1,
    daysForward: 1,
    includeMatches: false,
    leagueLimit: 0,
    concurrency: 8,
    nonZeroOnly: true
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "discover-active-leagues") {
  const result = await discoverActiveLeagues(athensDayKey());
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "monitor-active-leagues") {
  const result = await monitorActiveLeagues(athensDayKey());
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "run-daily-cycle") {
  const result = await runDailyCycle({
    dayKey: athensDayKey(),
    doFinalize: false
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "discover-window") {
  const result = await discoverWindow({
    baseDay: athensDayKey(),
    daysBack: 0,
    daysForward: 3
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

app.listen(PORT, () => {
  console.log(`engine-v1 listening on http://localhost:${PORT}`);
});