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
    allowedCompetitions: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i];
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--competitions") args.allowedCompetitions = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
    else if (arg.startsWith("--competitions=")) args.allowedCompetitions = arg.slice("--competitions=".length).split(",").map((x) => x.trim()).filter(Boolean);
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

function rowsOf(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.fixtureEvidenceRows)) return input.fixtureEvidenceRows;
  if (Array.isArray(input?.evidenceRows)) return input.evidenceRows;
  return [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function safeKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalStatus(row) {
  const status = text(row.status).toLowerCase();

  if (status === "finished" || status === "played" || status === "ft") return "FT";
  if (status === "scheduled" || status === "fixture" || status === "planned") return "PRE";

  return "";
}

function splitScore(score) {
  const raw = text(score);
  if (!raw) return { scoreHome: null, scoreAway: null, scoreParseStatus: "empty" };

  const match = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return { scoreHome: null, scoreAway: null, scoreParseStatus: "unparsed" };

  return {
    scoreHome: Number(match[1]),
    scoreAway: Number(match[2]),
    scoreParseStatus: "parsed"
  };
}

function normalizeKickoff(row) {
  const date = text(row.date);
  const time = text(row.time);

  if (!date) {
    return {
      dayKey: "",
      kickoffLocal: "",
      kickoffUtc: ""
    };
  }

  if (!time) {
    return {
      dayKey: date,
      kickoffLocal: date,
      kickoffUtc: ""
    };
  }

  return {
    dayKey: date,
    kickoffLocal: `${date}T${time}`,
    kickoffUtc: ""
  };
}

function makeMatchId(row, index) {
  const competitionSlug = text(row.competitionSlug || row.leagueSlug);
  const date = text(row.date);
  const time = text(row.time);
  const home = safeKey(row.homeTeam);
  const away = safeKey(row.awayTeam);
  const rowIndex = text(row.rowIndex || index);

  return `official-route-${safeKey(competitionSlug)}-${safeKey(date)}-${safeKey(time)}-${home}-${away}-${safeKey(rowIndex)}`;
}

function validateEvidenceRow(row, index) {
  const blockedReasons = [];

  const competitionSlug = text(row.competitionSlug || row.leagueSlug);
  const leagueSlug = text(row.leagueSlug || row.competitionSlug);
  const date = text(row.date);
  const homeTeam = text(row.homeTeam);
  const awayTeam = text(row.awayTeam);
  const status = canonicalStatus(row);
  const finalUrl = text(row.finalUrl || row.candidateUrl);

  if (!competitionSlug) blockedReasons.push("missing_competitionSlug");
  if (!leagueSlug) blockedReasons.push("missing_leagueSlug");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) blockedReasons.push("missing_or_invalid_date");
  if (!homeTeam) blockedReasons.push("missing_homeTeam");
  if (!awayTeam) blockedReasons.push("missing_awayTeam");
  if (!status) blockedReasons.push("missing_or_unknown_status");
  if (!finalUrl) blockedReasons.push("missing_finalUrl");

  const score = splitScore(row.score);
  if (status === "FT" && score.scoreParseStatus !== "parsed") {
    blockedReasons.push("finished_row_without_parseable_score");
  }

  return {
    index,
    competitionSlug,
    leagueSlug,
    ready: blockedReasons.length === 0,
    blockedReasons
  };
}

function planRowFromEvidence(row, index) {
  const validation = validateEvidenceRow(row, index);
  const { dayKey, kickoffLocal, kickoffUtc } = normalizeKickoff(row);
  const status = canonicalStatus(row);
  const score = splitScore(row.score);
  const competitionSlug = validation.competitionSlug;
  const leagueSlug = validation.leagueSlug;

  return {
    matchId: makeMatchId(row, index),
    matchKey: makeMatchId(row, index),
    source: "official_route_fixture_evidence",
    sourceType: "official_route_fixture_evidence",
    sourceContract: text(row.sourceContract),
    provider: text(row.provider),
    sourceFamily: text(row.sourceFamily),
    trustTier: text(row.trustTier),
    evidenceType: text(row.evidenceType),
    sourcePageKind: text(row.sourcePageKind),
    sourceUrl: text(row.finalUrl || row.candidateUrl),
    finalUrl: text(row.finalUrl),
    candidateUrl: text(row.candidateUrl),
    hostname: text(row.hostname),
    leagueSlug,
    competitionSlug,
    dayKey,
    date: text(row.date),
    time: text(row.time),
    kickoffLocal,
    kickoffUtc,
    homeTeam: text(row.homeTeam),
    awayTeam: text(row.awayTeam),
    scoreHome: status === "FT" ? score.scoreHome : null,
    scoreAway: status === "FT" ? score.scoreAway : null,
    status,
    rawStatus: text(row.status),
    rawScore: text(row.score),
    rawCells: row.rawCells || [],
    rawText: text(row.rawText),
    tableIndex: row.tableIndex ?? null,
    rowIndex: row.rowIndex ?? null,
    acceptedForEvidence: true,
    readyForPromotionPlan: validation.ready,
    blockedReasons: validation.blockedReasons,
    canonicalWrites: 0,
    productionWrite: false,
    writerRequired: "generic_official_route_fixture_writer_or_generalized_guarded_fixture_writer",
    canonicalTarget: validation.ready
      ? `data/canonical-fixtures/${dayKey}/${leagueSlug}.json`
      : null
  };
}

