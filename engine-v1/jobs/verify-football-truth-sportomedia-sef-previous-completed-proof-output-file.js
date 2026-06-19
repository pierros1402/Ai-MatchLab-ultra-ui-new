import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const proofArgIndex = args.indexOf("--proof");

const contractPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-verifier-contract-${today}`, `sportomedia-sef-previous-completed-proof-verifier-contract-${today}.json`);
const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-output-verification-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-previous-completed-proof-output-verification-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-previous-completed-proof-output-verification-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function normalizedTeam(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function targetContracts() {
  return new Map([
    ["swe.1", {
      slug: "swe.1",
      league: "Allsvenskan",
      country: "Sweden",
      sourceFamily: "sportomedia_sef",
      seasonScope: "previous_completed",
      seasonLabel: "2024",
      expectedRows: 16,
      expectedMaxPlayed: 30,
      validationMinimumTeamSignals: 4,
      teamSignalTerms: ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg"]
    }],
    ["swe.2", {
      slug: "swe.2",
      league: "Superettan",
      country: "Sweden",
      sourceFamily: "sportomedia_sef",
      seasonScope: "previous_completed",
      seasonLabel: "2024",
      expectedRows: 16,
      expectedMaxPlayed: 30,
      validationMinimumTeamSignals: 4,
      teamSignalTerms: ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage"]
    }]
  ]);
}

function validateStandingRows(row, target) {
  const blocks = [];
  const standingsRows = Array.isArray(row.standingsRows) ? row.standingsRows : [];

  if (row.extractedRowCount !== target.expectedRows) blocks.push("extracted_row_count_mismatch");
  if (standingsRows.length !== target.expectedRows) blocks.push("standings_rows_length_mismatch");

  const seenTeams = new Set();
  let maxPlayed = 0;
  let playedPassCount = 0;
  let pointsPassCount = 0;
  let gdPassCount = 0;
  let nonTrivialCount = 0;

  for (const standing of standingsRows) {
    for (const field of ["rank", "team", "played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDifference", "points"]) {
      if (standing[field] === undefined || standing[field] === null || standing[field] === "") blocks.push(`missing_standing_field_${field}`);
    }

    const teamKey = normalizedTeam(standing.team);
    if (!teamKey) blocks.push("empty_team_name");
    if (seenTeams.has(teamKey)) blocks.push(`duplicate_team_${teamKey}`);
    seenTeams.add(teamKey);

    const played = numberOrNull(standing.played);
    const wins = numberOrNull(standing.wins);
    const draws = numberOrNull(standing.draws);
    const losses = numberOrNull(standing.losses);
    const goalsFor = numberOrNull(standing.goalsFor);
    const goalsAgainst = numberOrNull(standing.goalsAgainst);
    const goalDifference = numberOrNull(standing.goalDifference);
    const points = numberOrNull(standing.points);

    if ([played, wins, draws, losses].every(value => value !== null) && played === wins + draws + losses) playedPassCount += 1;
    if ([points, wins, draws].every(value => value !== null) && points === wins * 3 + draws) pointsPassCount += 1;
    if ([goalDifference, goalsFor, goalsAgainst].every(value => value !== null) && goalDifference === goalsFor - goalsAgainst) gdPassCount += 1;

    if ((played || 0) > 0 && ((points || 0) > 0 || (goalsFor || 0) > 0)) nonTrivialCount += 1;
    if ((played || 0) > maxPlayed) maxPlayed = played || 0;
  }

  if (maxPlayed !== target.expectedMaxPlayed) blocks.push("max_played_mismatch");
  if (playedPassCount !== target.expectedRows) blocks.push("played_arithmetic_failed");
  if (pointsPassCount !== target.expectedRows) blocks.push("points_arithmetic_failed");
  if (gdPassCount !== target.expectedRows) blocks.push("goal_difference_arithmetic_failed");
  if (nonTrivialCount !== target.expectedRows) blocks.push("non_trivial_completed_table_failed");

  const tableText = standingsRows.map(standing => String(standing.team || "")).join(" ").toLowerCase();
  const computedSignalHits = target.teamSignalTerms.filter(term => tableText.includes(String(term).toLowerCase()));
  const suppliedSignalHits = Array.isArray(row.teamSignalHits) ? row.teamSignalHits : [];

  if (computedSignalHits.length < target.validationMinimumTeamSignals) blocks.push("computed_team_signal_minimum_failed");
  if (suppliedSignalHits.length < target.validationMinimumTeamSignals) blocks.push("supplied_team_signal_minimum_failed");

  return {
    blocks: [...new Set(blocks)],
    metrics: {
      extractedRowCount: row.extractedRowCount,
      standingsRowCount: standingsRows.length,
      maxPlayed,
      playedPassCount,
      pointsPassCount,
      gdPassCount,
      nonTrivialCount,
      computedTeamSignalHits: computedSignalHits,
      suppliedTeamSignalHits: suppliedSignalHits
    }
  };
}

function validateProof(proof) {
  const blocks = [];
  const rowReports = [];
  const targets = targetContracts();

  for (const field of ["status", "runner", "contractVersion", "guardrails", "summary", "rows"]) {
    if (proof?.[field] === undefined) blocks.push(`missing_proof_field_${field}`);
  }

  if (!Array.isArray(proof?.rows)) blocks.push("proof_rows_not_array");

  const guardrails = proof?.guardrails || {};
  for (const key of ["canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
    if (guardrails[key] !== 0) blocks.push(`write_guardrail_${key}_not_zero`);
  }
  if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
  if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

  for (const [slug, target] of targets.entries()) {
    const row = (proof?.rows || []).find(item => item.slug === slug);
    if (!row) {
      rowReports.push({
        slug,
        status: "failed",
        blocks: [`missing_target_row_${slug}`],
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      continue;
    }

    const rowBlocks = [];

    for (const field of ["slug", "league", "country", "sourceFamily", "seasonScope", "seasonLabel", "sourceUrl", "fetchedAt", "expectedRows", "extractedRowCount", "teamSignalHits", "standingsRows", "validation", "acceptedNow", "acceptanceAllowedNow", "reviewOnly"]) {
      if (row[field] === undefined) rowBlocks.push(`missing_row_field_${field}`);
    }

    if (row.league !== target.league) rowBlocks.push("league_mismatch");
    if (row.country !== target.country) rowBlocks.push("country_mismatch");
    if (row.sourceFamily !== target.sourceFamily) rowBlocks.push("source_family_mismatch");
    if (row.seasonScope !== target.seasonScope) rowBlocks.push("season_scope_mismatch");
    if (row.seasonLabel !== target.seasonLabel) rowBlocks.push("season_label_mismatch");
    if (row.expectedRows !== target.expectedRows) rowBlocks.push("expected_rows_mismatch");

    if (row.acceptedNow !== false) rowBlocks.push("accepted_now_not_false");
    if (row.acceptanceAllowedNow !== false) rowBlocks.push("acceptance_allowed_not_false");
    if (row.reviewOnly !== true) rowBlocks.push("review_only_not_true");

    const standingValidation = validateStandingRows(row, target);
    rowBlocks.push(...standingValidation.blocks);

    if (row.validation?.validationPassed !== true) rowBlocks.push("row_validation_flag_not_true");

    rowReports.push({
      slug,
      league: target.league,
      status: rowBlocks.length === 0 ? "passed" : "failed",
      blocks: [...new Set(rowBlocks)],
      metrics: standingValidation.metrics,
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });
  }

  const passedRowCount = rowReports.filter(row => row.status === "passed").length;

  return {
    status: blocks.length === 0 && passedRowCount === targets.size ? "passed" : "failed",
    proofBlocks: [...new Set(blocks)],
    rowReports,
    summary: {
      targetCount: targets.size,
      passedRowCount,
      failedRowCount: rowReports.filter(row => row.status !== "passed").length,
      writeGuardrailsHeld: blocks.filter(block => block.startsWith("write_guardrail_")).length === 0,
      rawPayloadGuardrailsHeld: !blocks.includes("raw_payload_committed_not_false") && !blocks.includes("full_raw_payload_written_not_false"),
      acceptedNowCount: 0
    }
  };
}

function makeStandingRows(slug) {
  const teams = slug === "swe.1"
    ? ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg", "GAIS", "Häcken", "Sirius", "Brommapojkarna", "IFK Göteborg", "IFK Norrköping", "Halmstad", "Kalmar FF", "Värnamo", "Västerås SK"]
    : ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage", "Trelleborg", "Utsikten", "Örgryte", "Örebro", "Gefle", "Sundsvall", "Varberg", "Oddevold", "Skövde AIK", "Östersund"];

  return teams.map((team, index) => {
    const wins = Math.max(1, 20 - index);
    const draws = index % 5;
    const losses = 30 - wins - draws;
    const goalsFor = 60 - index;
    const goalsAgainst = 25 + index;
    return {
      rank: index + 1,
      team,
      played: 30,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: wins * 3 + draws
    };
  });
}

function makeFixtureProof({ invalid = false } = {}) {
  const rows = [...targetContracts().values()].map(target => {
    const standingsRows = makeStandingRows(target.slug);
    const teamSignalHits = target.teamSignalTerms.filter(term =>
      standingsRows.map(row => row.team).join(" ").toLowerCase().includes(term.toLowerCase())
    );

    return {
      slug: target.slug,
      league: target.league,
      country: target.country,
      sourceFamily: target.sourceFamily,
      seasonScope: target.seasonScope,
      seasonLabel: invalid && target.slug === "swe.1" ? "2023" : target.seasonLabel,
      sourceUrl: "self-test://sportomedia-sef",
      fetchedAt: new Date().toISOString(),
      expectedRows: target.expectedRows,
      extractedRowCount: standingsRows.length,
      teamSignalHits,
      standingsRows,
      validation: {
        validationPassed: true
      },
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    };
  });

  return {
    status: "passed",
    runner: "sportomedia_sef_previous_completed_diagnostic_only_proof",
    contractVersion: 1,
    guardrails: {
      searchExecutedNowCount: 0,
      fetchExecutedNowCount: 2,
      providerFetchExecutedNowCount: 0,
      standingsFetchExecutedNowCount: 2,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    },
    summary: {
      targetCount: 2,
      validationPassedRowCount: invalid ? 1 : 2,
      acceptedNowCount: 0
    },
    rows
  };
}

await fs.mkdir(outputDir, { recursive: true });

const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
const blocks = [];

if (contract.status !== "passed") blocks.push("contract_status_not_passed");
if (contract.summary?.family !== "sportomedia_sef") blocks.push("contract_family_not_sportomedia");
if (contract.summary?.targetSeasonScope !== "previous_completed") blocks.push("contract_scope_not_previous_completed");
if (contract.summary?.targetSeasonLabel !== "2024") blocks.push("contract_season_not_2024");
if (contract.summary?.verifierAllowsCanonicalWrite !== false) blocks.push("contract_allows_canonical_write");
if (contract.summary?.verifierAllowsTruthAssertion !== false) blocks.push("contract_allows_truth");

let verification;
let proofPath = null;
let mode = "unknown";

if (selfTest) {
  mode = "self_test";
  const valid = validateProof(makeFixtureProof());
  const invalid = validateProof(makeFixtureProof({ invalid: true }));

  verification = {
    status: valid.status === "passed" && invalid.status === "failed" && blocks.length === 0 ? "passed" : "failed",
    mode,
    validFixtureStatus: valid.status,
    invalidFixtureStatus: invalid.status,
    validFixtureSummary: valid.summary,
    invalidFixtureSummary: invalid.summary,
    invalidFixtureBlocks: invalid.rowReports.flatMap(row => row.blocks),
    contractBlocks: blocks,
    proofBlocks: [],
    rowReports: [
      { fixture: "valid", ...valid.summary },
      { fixture: "invalid", ...invalid.summary }
    ]
  };
} else {
  if (proofArgIndex < 0 || !args[proofArgIndex + 1]) {
    throw new Error("Missing required --proof <path> argument unless --self-test is used.");
  }

  mode = "proof_verification";
  proofPath = path.resolve(root, args[proofArgIndex + 1]);
  const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
  const result = validateProof(proof);

  verification = {
    status: result.status === "passed" && blocks.length === 0 ? "passed" : "failed",
    mode,
    proofPath: rel(proofPath),
    proofSha256: await sha256(proofPath),
    contractBlocks: blocks,
    proofBlocks: result.proofBlocks,
    rowReports: result.rowReports,
    summary: result.summary
  };
}

const report = {
  status: verification.status,
  runner: "verify_sportomedia_sef_previous_completed_proof_output",
  contractVersion: 1,
  mode,
  contractPath: rel(contractPath),
  contractSha256: await sha256(contractPath),
  proofPath: proofPath ? rel(proofPath) : null,
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  verification,
  conclusion: verification.status === "passed"
    ? "Sportomedia/SEF previous_completed proof output verifier passed. It accepts valid fixed 2024 diagnostic-only proof shape and rejects invalid season scope/label."
    : "Sportomedia/SEF previous_completed proof output verifier failed.",
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, verification.rowReports.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  mode: report.mode,
  guardrails: report.guardrails,
  verification: {
    status: verification.status,
    validFixtureStatus: verification.validFixtureStatus || null,
    invalidFixtureStatus: verification.invalidFixtureStatus || null,
    summary: verification.summary || verification.validFixtureSummary || null
  },
  conclusion: report.conclusion,
  blocks: report.blocks
}, null, 2));

if (report.status !== "passed") process.exitCode = 1;
