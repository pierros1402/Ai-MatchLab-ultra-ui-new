#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    canonicalRoot: path.join(repoRoot, "data", "canonical-fixtures"),
    apply: false,
    allowProductionWrites: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--canonical-root") args.canonicalRoot = argv[++i] || "";
    else if (arg.startsWith("--canonical-root=")) args.canonicalRoot = arg.slice("--canonical-root=".length);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-production-writes") args.allowProductionWrites = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function safeLeagueSlug(value) {
  const slug = clean(value);
  return /^[a-zA-Z0-9._-]+$/.test(slug) ? slug : "";
}

function planRowsOf(plan) {
  return [
    ...asArray(plan?.proposedUpdateRows),
    ...asArray(plan?.proposedInsertRows)
  ];
}

function relativeCanonicalPath(dayKey, leagueSlug) {
  return `data/canonical-fixtures/${dayKey}/${leagueSlug}.json`;
}

function absoluteCanonicalPath(canonicalRoot, dayKey, leagueSlug) {
  return path.join(canonicalRoot, dayKey, `${leagueSlug}.json`);
}

function canonicalRowsOf(input) {
  if (Array.isArray(input?.fixtures)) return input.fixtures;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.matches)) return input.matches;
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") return [input];
  return [];
}

function normalizeTeamName(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(football club|club de futbol|fc|afc|cf|sc|ac|cd|fk|sk|sv|as|bk|calcio|club)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function kickoffMs(value) {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : null;
}

function sameFixtureIdentity(a, b) {
  const aSourceId = clean(a.sourceMatchId || a.sourceId || a.matchId || a.fixtureId || a.id);
  const bSourceId = clean(b.sourceMatchId || b.sourceId || b.matchId || b.fixtureId || b.id);

  if (aSourceId && bSourceId && aSourceId === bSourceId) return true;

  const aHome = normalizeTeamName(a.homeTeam || a.home);
  const aAway = normalizeTeamName(a.awayTeam || a.away);
  const bHome = normalizeTeamName(b.homeTeam || b.home);
  const bAway = normalizeTeamName(b.awayTeam || b.away);

  if (!aHome || !aAway || !bHome || !bAway) return false;
  if (aHome !== bHome || aAway !== bAway) return false;

  const aMs = kickoffMs(a.kickoffUtc || a.utcDateTime || a.dateTime || a.kickoff);
  const bMs = kickoffMs(b.kickoffUtc || b.utcDateTime || b.dateTime || b.kickoff);

  if (aMs == null || bMs == null) return clean(a.dayKey || a.date) === clean(b.dayKey || b.date);
  return Math.abs(aMs - bMs) <= 240 * 60000;
}

function normalizeCanonicalFixture(fixture) {
  const dayKey = clean(fixture.dayKey || fixture.date || fixture.localDate || clean(fixture.kickoffUtc).slice(0, 10));
  const leagueSlug = safeLeagueSlug(fixture.leagueSlug);

  return {
    matchId: clean(fixture.matchId || fixture.sourceMatchId || fixture.sourceId),
    matchKey: clean(fixture.matchKey),
    source: clean(fixture.source || "uefa_api"),
    sourceProvider: clean(fixture.sourceProvider || "uefa_api"),
    sourceId: clean(fixture.sourceId || fixture.sourceMatchId || fixture.matchId),
    sourceMatchId: clean(fixture.sourceMatchId || fixture.sourceId || fixture.matchId),
    sourceSnapshotId: clean(fixture.sourceSnapshotId || fixture?.sourceEvidence?.apiCandidateId || fixture?.sourceEvidence?.evidenceRowId),
    leagueSlug,
    leagueName: clean(fixture.leagueName || "UEFA Champions League"),
    date: dayKey,
    dayKey,
    fetchedDayKey: clean(fixture.fetchedDayKey || dayKey),
    kickoffUtc: clean(fixture.kickoffUtc),
    homeTeam: clean(fixture.homeTeam),
    awayTeam: clean(fixture.awayTeam),
    scoreHome: fixture.scoreHome == null ? null : Number(fixture.scoreHome),
    scoreAway: fixture.scoreAway == null ? null : Number(fixture.scoreAway),
    halfTimeScore: fixture.halfTimeScore ?? null,
    regularScore: fixture.regularScore ?? null,
    extraTimeScore: fixture.extraTimeScore ?? null,
    aggregateScore: fixture.aggregateScore ?? null,
    penalties: fixture.penalties ?? null,
    decidedBy: fixture.decidedBy ?? null,
    status: clean(fixture.status || "FT"),
    rawStatus: clean(fixture.rawStatus || fixture.status || "FINISHED"),
    minute: clean(fixture.minute || (clean(fixture.status).toUpperCase() === "FT" ? "FT" : "")),
    venue: clean(fixture.venue),
    sourceUrl: clean(fixture.sourceUrl || fixture?.sourceEvidence?.sourceUrl),
    sourceEvidence: fixture.sourceEvidence || {}
  };
}

function validateInputPlan(plan) {
  const errors = [];

  const inputDryRun = Boolean(plan?.dryRun ?? plan?.summary?.dryRun ?? plan?.guarantees?.dryRun);
  if (inputDryRun !== true) errors.push("input_plan_not_dry_run");
  if (Number(plan?.summary?.canonicalWrites ?? plan?.guarantees?.canonicalWrites ?? 0) !== 0) {
    errors.push("input_plan_canonical_writes_not_zero");
  }
  if (Boolean(plan?.summary?.productionWrite ?? plan?.guarantees?.productionWrite) !== false) {
    errors.push("input_plan_production_write_not_false");
  }
  if (Boolean(plan?.summary?.dryRun ?? plan?.guarantees?.dryRun) !== true) {
    errors.push("input_plan_summary_not_dry_run");
  }
  if (Boolean(plan?.guarantees?.noFetch) !== true) errors.push("input_plan_no_fetch_not_true");
  if (Boolean(plan?.guarantees?.noUrlFetch) !== true) errors.push("input_plan_no_url_fetch_not_true");
  if (Number(plan?.summary?.promotionPlanRowCount || 0) !== planRowsOf(plan).length) {
    errors.push("promotion_plan_row_count_mismatch");
  }

  return errors;
}

function validatePlanRow(row, index) {
  const errors = [];
  const fixture = normalizeCanonicalFixture(row?.proposedCanonicalFixture || {});

  if (!clean(row?.planRowId)) errors.push("missing_plan_row_id");
  if (!["existing_canonical_update_candidate", "new_canonical_fixture_candidate"].includes(clean(row?.planState))) {
    errors.push("unsupported_plan_state");
  }
  if (!isDate(fixture.dayKey)) errors.push("invalid_or_missing_fixture_date");
  if (!safeLeagueSlug(fixture.leagueSlug)) errors.push("missing_or_unsafe_league_slug");
  if (!fixture.homeTeam) errors.push("missing_home_team");
  if (!fixture.awayTeam) errors.push("missing_away_team");
  if (fixture.homeTeam && fixture.awayTeam && fixture.homeTeam === fixture.awayTeam) errors.push("same_home_away_team");
  if (!fixture.kickoffUtc || kickoffMs(fixture.kickoffUtc) == null) errors.push("invalid_or_missing_kickoff_utc");
  if (!["FT", "FINISHED", "AET", "PEN", "PRE", "SCHEDULED"].includes(clean(fixture.status).toUpperCase())) {
    errors.push("unsupported_fixture_status");
  }
  if (!fixture.sourceUrl) errors.push("missing_source_url");
  if (!fixture.sourceProvider) errors.push("missing_source_provider");
  if (!fixture.sourceMatchId) errors.push("missing_source_match_id");
  if (row?.canonicalWrites !== 0) errors.push("plan_row_canonical_writes_not_zero");
  if (row?.productionWrite !== false) errors.push("plan_row_production_write_not_false");
  if (row?.dryRun !== true) errors.push("plan_row_not_dry_run");

  return {
    index,
    planRowId: clean(row?.planRowId),
    planState: clean(row?.planState),
    dayKey: fixture.dayKey,
    leagueSlug: fixture.leagueSlug,
    writeTarget: fixture.dayKey && fixture.leagueSlug ? relativeCanonicalPath(fixture.dayKey, fixture.leagueSlug) : "",
    absoluteWriteTarget: fixture.dayKey && fixture.leagueSlug ? absoluteCanonicalPath("", fixture.dayKey, fixture.leagueSlug) : "",
    fixture,
    errors
  };
}

function mergeRows(existingRows, proposedFixtures) {
  const merged = [...existingRows];
  let updateCount = 0;
  let insertCount = 0;

  for (const proposed of proposedFixtures) {
    const index = merged.findIndex((existing) => sameFixtureIdentity(existing, proposed));
    if (index >= 0) {
      const existing = merged[index];
      merged[index] = {
        ...existing,
        ...proposed,
        matchKey: clean(existing?.matchKey) || clean(proposed?.matchKey),
        sourceEvidence: {
          ...(existing?.sourceEvidence || {}),
          ...(proposed?.sourceEvidence || {})
        }
      };
      updateCount += 1;
    } else {
      merged.push(proposed);
      insertCount += 1;
    }
  }

  merged.sort((a, b) => {
    const aMs = kickoffMs(a.kickoffUtc || a.utcDateTime || a.dateTime || a.kickoff) ?? 0;
    const bMs = kickoffMs(b.kickoffUtc || b.utcDateTime || b.dateTime || b.kickoff) ?? 0;
    return aMs - bMs || clean(a.homeTeam).localeCompare(clean(b.homeTeam));
  });

  return { merged, updateCount, insertCount };
}

function groupWritableRows(planRows, validations) {
  const blockedRows = [];
  const groups = new Map();

  validations.forEach((validation, index) => {
    if (validation.errors.length > 0) {
      blockedRows.push({
        index,
        planRowId: validation.planRowId,
        leagueSlug: validation.leagueSlug,
        writeTarget: validation.writeTarget,
        errors: validation.errors
      });
      return;
    }

    const key = validation.writeTarget;
    if (!groups.has(key)) {
      groups.set(key, {
        writeTarget: validation.writeTarget,
        dayKey: validation.dayKey,
        leagueSlug: validation.leagueSlug,
        rows: []
      });
    }

    groups.get(key).rows.push({
      planRow: planRows[index],
      validation
    });
  });

  return {
    blockedRows,
    groups: [...groups.values()]
  };
}

function loadExistingCanonical(absPath) {
  if (!fs.existsSync(absPath)) {
    return {
      existed: false,
      rows: [],
      schema: "ai-matchlab.canonical-fixtures.v1"
    };
  }

  const input = readJson(absPath);
  return {
    existed: true,
    rows: canonicalRowsOf(input),
    schema: clean(input?.schema || "ai-matchlab.canonical-fixtures.v1")
  };
}

function buildReport(plan, options = {}) {
  const canonicalRoot = path.resolve(options.canonicalRoot || path.join(repoRoot, "data", "canonical-fixtures"));
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const mayWrite = apply && allowProductionWrites;

  const planErrors = validateInputPlan(plan);
  const rows = planRowsOf(plan);
  const validations = rows.map((row, index) => validatePlanRow(row, index));
  const grouped = groupWritableRows(rows, validations);

  const wouldWriteFiles = [];
  const writtenFiles = [];

  for (const group of grouped.groups) {
    const absPath = absoluteCanonicalPath(canonicalRoot, group.dayKey, group.leagueSlug);
    const existing = loadExistingCanonical(absPath);
    const proposedFixtures = group.rows.map((entry) => entry.validation.fixture);
    const merge = mergeRows(existing.rows, proposedFixtures);

    const record = {
      schema: existing.schema,
      generatedAt: new Date().toISOString(),
      dayKey: group.dayKey,
      date: group.dayKey,
      leagueSlug: group.leagueSlug,
      source: "canonical-fixtures",
      fixtures: merge.merged
    };

    const fileRow = {
      writeTarget: relativeCanonicalPath(group.dayKey, group.leagueSlug),
      absoluteWriteTarget: absPath,
      existed: existing.existed,
      proposedRows: proposedFixtures.length,
      existingRows: existing.rows.length,
      finalRows: merge.merged.length,
      updateCount: merge.updateCount,
      insertCount: merge.insertCount,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: !mayWrite
    };

    wouldWriteFiles.push(fileRow);

    if (mayWrite && planErrors.length === 0 && grouped.blockedRows.length === 0) {
      writeJson(absPath, record);
      writtenFiles.push({
        ...fileRow,
        canonicalWrites: 1,
        productionWrite: true,
        dryRun: false
      });
    }
  }

  const productionCanonicalWrite = mayWrite && planErrors.length === 0 && grouped.blockedRows.length === 0;

  return {
    ok: planErrors.length === 0 && grouped.blockedRows.length === 0,
    stage: productionCanonicalWrite
      ? "uefa_fixture_api_canonical_write_completed"
      : "uefa_fixture_api_canonical_write_dry_run_ready",
    summary: {
      proposedPlanRows: rows.length,
      wouldWriteFiles: wouldWriteFiles.length,
      writtenFiles: writtenFiles.length,
      blockedRows: grouped.blockedRows.length,
      planErrors: planErrors.length,
      proposedUpdateRows: asArray(plan?.proposedUpdateRows).length,
      proposedInsertRows: asArray(plan?.proposedInsertRows).length,
      productionCanonicalWrites: productionCanonicalWrite ? writtenFiles.length : 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0
    },
    planErrors,
    blockedRows: grouped.blockedRows,
    wouldWriteFiles,
    writtenFiles,
    guarantees: {
      canonicalWrites: productionCanonicalWrite ? writtenFiles.length : 0,
      productionWrite: productionCanonicalWrite,
      dryRun: !mayWrite,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      sourceFetch: false,
      fetch: false,
      noFetch: true,
      noUrlFetch: true,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0,
      productionRepair: false,
      supportsFinishedFixtures: true,
      writerScope: "uefa_fixture_api_canonical_fixtures_only"
    }
  };
}

function blockedApplyReport(inputPath, outputPath) {
  return {
    ok: false,
    stage: "uefa_fixture_api_canonical_write_blocked",
    input: inputPath,
    output: outputPath,
    summary: {
      proposedPlanRows: 0,
      wouldWriteFiles: 0,
      writtenFiles: 0,
      blockedRows: 0,
      planErrors: 0,
      productionCanonicalWrites: 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0
    },
    blockedRows: [],
    wouldWriteFiles: [],
    writtenFiles: [],
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      sourceFetch: false,
      fetch: false,
      noFetch: true,
      noUrlFetch: true,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0,
      productionRepair: false,
      supportsFinishedFixtures: true,
      writerScope: "uefa_fixture_api_canonical_fixtures_only"
    },
    blockedReason: "apply_requires_allow_production_writes"
  };
}

