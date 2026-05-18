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

function scoreOf(row) {
  const home = row?.scoreHome ?? row?.homeScore ?? row?.score?.home ?? row?.scores?.home;
  const away = row?.scoreAway ?? row?.awayScore ?? row?.score?.away ?? row?.scores?.away;

  if (!Number.isFinite(Number(home)) || !Number.isFinite(Number(away))) {
    return null;
  }

  return {
    home: Number(home),
    away: Number(away)
  };
}

function isSettledPick(pick) {
  if (pick?.settled === true) return true;
  const settlement = normalizeSettlement(pick);
  return ["WIN", "LOSS", "VOID", "PUSH", "HALF_WIN", "HALF_LOSS"].includes(settlement);
}

function pickMatchId(pick) {
  return String(pick?.matchId ?? pick?.id ?? pick?.fixtureId ?? "").trim();
}

function fixtureMatchId(row) {
  return String(row?.matchId ?? row?.id ?? row?.fixtureId ?? "").trim();
}

function fixtureSummary(row) {
  return {
    matchId: fixtureMatchId(row),
    leagueSlug: row?.leagueSlug || row?.league || row?.competitionSlug || "unknown",
    homeTeam: row?.homeTeam || row?.home,
    awayTeam: row?.awayTeam || row?.away,
    status: normalizeStatus(row),
    rawStatus: row?.rawStatus,
    statusType: row?.statusType,
    minute: row?.minute,
    score: scoreOf(row),
    kickoffUtc: row?.kickoffUtc || row?.date || row?.startTime || row?.startUtc,
    source: row?.source || row?.provider || row?.sourceMeta?.source || row?.sourceMeta?.provider || row?.sourceMeta?.acquisitionProvider || "unknown"
  };
}

function pickSummary(pick) {
  return {
    matchId: pickMatchId(pick),
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
  };
}

function parseArgs(argv) {
  const out = {
    from: null,
    to: null,
    warnOnly: false,
    noReport: false
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

    if (arg === "--warn-only" || arg === "--exit-zero") {
      out.warnOnly = true;
      continue;
    }

    if (arg === "--no-report") {
      out.noReport = true;
      continue;
    }
  }

  return out;
}

function compareDay(a, b) {
  return String(a).localeCompare(String(b));
}

export function buildFinalizationRepairBuckets(options = {}) {
  const snapshotRoot = dataPath("deploy-snapshots");

  const days = fs.existsSync(snapshotRoot)
    ? fs.readdirSync(snapshotRoot)
        .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
        .filter(day => !options.from || compareDay(day, options.from) >= 0)
        .filter(day => !options.to || compareDay(day, options.to) <= 0)
        .sort()
    : [];

  const buckets = {
    openFixturesNeedingTruthDiscovery: [],
    terminalFixturesMissingScore: [],
    valuePicksSettleableFromSnapshotFT: [],
    valuePicksBlockedByOpenFixture: [],
    valuePicksMissingFixtureRow: [],
    canonicalValueMissingButDeployValueExists: [],
    canonicalValueExistsButDeployValueUnsettled: []
  };

  const daySummaries = [];

  for (const day of days) {
    const snapshotDir = dataPath("deploy-snapshots", day);
    const fixturesFile = path.join(snapshotDir, "fixtures.json");
    const deployValueFile = path.join(snapshotDir, "value.json");
    const canonicalValueFile = dataPath("value", `${day}.json`);

    const fixturesPayload = fs.existsSync(fixturesFile) ? readJson(fixturesFile) : null;
    const fixtureRows = rowsOf(fixturesPayload);
    const fixtureById = new Map();

    for (const row of fixtureRows) {
      const id = fixtureMatchId(row);
      if (id) fixtureById.set(id, row);

      const status = normalizeStatus(row);
      const score = scoreOf(row);
      const summary = fixtureSummary(row);

      if (isOpenLikeStatus(status)) {
        buckets.openFixturesNeedingTruthDiscovery.push({ day, ...summary });
      } else if (isTerminalStatus(status) && !score) {
        buckets.terminalFixturesMissingScore.push({ day, ...summary });
      }
    }

    const deployValuePayload = fs.existsSync(deployValueFile) ? readJson(deployValueFile) : null;
    const deployPicks = picksOf(deployValuePayload);
    const canonicalValueExists = fs.existsSync(canonicalValueFile);

    if (deployValuePayload && deployPicks.length > 0 && !canonicalValueExists) {
      buckets.canonicalValueMissingButDeployValueExists.push({
        day,
        deployValuePicks: deployPicks.length,
        deployValueFile,
        canonicalValueFile
      });
    }

    let unsettledDeployPicks = 0;
    for (const pick of deployPicks) {
      if (isSettledPick(pick)) continue;
      unsettledDeployPicks++;

      const matchId = pickMatchId(pick);
      const fixture = fixtureById.get(matchId);

      if (!fixture) {
        buckets.valuePicksMissingFixtureRow.push({
          day,
          pick: pickSummary(pick)
        });
        continue;
      }

      const status = normalizeStatus(fixture);
      const score = scoreOf(fixture);
      const fixtureInfo = fixtureSummary(fixture);

      if (isTerminalStatus(status) && score) {
        buckets.valuePicksSettleableFromSnapshotFT.push({
          day,
          fixture: fixtureInfo,
          pick: pickSummary(pick)
        });
      } else {
        buckets.valuePicksBlockedByOpenFixture.push({
          day,
          fixture: fixtureInfo,
          pick: pickSummary(pick)
        });
      }
    }

    if (canonicalValueExists && unsettledDeployPicks > 0) {
      buckets.canonicalValueExistsButDeployValueUnsettled.push({
        day,
        unsettledDeployPicks,
        canonicalValueFile
      });
    }

    daySummaries.push({
      day,
      fixtures: fixtureRows.length,
      deployValuePicks: deployPicks.length,
      canonicalValueExists,
      openFixtures: buckets.openFixturesNeedingTruthDiscovery.filter(x => x.day === day).length,
      settleableFromSnapshotFT: buckets.valuePicksSettleableFromSnapshotFT.filter(x => x.day === day).length,
      valueBlockedByOpenFixture: buckets.valuePicksBlockedByOpenFixture.filter(x => x.day === day).length,
      valueMissingFixtureRow: buckets.valuePicksMissingFixtureRow.filter(x => x.day === day).length
    });
  }

  const counts = Object.fromEntries(
    Object.entries(buckets).map(([key, rows]) => [key, rows.length])
  );

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    from: options.from || null,
    to: options.to || null,
    days: daySummaries.length,
    counts,
    safety: {
      hasTruthDiscoveryDebt: counts.openFixturesNeedingTruthDiscovery > 0 || counts.terminalFixturesMissingScore > 0,
      hasValueSettlementDebt:
        counts.valuePicksSettleableFromSnapshotFT > 0 ||
        counts.valuePicksBlockedByOpenFixture > 0 ||
        counts.valuePicksMissingFixtureRow > 0,
      hasCanonicalValueBackfillDebt: counts.canonicalValueMissingButDeployValueExists > 0,
      safeForRepairAutomation: false
    },
    daySummaries,
    buckets
  };

  if (!options.noReport) {
    const rangeKey = `${options.from || "first"}_${options.to || "latest"}`;
    const reportFile = dataPath("finalization-repair-buckets", `${rangeKey}.json`);
    writeJsonPretty(reportFile, report);
    report.reportFile = reportFile;
  }

  return report;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const result = buildFinalizationRepairBuckets(args);

  console.log(JSON.stringify({
    ok: result.ok,
    generatedAt: result.generatedAt,
    from: result.from,
    to: result.to,
    days: result.days,
    counts: result.counts,
    safety: result.safety,
    reportFile: result.reportFile || null,
    worstDays: [...result.daySummaries]
      .sort((a, b) =>
        (b.openFixtures + b.settleableFromSnapshotFT + b.valueBlockedByOpenFixture + b.valueMissingFixtureRow) -
        (a.openFixtures + a.settleableFromSnapshotFT + a.valueBlockedByOpenFixture + a.valueMissingFixtureRow)
      )
      .slice(0, 12)
  }, null, 2));

  if (!args.warnOnly && (
    result.safety.hasTruthDiscoveryDebt ||
    result.safety.hasValueSettlementDebt ||
    result.safety.hasCanonicalValueBackfillDebt
  )) {
    process.exitCode = 2;
  }
}
