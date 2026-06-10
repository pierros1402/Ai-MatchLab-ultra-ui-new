#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    canonicalRoot: path.join(repoRoot, "data", "canonical-fixtures"),
    apply: false,
    allowProductionWrites: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i];
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--canonical-root") args.canonicalRoot = argv[++i];
    else if (arg.startsWith("--canonical-root=")) args.canonicalRoot = arg.slice("--canonical-root=".length);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-production-writes") args.allowProductionWrites = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rowsOfPlan(plan) {
  if (Array.isArray(plan?.readyRows)) return plan.readyRows;
  if (Array.isArray(plan?.proposedInsertRows)) return plan.proposedInsertRows.filter((row) => row.readyForPromotionPlan);
  if (Array.isArray(plan?.rows)) return plan.rows.filter((row) => row.readyForPromotionPlan !== false);
  if (Array.isArray(plan)) return plan.filter((row) => row.readyForPromotionPlan !== false);
  return [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function canonicalFilePath(canonicalRoot, row) {
  const dayKey = text(row.dayKey || row.date);
  const leagueSlug = text(row.leagueSlug || row.competitionSlug);

  if (!dayKey || !leagueSlug) return "";

  return path.join(canonicalRoot, dayKey, `${leagueSlug}.json`);
}

function relativeCanonicalPath(row) {
  const dayKey = text(row.dayKey || row.date);
  const leagueSlug = text(row.leagueSlug || row.competitionSlug);

  if (!dayKey || !leagueSlug) return "";

  return `data/canonical-fixtures/${dayKey}/${leagueSlug}.json`;
}

function canonicalRow(row) {
  return {
    matchId: text(row.matchId),
    matchKey: text(row.matchKey || row.matchId),
    source: "official_route_fixture_evidence",
    sourceId: text(row.sourceContract || row.provider || "official_route_fixture_evidence"),
    sourceMatchId: text(row.matchId),
    leagueSlug: text(row.leagueSlug || row.competitionSlug),
    leagueName: text(row.leagueName),
    dayKey: text(row.dayKey || row.date),
    fetchedDayKey: text(row.dayKey || row.date),
    kickoffUtc: text(row.kickoffUtc),
    kickoffLocal: text(row.kickoffLocal),
    homeTeam: text(row.homeTeam),
    awayTeam: text(row.awayTeam),
    scoreHome: row.status === "FT" ? row.scoreHome : null,
    scoreAway: row.status === "FT" ? row.scoreAway : null,
    penalties: null,
    decidedBy: null,
    status: text(row.status),
    rawStatus: text(row.rawStatus),
    minute: null,
    venue: text(row.venue),
    sourceUrl: text(row.sourceUrl || row.finalUrl || row.candidateUrl),
    evidence: {
      sourceType: "official_route_fixture_evidence",
      sourceContract: text(row.sourceContract),
      provider: text(row.provider),
      sourceFamily: text(row.sourceFamily),
      trustTier: text(row.trustTier),
      evidenceType: text(row.evidenceType),
      sourcePageKind: text(row.sourcePageKind),
      finalUrl: text(row.finalUrl),
      candidateUrl: text(row.candidateUrl),
      hostname: text(row.hostname),
      rawText: text(row.rawText),
      rawCells: row.rawCells || [],
      tableIndex: row.tableIndex ?? null,
      rowIndex: row.rowIndex ?? null
    },
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
}

function validateReadyRow(row, index) {
  const blockedReasons = [];

  if (row.readyForPromotionPlan !== true) blockedReasons.push("not_readyForPromotionPlan");
  if (text(row.sourceType) !== "official_route_fixture_evidence") blockedReasons.push("unexpected_sourceType");
  if (!text(row.matchId)) blockedReasons.push("missing_matchId");
  if (!text(row.leagueSlug || row.competitionSlug)) blockedReasons.push("missing_leagueSlug");
  if (!text(row.dayKey || row.date)) blockedReasons.push("missing_dayKey");
  if (!text(row.homeTeam)) blockedReasons.push("missing_homeTeam");
  if (!text(row.awayTeam)) blockedReasons.push("missing_awayTeam");
  if (!["FT", "PRE"].includes(text(row.status))) blockedReasons.push("invalid_status");
  if (text(row.status) === "FT" && (row.scoreHome == null || row.scoreAway == null)) {
    blockedReasons.push("finished_without_score");
  }

  return {
    index,
    matchId: text(row.matchId),
    leagueSlug: text(row.leagueSlug || row.competitionSlug),
    dayKey: text(row.dayKey || row.date),
    ready: blockedReasons.length === 0,
    blockedReasons
  };
}

function loadExistingRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const json = readJson(filePath);

  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.rows)) return json.rows;
  if (Array.isArray(json?.fixtures)) return json.fixtures;
  return [];
}