function summarizeByCompetition(rows) {
  const byCompetition = {};

  for (const row of rows) {
    const slug = row.competitionSlug || "unknown";
    byCompetition[slug] ||= {
      competitionSlug: slug,
      rowCount: 0,
      readyRows: 0,
      blockedRows: 0,
      finishedRows: 0,
      scheduledRows: 0
    };

    const item = byCompetition[slug];
    item.rowCount += 1;

    if (row.readyForPromotionPlan) item.readyRows += 1;
    else item.blockedRows += 1;

    if (row.status === "FT") item.finishedRows += 1;
    else if (row.status === "PRE") item.scheduledRows += 1;
  }

  return Object.values(byCompetition).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function buildPlan({ inputPath, allowedCompetitions }) {
  const input = readJson(inputPath);
  const evidenceRows = rowsOf(input);
  const allowed = allowedCompetitions ? new Set(allowedCompetitions) : null;

  const selectedRows = evidenceRows.filter((row) => {
    const slug = text(row.competitionSlug || row.leagueSlug);
    return !allowed || allowed.has(slug);
  });

  const proposedInsertRows = selectedRows.map(planRowFromEvidence);
  const readyRows = proposedInsertRows.filter((row) => row.readyForPromotionPlan);
  const blockedRows = proposedInsertRows.filter((row) => !row.readyForPromotionPlan);

  const blockedReasonCounts = {};
  for (const row of blockedRows) {
    for (const reason of row.blockedReasons) {
      blockedReasonCounts[reason] = (blockedReasonCounts[reason] || 0) + 1;
    }
  }

  return {
    ok: true,
    job: "build-official-route-fixture-evidence-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_official_route_fixture_evidence_promotion_plan",
    input: {
      inputPath,
      inputRows: evidenceRows.length,
      selectedRows: selectedRows.length,
      allowedCompetitions: allowedCompetitions || null
    },
    schema: {
      sourceType: "official_route_fixture_evidence",
      targetWriter: "generic_official_route_fixture_writer_or_generalized_guarded_fixture_writer",
      proposedInsertRows: "writer-compatible candidate rows, not canonical writes",
      blockedRows: "rows excluded from promotion readiness",
      readyRows: "rows that can be passed to a future guarded writer dry-run"
    },
    summary: {
      inputRows: evidenceRows.length,
      selectedRows: selectedRows.length,
      proposedInsertRows: proposedInsertRows.length,
      readyRows: readyRows.length,
      blockedRows: blockedRows.length,
      wouldWriteCanonicalRows: readyRows.length,
      actualCanonicalWrites: 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      blockedReasonCounts
    },
    byCompetition: summarizeByCompetition(proposedInsertRows),
    readyRows,
    blockedRows,
    proposedInsertRows,
    guardrails: {
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      noWriterExecution: true,
      noProductionWrite: true,
      doesNotUseUefaFixtureApiWriter: true,
      doesNotUseEspnCanonicalRowsAsOfficialProof: true
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    }
  };
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(process.cwd(), ".tmp-official-route-plan-"));
  const inputPath = path.join(tmp, "evidence.json");

  writeJson(inputPath, {
    rows: [
      {
        competitionSlug: "nor.1",
        leagueSlug: "nor.1",
        sourceContract: "ntf_official",
        provider: "norway_ntf_official",
        sourceFamily: "official_route",
        trustTier: "official",
        evidenceType: "fixture_result",
        finalUrl: "https://example.test",
        date: "2026-04-01",
        time: "19:00",
        homeTeam: "A",
        awayTeam: "B",
        score: "2-1",
        status: "finished"
      },
      {
        competitionSlug: "nor.1",
        leagueSlug: "nor.1",
        sourceContract: "ntf_official",
        provider: "norway_ntf_official",
        sourceFamily: "official_route",
        trustTier: "official",
        evidenceType: "fixture_result",
        finalUrl: "https://example.test",
        date: "2026-04-02",
        time: "19:00",
        homeTeam: "C",
        awayTeam: "D",
        score: "",
        status: "scheduled"
      }
    ]
  });

  const plan = buildPlan({ inputPath, allowedCompetitions: ["nor.1"] });
  fs.rmSync(tmp, { recursive: true, force: true });

  if (plan.summary.inputRows !== 2) throw new Error("expected 2 input rows");
  if (plan.summary.readyRows !== 2) throw new Error("expected 2 ready rows");
  if (plan.summary.blockedRows !== 0) throw new Error("expected 0 blocked rows");
  if (plan.summary.actualCanonicalWrites !== 0) throw new Error("expected 0 actual writes");
  if (plan.guarantees.productionWrite !== false) throw new Error("expected productionWrite false");
  if (plan.proposedInsertRows[0].sourceType !== "official_route_fixture_evidence") {
    throw new Error("expected generic official route sourceType");
  }

  return {
    ok: true,
    selfTest: "build-official-route-fixture-evidence-promotion-plan-file",
    summary: plan.summary,
    guarantees: plan.guarantees
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

  const plan = buildPlan({
    inputPath: args.input,
    allowedCompetitions: args.allowedCompetitions
  });

  writeJson(args.output, plan);

  console.log(JSON.stringify({
    output: args.output,
    summary: plan.summary,
    byCompetition: plan.byCompetition,
    guardrails: plan.guardrails,
    guarantees: plan.guarantees
  }, null, 2));
}

main();
