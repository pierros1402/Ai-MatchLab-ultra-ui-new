import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function dataPath(...parts) {
  return path.join(process.cwd(), "data", ...parts);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonPretty(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function picksOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.picks)) return payload.picks;
  if (Array.isArray(payload?.valuePicks)) return payload.valuePicks;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizeStatus(row) {
  return String(
    row?.status ||
    row?.operationalState ||
    row?.rawStatus ||
    row?.statusType ||
    row?.phase ||
    "UNKNOWN"
  ).trim().toUpperCase();
}

function normalizeSettlement(pick) {
  return String(
    pick?.settlement ||
    pick?.result ||
    pick?.outcome ||
    pick?.grade ||
    pick?.status ||
    ""
  ).trim().toUpperCase();
}

function isTerminalStatus(status) {
  const s = String(status || "").toUpperCase();
  return [
    "FT",
    "FULL_TIME",
    "STATUS_FINAL",
    "AET",
    "PEN",
    "PENS",
    "CANCELLED",
    "CANCELED",
    "POSTPONED",
    "ABANDONED",
    "VOID"
  ].includes(s);
}

function isOpenLikeStatus(status) {
  const s = String(status || "").toUpperCase();
  return (
    !isTerminalStatus(s) ||
    s.includes("STALE") ||
    s.includes("LIVE") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF_TIME") ||
    s.includes("SCHEDULED") ||
    s === "PRE" ||
    s === "UNKNOWN"
  );
}

function hasUsableScore(row) {
  const home = row?.scoreHome ?? row?.homeScore ?? row?.score?.home ?? row?.scores?.home;
  const away = row?.scoreAway ?? row?.awayScore ?? row?.score?.away ?? row?.scores?.away;
  return Number.isFinite(Number(home)) && Number.isFinite(Number(away));
}

function isSettledPick(pick) {
  if (pick?.settled === true) return true;

  const s = normalizeSettlement(pick);
  if (["WIN", "LOSS", "VOID", "PUSH", "HALF_WIN", "HALF_LOSS"].includes(s)) return true;

  if (pick?.finalScore && typeof pick.finalScore === "object") {
    const home = pick.finalScore.home ?? pick.finalScore.scoreHome;
    const away = pick.finalScore.away ?? pick.finalScore.scoreAway;
    if (Number.isFinite(Number(home)) && Number.isFinite(Number(away))) {
      return ["WIN", "LOSS", "VOID", "PUSH", "HALF_WIN", "HALF_LOSS"].includes(s);
    }
  }

  return false;
}

function dayKeyAthensNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function compareDay(a, b) {
  return String(a).localeCompare(String(b));
}

function parseArgs(argv) {
  const out = {
    from: null,
    to: null,
    includeCurrentDay: false,
    warnOnly: false,
    writeReport: true
  };

  for (const arg of argv) {
    if (arg.startsWith("--from=")) {
      out.from = arg.slice("--from=".length);
      continue;
    }

    if (arg.startsWith("--to=")) {
      out.to = arg.slice("--to=".length);
      continue;
    }

    if (arg === "--include-current-day") {
      out.includeCurrentDay = true;
      continue;
    }

    if (arg === "--warn-only" || arg === "--exit-zero") {
      out.warnOnly = true;
      continue;
    }

    if (arg === "--no-report") {
      out.writeReport = false;
      continue;
    }
  }

  return out;
}