function mergeRows(existingRows, newRows) {
  const byKey = new Map();

  for (const row of existingRows) {
    const key = text(row.matchId || row.matchKey || `${row.homeTeam}|${row.awayTeam}|${row.kickoffUtc}|${row.kickoffLocal}`);
    if (key) byKey.set(key, row);
  }

  for (const row of newRows) {
    const key = text(row.matchId || row.matchKey);
    if (key) byKey.set(key, row);
  }

  return [...byKey.values()].sort((a, b) => {
    const ak = `${text(a.kickoffUtc || a.kickoffLocal)} ${text(a.homeTeam)} ${text(a.awayTeam)}`;
    const bk = `${text(b.kickoffUtc || b.kickoffLocal)} ${text(b.homeTeam)} ${text(b.awayTeam)}`;
    return ak.localeCompare(bk);
  });
}

function summarizeByCompetition(rows) {
  const byCompetition = {};

  for (const row of rows) {
    const slug = text(row.leagueSlug || row.competitionSlug) || "unknown";
    byCompetition[slug] ||= {
      competitionSlug: slug,
      rowCount: 0,
      finishedRows: 0,
      scheduledRows: 0,
      filesTouched: new Set()
    };

    const item = byCompetition[slug];
    item.rowCount += 1;

    if (row.status === "FT") item.finishedRows += 1;
    else if (row.status === "PRE") item.scheduledRows += 1;

    item.filesTouched.add(relativeCanonicalPath(row));
  }

  return Object.values(byCompetition)
    .map((row) => ({
      ...row,
      filesTouched: [...row.filesTouched].filter(Boolean).sort()
    }))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function buildWritePlan({ inputPath, canonicalRoot, apply, allowProductionWrites }) {
  const plan = readJson(inputPath);
  const readyRows = rowsOfPlan(plan);

  const validated = readyRows.map(validateReadyRow);
  const blocked = validated.filter((row) => !row.ready);

  const candidateRows = readyRows
    .map((row, index) => ({ original: row, validation: validated[index] }))
    .filter((item) => item.validation.ready)
    .map((item) => canonicalRow(item.original));

  const byFile = new Map();

  for (const row of candidateRows) {
    const filePath = canonicalFilePath(canonicalRoot, row);
    if (!filePath) continue;

    if (!byFile.has(filePath)) byFile.set(filePath, []);
    byFile.get(filePath).push(row);
  }

  const filePlans = [];

  for (const [filePath, rows] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const existingRows = loadExistingRows(filePath);
    const mergedRows = mergeRows(existingRows, rows);

    filePlans.push({
      filePath,
      relativePath: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
      existedBefore: fs.existsSync(filePath),
      existingRows: existingRows.length,
      incomingRows: rows.length,
      mergedRows: mergedRows.length,
      wouldCreateFile: !fs.existsSync(filePath),
      wouldWriteRows: rows.length,
      rows
    });
  }

  const canWrite = apply && allowProductionWrites;
  let actualCanonicalWrites = 0;
  let writtenFiles = 0;

  if (canWrite) {
    for (const filePlan of filePlans) {
      const existingRows = loadExistingRows(filePlan.filePath);
      const mergedRows = mergeRows(existingRows, filePlan.rows);
      writeJson(filePlan.filePath, mergedRows);
      actualCanonicalWrites += filePlan.rows.length;
      writtenFiles += 1;
    }
  }

  const blockedReasonCounts = {};
  for (const row of blocked) {
    for (const reason of row.blockedReasons) {
      blockedReasonCounts[reason] = (blockedReasonCounts[reason] || 0) + 1;
    }
  }

  return {
    ok: true,
    job: "write-official-route-fixture-evidence-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    mode: canWrite
      ? "apply_generic_official_route_fixture_evidence_promotion_plan"
      : "dry_run_generic_official_route_fixture_evidence_promotion_plan",
    input: {
      inputPath,
      canonicalRoot,
      planJob: plan.job || null,
      planSourceType: plan.schema?.sourceType || null,
      inputReadyRows: readyRows.length
    },
    summary: {
      inputReadyRows: readyRows.length,
      validRows: candidateRows.length,
      blockedRows: blocked.length,
      filePlanCount: filePlans.length,
      wouldWriteCanonicalRows: candidateRows.length,
      wouldWriteFiles: filePlans.length,
      actualCanonicalWrites,
      writtenFiles,
      productionWrite: canWrite,
      dryRun: !canWrite,
      blockedReasonCounts
    },
    byCompetition: summarizeByCompetition(candidateRows),
    blockedRows: blocked,
    filePlans,
    guardrails: {
      noFetch: true,
      noSearch: true,
      noUefaFixtureApiSourceType: true,
      requiresSourceType: "official_route_fixture_evidence",
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      canonicalWritesOnlyWhenApplyAndAllowProductionWrites: true
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      canonicalWrites: actualCanonicalWrites,
      productionWrite: canWrite,
      sourceFetch: false
    }
  };
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(process.cwd(), ".tmp-official-route-writer-"));
  const inputPath = path.join(tmp, "plan.json");
  const canonicalRoot = path.join(tmp, "canonical-fixtures");
  const output = path.join(tmp, "dry-run.json");

  writeJson(inputPath, {
    job: "build-official-route-fixture-evidence-promotion-plan-file",
    schema: {
      sourceType: "official_route_fixture_evidence"
    },
    readyRows: [
      {
        matchId: "official-route-test-1",
        matchKey: "official-route-test-1",
        sourceType: "official_route_fixture_evidence",
        leagueSlug: "test.1",
        competitionSlug: "test.1",
        dayKey: "2026-04-01",
        date: "2026-04-01",
        homeTeam: "A",
        awayTeam: "B",
        status: "FT",
        rawStatus: "finished",
        scoreHome: 2,
        scoreAway: 1,
        readyForPromotionPlan: true,
        finalUrl: "https://example.test"
      },
      {
        matchId: "official-route-test-2",
        matchKey: "official-route-test-2",
        sourceType: "official_route_fixture_evidence",
        leagueSlug: "test.1",
        competitionSlug: "test.1",
        dayKey: "2026-04-02",
        date: "2026-04-02",
        homeTeam: "C",
        awayTeam: "D",
        status: "PRE",
        rawStatus: "scheduled",
        readyForPromotionPlan: true,
        finalUrl: "https://example.test"
      }
    ]
  });

  const dryRun = buildWritePlan({
    inputPath,
    canonicalRoot,
    apply: false,
    allowProductionWrites: false
  });
  writeJson(output, dryRun);

  const canonicalFilesAfterDryRun = fs.existsSync(canonicalRoot)
    ? fs.readdirSync(canonicalRoot, { recursive: true })
    : [];

  fs.rmSync(tmp, { recursive: true, force: true });

  if (dryRun.summary.inputReadyRows !== 2) throw new Error("expected 2 input ready rows");
  if (dryRun.summary.validRows !== 2) throw new Error("expected 2 valid rows");
  if (dryRun.summary.actualCanonicalWrites !== 0) throw new Error("dry-run wrote canonical rows");
  if (dryRun.summary.productionWrite !== false) throw new Error("dry-run productionWrite not false");
  if (canonicalFilesAfterDryRun.length !== 0) throw new Error("dry-run created canonical files");

  return {
    ok: true,
    selfTest: "write-official-route-fixture-evidence-promotion-plan-file",
    summary: dryRun.summary,
    guarantees: dryRun.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildWritePlan({
    inputPath: args.input,
    canonicalRoot: args.canonicalRoot,
    apply: args.apply,
    allowProductionWrites: args.allowProductionWrites
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byCompetition: report.byCompetition,
    guardrails: report.guardrails,
    guarantees: report.guarantees
  }, null, 2));
}

main();
