import express from "express";
import ExcelJS from "exceljs";
import { athensDayKey, shiftDay } from "./core/daykey.js";
import { ingestDay } from "./jobs/ingest-day.js";
import { finalizeDayIfSafe } from "./jobs/finalize-day.js";
import { auditWindow } from "./jobs/audit-window.js";
import { discoverActiveLeagues } from "./jobs/discover-active-leagues.js";
import { monitorActiveLeagues } from "./jobs/monitor-active-leagues.js";
import { runDailyCycle } from "./jobs/run-daily-cycle.js";
import { discoverWindow } from "./jobs/discover-window.js";
import { buildFixturesRuntime } from "./api/fixtures-runtime.js";
import { getFixtureById } from "./storage/json-db.js";
import { buildValueDay } from "./core/build-value-day.js";
import { buildDetailsDay } from "./jobs/build-details-day.js";
import { getDetailsPayload } from "./api/details.js";
import { buildMatchIntelligence } from "./core/build-match-intelligence.js";
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3010;


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


function shouldIncludeValuePick(p) {
  const market = String(p?.market ?? p?.marketName ?? "").trim();
  const scoreNum = Number(p?.score);

  if (!Number.isFinite(scoreNum)) return false;

  if (market === "Over / Under 1.5") {
    return scoreNum >= 0.70;
  }

  if (market === "Over / Under 3.5") {
    return scoreNum >= 0.64;
  }

  if (market === "BTTS") {
    return scoreNum >= 0.64;
  }

  if (market === "1X2") {
    return scoreNum >= 0.64;
  }

  if (market === "Over / Under 2.5") {
    return scoreNum >= 0.58;
  }

  return false;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function dateRange(from, to) {
  const out = [];
  const [fy, fm, fd] = String(from).split("-").map(Number);
  const [ty, tm, td] = String(to).split("-").map(Number);

  const start = new Date(Date.UTC(fy, fm - 1, fd, 12, 0, 0));
  const end = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }

  return out;
}


app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "engine-v1" });
});

app.get("/fixtures-runtime", (req, res) => {
  try {
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
  } catch (err) {
    console.error("[fixtures-runtime] failed", err?.message || err);

    res.status(503).json({
      ok: false,
      error: "fixtures_runtime_unavailable",
      message: String(err?.message || err)
    });
  }
});



app.get("/value-picks", async (req, res) => {
  const date = String(req.query.date || athensDayKey());
  const rebuild = boolParam(req.query.rebuild, false);

  const result = await buildValueDay(date, { rebuild });
  res.json(result);
});

app.get("/value-export/range", async (req, res) => {
  const from = String(req.query.from || athensDayKey());
  const to = String(req.query.to || from);
  const format = String(req.query.format || "csv").toLowerCase();
  const days = dateRange(from, to);
  const rebuild = boolParam(req.query.rebuild, false);

  const rows = [];

  for (const date of days) {
    const result = await buildValueDay(date, { rebuild });
    const filtered = result.picks.filter(shouldIncludeValuePick);


    for (const p of filtered) {
      rows.push({
        date,
        kickoff: p.kickoff,
        league: p.leagueSlug,
        home: p.homeTeam,
        away: p.awayTeam,
        market: p.market,
        pick: p.pick,
        score: p.score,
        confidence: p.confidence
      });
    }
  }

if (format === "json") {
  return res.json({
    ok: true,
    from,
    to,
    count: rows.length,
    picks: rows
  });
}

if (format === "xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Value Picks");

  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Kickoff", key: "kickoff", width: 22 },
    { header: "League", key: "league", width: 16 },
    { header: "Home", key: "home", width: 24 },
    { header: "Away", key: "away", width: 24 },
    { header: "Market", key: "market", width: 20 },
    { header: "Pick", key: "pick", width: 16 },
    { header: "Score", key: "score", width: 10 },
    { header: "Confidence", key: "confidence", width: 12 }
  ];

  for (const row of rows) {
    sheet.addRow({
      date: row.date,
      kickoff: row.kickoff,
      league: row.league,
      home: row.home,
      away: row.away,
      market: row.market,
      pick: row.pick,
      score: Number(row.score),
      confidence: Number(row.confidence)
    });
  }

  // Header style
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  // Alignment by column
  ["A", "B", "C", "F", "G", "H", "I"].forEach((col) => {
    sheet.getColumn(col).alignment = {
      vertical: "middle",
      horizontal: "center"
    };
  });

  ["D", "E"].forEach((col) => {
    sheet.getColumn(col).alignment = {
      vertical: "middle",
      horizontal: "left"
    };
  });

  // Number formatting
  sheet.getColumn("H").numFmt = "0.000";
  sheet.getColumn("I").numFmt = "0.000";

  // Freeze header
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Auto filter
  sheet.autoFilter = {
    from: "A1",
    to: "I1"
  };

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="value-picks-${from}_to_${to}.xlsx"`
  );

  await workbook.xlsx.write(res);
  return res.end();
}

if (format !== "csv") {
  return res.json({
    ok: true,
    from,
    to,
    count: rows.length,
    picks: rows
  });
}

  const header = [
    "date",
    "kickoff",
    "league",
    "home",
    "away",
    "market",
    "pick",
    "score",
    "confidence"
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push([
      row.date,
      row.kickoff,
      row.league,
      csvEscape(row.home),
      csvEscape(row.away),
      csvEscape(row.market),
      csvEscape(row.pick),
      row.score,
      row.confidence
    ].join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="value-picks-${from}_to_${to}.csv"`
  );

  res.send(lines.join("\n"));
});

app.get("/ingest", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await ingestDay(dayKey);
  res.json({ ok: true, ...result });
});

app.get("/finalize", async (req, res) => {
  const dayKey = String(req.query.date || shiftDay(athensDayKey(), -1));
  const result = await finalizeDayIfSafe(dayKey);
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

app.get("/match-intelligence", async (req, res) => {
  const id = String(req.query.id || "");

  if (!id) {
    res.status(400).json({ ok: false, error: "missing_id" });
    return;
  }

  try {
    const fixture = getFixtureById(id);

    if (!fixture) {
      res.status(404).json({ ok: false, error: "match_not_found" });
      return;
    }

    const result = await buildMatchIntelligence(fixture);

    res.json(result);
  } catch (err) {
    console.error("[match-intelligence] failed", err?.message || err);

    res.status(500).json({
      ok: false,
      error: "match_intelligence_failed",
      message: String(err?.message || err)
    });
  }
});

app.get("/details", async (req, res) => {
  const id = String(req.query.id || "");
  const rebuild = boolParam(req.query.rebuild, false);

  if (!id) {
    res.status(400).json({ ok: false, error: "missing_id" });
    return;
  }

  try {
    const result = await getDetailsPayload(id, { rebuild });

    if (!result?.ok) {
      const status = result?.error === "match_not_found" ? 404 : 400;
      res.status(status).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("[details] failed", err?.message || err);

    res.status(500).json({
      ok: false,
      error: "details_failed",
      message: String(err?.message || err)
    });
  }
});

app.get("/build-details", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const rebuild = boolParam(req.query.rebuild, false);

  const result = await buildDetailsDay(dayKey, { rebuild });
  res.json(result);
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

if (command === "build-details") {
  const result = await buildDetailsDay(athensDayKey(), { rebuild: false });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "ingest-yesterday") {
  const result = await ingestDay(shiftDay(athensDayKey(), -1));
  console.log(result);
  process.exit(0);
}

if (command === "finalize-yesterday") {
  const result = await finalizeDayIfSafe(shiftDay(athensDayKey(), -1));
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`engine-v1 listening on ${PORT}`);
});