export function auditFinalizationHistoryRange(options = {}) {
  const snapshotRoot = dataPath("deploy-snapshots");
  const currentDay = dayKeyAthensNow();

  const allDays = fs.existsSync(snapshotRoot)
    ? fs.readdirSync(snapshotRoot)
        .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
        .sort()
    : [];

  const days = allDays.filter(day => {
    if (options.from && compareDay(day, options.from) < 0) return false;
    if (options.to && compareDay(day, options.to) > 0) return false;
    if (!options.includeCurrentDay && day === currentDay) return false;
    return true;
  });

  const dayReports = [];

  for (const day of days) {
    const snapshotDir = dataPath("deploy-snapshots", day);
    const manifestFile = path.join(snapshotDir, "manifest.json");
    const fixturesFile = path.join(snapshotDir, "fixtures.json");
    const deployValueFile = path.join(snapshotDir, "value.json");
    const canonicalValueFile = dataPath("value", `${day}.json`);

    const manifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : null;
    const fixturesPayload = fs.existsSync(fixturesFile) ? readJson(fixturesFile) : null;
    const fixtureRows = rowsOf(fixturesPayload);

    const byStatus = {};
    const byLeague = {};
    const openRows = [];
    const terminalMissingScoreRows = [];

    for (const row of fixtureRows) {
      const status = normalizeStatus(row);
      const leagueSlug = String(row?.leagueSlug || row?.league || row?.competitionSlug || "unknown");

      byStatus[status] = (byStatus[status] || 0) + 1;
      byLeague[leagueSlug] = (byLeague[leagueSlug] || 0) + 1;

      const summaryRow = {
        matchId: row?.matchId || row?.id || row?.fixtureId,
        leagueSlug,
        homeTeam: row?.homeTeam || row?.home,
        awayTeam: row?.awayTeam || row?.away,
        status,
        rawStatus: row?.rawStatus,
        statusType: row?.statusType,
        minute: row?.minute,
        scoreHome: row?.scoreHome ?? row?.homeScore,
        scoreAway: row?.scoreAway ?? row?.awayScore,
        kickoffUtc: row?.kickoffUtc || row?.date || row?.startTime || row?.startUtc,
        source: row?.source || row?.provider || row?.sourceMeta?.source || row?.sourceMeta?.provider || row?.sourceMeta?.acquisitionProvider || "unknown"
      };

      if (isOpenLikeStatus(status)) {
        openRows.push(summaryRow);
      }

      if (isTerminalStatus(status) && !hasUsableScore(row)) {
        terminalMissingScoreRows.push(summaryRow);
      }
    }

    const deployValuePayload = fs.existsSync(deployValueFile) ? readJson(deployValueFile) : null;
    const deployPicks = picksOf(deployValuePayload);
    const unsettledDeployPicks = deployPicks.filter(pick => !isSettledPick(pick));

    const canonicalValuePayload = fs.existsSync(canonicalValueFile) ? readJson(canonicalValueFile) : null;
    const canonicalPicks = picksOf(canonicalValuePayload);
    const unsettledCanonicalPicks = canonicalPicks.filter(pick => !isSettledPick(pick));

    const affectedLeagues = [...new Set(openRows.map(row => row.leagueSlug).filter(Boolean))].sort();

    let repairPriority = "low";
    if (openRows.length >= 50 || unsettledDeployPicks.length >= 20) repairPriority = "critical";
    else if (openRows.length >= 10 || unsettledDeployPicks.length >= 5) repairPriority = "high";
    else if (openRows.length > 0 || terminalMissingScoreRows.length > 0 || unsettledDeployPicks.length > 0) repairPriority = "medium";

    dayReports.push({
      day,
      manifest: manifest
        ? {
            date: manifest.date,
            generatedAt: manifest.generatedAt,
            hash: manifest.hash,
            counts: manifest.counts || null
          }
        : null,
      fixtures: {
        exists: Boolean(fixturesPayload),
        count: fixtureRows.length,
        byStatus,
        byLeague,
        openCount: openRows.length,
        terminalMissingScoreCount: terminalMissingScoreRows.length,
        affectedLeagues,
        openSample: openRows.slice(0, 25),
        terminalMissingScoreSample: terminalMissingScoreRows.slice(0, 25)
      },
      deployValue: {
        exists: Boolean(deployValuePayload),
        count: deployPicks.length,
        unsettledCount: unsettledDeployPicks.length,
        unsettledSample: unsettledDeployPicks.slice(0, 25).map(pick => ({
          matchId: pick?.matchId,
          leagueSlug: pick?.leagueSlug,
          market: pick?.market,
          pick: pick?.pick,
          selection: pick?.selection,
          status: pick?.status,
          result: pick?.result,
          outcome: pick?.outcome,
          settlement: pick?.settlement,
          settled: pick?.settled,
          finalScore: pick?.finalScore
        }))
      },
      canonicalValue: {
        exists: Boolean(canonicalValuePayload),
        count: canonicalPicks.length,
        unsettledCount: unsettledCanonicalPicks.length
      },
      repairPriority
    });
  }

  const totals = dayReports.reduce((acc, dayReport) => {
    acc.days += 1;
    acc.fixtureRows += dayReport.fixtures.count;
    acc.openFixtureRows += dayReport.fixtures.openCount;
    acc.terminalMissingScoreRows += dayReport.fixtures.terminalMissingScoreCount;
    acc.deployValuePicks += dayReport.deployValue.count;
    acc.unsettledDeployValuePicks += dayReport.deployValue.unsettledCount;
    acc.canonicalValueMissingDays += dayReport.canonicalValue.exists ? 0 : 1;
    return acc;
  }, {
    days: 0,
    fixtureRows: 0,
    openFixtureRows: 0,
    terminalMissingScoreRows: 0,
    deployValuePicks: 0,
    unsettledDeployValuePicks: 0,
    canonicalValueMissingDays: 0
  });

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    currentDay,
    includeCurrentDay: Boolean(options.includeCurrentDay),
    from: options.from || null,
    to: options.to || null,
    totals,
    safety: {
      historicalTruthClean: totals.openFixtureRows === 0 && totals.terminalMissingScoreRows === 0,
      valueSettlementClean: totals.unsettledDeployValuePicks === 0,
      canonicalValueComplete: totals.canonicalValueMissingDays === 0,
      safeForValueStatistics:
        totals.openFixtureRows === 0 &&
        totals.terminalMissingScoreRows === 0 &&
        totals.unsettledDeployValuePicks === 0 &&
        totals.canonicalValueMissingDays === 0
    },
    priorityDays: dayReports
      .filter(dayReport =>
        dayReport.fixtures.openCount > 0 ||
        dayReport.fixtures.terminalMissingScoreCount > 0 ||
        dayReport.deployValue.unsettledCount > 0 ||
        !dayReport.canonicalValue.exists
      )
      .sort((a, b) => {
        const rank = { critical: 4, high: 3, medium: 2, low: 1 };
        return (rank[b.repairPriority] || 0) - (rank[a.repairPriority] || 0) ||
          b.fixtures.openCount - a.fixtures.openCount ||
          String(a.day).localeCompare(String(b.day));
      })
      .map(dayReport => ({
        day: dayReport.day,
        repairPriority: dayReport.repairPriority,
        openCount: dayReport.fixtures.openCount,
        terminalMissingScoreCount: dayReport.fixtures.terminalMissingScoreCount,
        unsettledDeployValuePicks: dayReport.deployValue.unsettledCount,
        canonicalValueExists: dayReport.canonicalValue.exists,
        affectedLeagues: dayReport.fixtures.affectedLeagues
      })),
    days: dayReports
  };

  if (options.writeReport !== false) {
    const rangeKey = `${options.from || "first"}_${options.to || (options.includeCurrentDay ? "latest" : "latest-past")}`;
    const file = dataPath("finalization-history-audits", `${rangeKey}.json`);
    writeJsonPretty(file, report);
    report.reportFile = file;
  }

  return report;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const result = auditFinalizationHistoryRange(args);

  console.log(JSON.stringify({
    ok: result.ok,
    generatedAt: result.generatedAt,
    currentDay: result.currentDay,
    includeCurrentDay: result.includeCurrentDay,
    from: result.from,
    to: result.to,
    totals: result.totals,
    safety: result.safety,
    reportFile: result.reportFile || null,
    priorityDays: result.priorityDays.slice(0, 20)
  }, null, 2));

  if (!args.warnOnly && !result.safety.safeForValueStatistics) {
    process.exitCode = 2;
  }
}