function selfTest() {
  const tmpRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-uefa-writer-"));
  const plan = {
    dryRun: true,
    summary: {
      promotionPlanRowCount: 2,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    proposedUpdateRows: [
      {
        planRowId: "update-1",
        planState: "existing_canonical_update_candidate",
        dryRun: true,
        productionWrite: false,
        canonicalWrites: 0,
        proposedCanonicalFixture: {
          matchId: "u1",
          source: "uefa_api",
          sourceProvider: "uefa_api",
          sourceId: "u1",
          sourceMatchId: "u1",
          sourceSnapshotId: "snap-1",
          leagueSlug: "uefa.champions",
          leagueName: "UEFA Champions League",
          dayKey: "2026-05-30",
          kickoffUtc: "2026-05-30T16:00:00Z",
          homeTeam: "Paris Saint-Germain",
          awayTeam: "Arsenal FC",
          scoreHome: 1,
          scoreAway: 1,
          status: "FT",
          rawStatus: "FINISHED",
          sourceUrl: "https://match.uefa.com/v5/matches?competitionId=1&seasonYear=2026&offset=0&limit=100"
        }
      }
    ],
    proposedInsertRows: [
      {
        planRowId: "insert-1",
        planState: "new_canonical_fixture_candidate",
        dryRun: true,
        productionWrite: false,
        canonicalWrites: 0,
        proposedCanonicalFixture: {
          matchId: "u2",
          source: "uefa_api",
          sourceProvider: "uefa_api",
          sourceId: "u2",
          sourceMatchId: "u2",
          sourceSnapshotId: "snap-1",
          leagueSlug: "uefa.champions",
          leagueName: "UEFA Champions League",
          dayKey: "2026-05-29",
          kickoffUtc: "2026-05-29T19:00:00Z",
          homeTeam: "Alpha FC",
          awayTeam: "Beta FC",
          scoreHome: 2,
          scoreAway: 0,
          status: "FT",
          rawStatus: "FINISHED",
          sourceUrl: "https://match.uefa.com/v5/matches?competitionId=1&seasonYear=2026&offset=0&limit=100"
        }
      }
    ]
  };

  const report = buildReport(plan, { canonicalRoot: tmpRoot, apply: false, allowProductionWrites: false });
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  if (report.ok !== true) throw new Error("expected self-test report ok");
  if (report.summary.proposedPlanRows !== 2) throw new Error("expected 2 proposed rows");
  if (report.summary.wouldWriteFiles !== 2) throw new Error("expected 2 would-write files");
  if (report.summary.writtenFiles !== 0) throw new Error("dry-run must not write files");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("dry-run canonicalWrites must be zero");
  if (report.guarantees.productionWrite !== false) throw new Error("dry-run productionWrite must be false");
  if (report.guarantees.supportsFinishedFixtures !== true) throw new Error("writer must support finished fixtures");

  return {
    ok: true,
    selfTest: "write-uefa-fixture-api-promotion-plan-file",
    stage: report.stage,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  if (args.apply && !args.allowProductionWrites) {
    const blocked = blockedApplyReport(args.input, args.output);
    writeJson(outputPath, blocked);
    console.log(JSON.stringify(blocked, null, 2));
    return;
  }

  const plan = readJson(inputPath);
  const report = buildReport(plan, {
    canonicalRoot: args.canonicalRoot,
    apply: args.apply,
    allowProductionWrites: args.allowProductionWrites
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, outputPath).replace(/\\/g, "/"),
    stage: report.stage,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };