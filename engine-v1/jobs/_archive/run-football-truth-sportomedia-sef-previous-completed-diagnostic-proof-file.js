import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const allowFetch = args.includes("--allow-fetch");

const contractPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-graphql-request-contract-${today}`, `sportomedia-sef-graphql-request-contract-${today}.json`);
const verifierPath = path.join(root, "engine-v1", "jobs", "verify-football-truth-sportomedia-sef-previous-completed-proof-output-file.js");

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-diagnostic-proof-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-previous-completed-diagnostic-proof-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-previous-completed-diagnostic-proof-rows-${today}.jsonl`);

const endpoint = "https://gql.sportomedia.se/graphql";

const standingsQuery = `
query StandingsForLeague(
  $configLeagueName: String!
  $configSeasonStartYear: Int!
  $type: String!
) {
  standingsForLeague(
    configLeagueName: $configLeagueName
    configSeasonStartYear: $configSeasonStartYear
    type: $type
  ) {
    standings {
      teamAbbrv
      borderType
      teamName
      position
      previousPosition
      stats {
        value
        name
      }
      teamId
      form {
        configLeagueName
        configSeasonStartYear
        homeTeamAbbrv
        homeTeamDisplayName
        homeTeamName
        homeTeamScore
        id
        matchResult
        round
        startDate
        visitingTeamAbbrv
        visitingTeamDisplayName
        visitingTeamName
        visitingTeamScore
      }
    }
  }
}
`;

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function statsMap(stats) {
  const map = {};
  for (const stat of Array.isArray(stats) ? stats : []) {
    if (stat && stat.name !== undefined) map[String(stat.name)] = stat.value;
  }
  return map;
}

function normalizeStandingRow(row) {
  const s = statsMap(row.stats);
  const gf = Number(s.gf ?? 0);
  const ga = Number(s.ga ?? 0);

  return {
    rank: Number(row.position ?? 0),
    team: String(row.teamName ?? "").trim(),
    played: Number(s.gp ?? 0),
    wins: Number(s.w ?? 0),
    draws: Number(s.t ?? 0),
    losses: Number(s.l ?? 0),
    goalsFor: gf,
    goalsAgainst: ga,
    goalDifference: gf - ga,
    points: Number(s.pts ?? 0)
  };
}

function validateMappedRows(rows, target) {
  const blocks = [];
  const seen = new Set();
  let maxPlayed = 0;
  let playedPassCount = 0;
  let pointsPassCount = 0;
  let gdPassCount = 0;
  let nonTrivialCount = 0;

  if (rows.length !== target.expectedRows) blocks.push("mapped_row_count_mismatch");

  for (const row of rows) {
    for (const field of ["rank", "team", "played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDifference", "points"]) {
      if (row[field] === null || row[field] === undefined || row[field] === "" || (typeof row[field] === "number" && !Number.isFinite(row[field]))) {
        blocks.push(`missing_or_invalid_${field}`);
      }
    }

    const teamKey = norm(row.team);
    if (!teamKey) blocks.push("empty_team");
    if (seen.has(teamKey)) blocks.push(`duplicate_team_${teamKey}`);
    seen.add(teamKey);

    if (row.played === row.wins + row.draws + row.losses) playedPassCount += 1;
    if (row.points === row.wins * 3 + row.draws) pointsPassCount += 1;
    if (row.goalDifference === row.goalsFor - row.goalsAgainst) gdPassCount += 1;
    if ((row.played || 0) > 0 && ((row.points || 0) > 0 || (row.goalsFor || 0) > 0)) nonTrivialCount += 1;
    if ((row.played || 0) > maxPlayed) maxPlayed = row.played || 0;
  }

  if (maxPlayed !== target.expectedMaxPlayed) blocks.push("max_played_mismatch");
  if (playedPassCount !== target.expectedRows) blocks.push("played_arithmetic_failed");
  if (pointsPassCount !== target.expectedRows) blocks.push("points_arithmetic_failed");
  if (gdPassCount !== target.expectedRows) blocks.push("goal_difference_arithmetic_failed");
  if (nonTrivialCount !== target.expectedRows) blocks.push("non_trivial_failed");

  const tableText = rows.map(row => row.team).join(" ");
  const teamSignalHits = target.signalTerms.filter(term => norm(tableText).includes(norm(term)));
  if (teamSignalHits.length < target.validationMinimumTeamSignals) blocks.push("team_signal_minimum_failed");

  return {
    validationPassed: blocks.length === 0,
    blocks: [...new Set(blocks)],
    metrics: {
      maxPlayed,
      playedPassCount,
      pointsPassCount,
      gdPassCount,
      nonTrivialCount,
      teamSignalHits
    }
  };
}

function curlExactPayload(target) {
  const body = JSON.stringify({
    operationName: "StandingsForLeague",
    query: standingsQuery,
    variables: {
      configLeagueName: target.configLeagueName,
      configSeasonStartYear: 2024,
      type: "total"
    }
  });

  const origin = new URL(target.sourceUrl).origin;

  const result = spawnSync("curl.exe", [
    "--location",
    "--ipv4",
    "--http1.1",
    "--connect-timeout", "5",
    "--max-time", "18",
    "--max-filesize", "4000000",
    "--silent",
    "--show-error",
    "--request", "POST",
    "--header", "Content-Type: application/json",
    "--header", `Origin: ${origin}`,
    "--header", `Referer: ${target.sourceUrl}`,
    "--data", body,
    endpoint
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });

  return {
    status: result.status,
    stderr: result.stderr || "",
    stdout: result.stdout || "",
    payloadSha256: sha256Text(body),
    responseSha256: sha256Text(result.stdout || "")
  };
}

await fs.mkdir(outputDir, { recursive: true });

const blocks = [];

const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
if (contract.status !== "passed") blocks.push("graphql_contract_status_not_passed");
if (contract.summary?.readyToImplementDiagnosticOnlyWrapper !== true) blocks.push("graphql_contract_not_ready");
if (!contract.graphqlEndpointCandidates?.includes(endpoint)) blocks.push("sportomedia_graphql_endpoint_missing_from_contract");

if (!allowFetch) blocks.push("missing_required_allow_fetch_flag");

const targets = [
  {
    slug: "swe.1",
    league: "Allsvenskan",
    country: "Sweden",
    sourceFamily: "sportomedia_sef",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    validationMinimumTeamSignals: 4,
    signalTerms: ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg"],
    sourceUrl: "https://allsvenskan.se/tabell",
    configLeagueName: "allsvenskan"
  },
  {
    slug: "swe.2",
    league: "Superettan",
    country: "Sweden",
    sourceFamily: "sportomedia_sef",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    validationMinimumTeamSignals: 4,
    signalTerms: ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage"],
    sourceUrl: "https://superettan.se/tabell",
    configLeagueName: "superettan"
  }
];

const proofRows = [];
const requestAttempts = [];

if (allowFetch && blocks.length === 0) {
  for (const target of targets) {
    const response = curlExactPayload(target);

    let parsed = null;
    let parseError = null;
    try {
      parsed = JSON.parse(response.stdout);
    } catch (error) {
      parseError = String(error?.message ?? error);
    }

    const graphQlErrors = Array.isArray(parsed?.errors) ? parsed.errors : [];
    const rawStandingRows = parsed?.data?.standingsForLeague?.standings;
    const rawRows = Array.isArray(rawStandingRows) ? rawStandingRows : [];
    const mappedRows = rawRows.map(normalizeStandingRow);
    const validation = validateMappedRows(mappedRows, target);

    requestAttempts.push({
      slug: target.slug,
      requestLabel: `${target.slug}_StandingsForLeague_${target.configLeagueName}_2024_total`,
      endpoint,
      status: response.status,
      stderr: response.stderr.slice(0, 500),
      payloadSha256: response.payloadSha256,
      responseSha256: response.responseSha256,
      parseError,
      graphQlErrorCount: graphQlErrors.length,
      rawStandingRowCount: rawRows.length,
      mappedRowCount: mappedRows.length,
      validationPassed: validation.validationPassed,
      validationBlocks: validation.blocks
    });

    proofRows.push({
      slug: target.slug,
      league: target.league,
      country: target.country,
      sourceFamily: target.sourceFamily,
      seasonScope: target.seasonScope,
      seasonLabel: target.seasonLabel,
      sourceUrl: target.sourceUrl,
      fetchedAt: new Date().toISOString(),
      expectedRows: target.expectedRows,
      extractedRowCount: mappedRows.length,
      teamSignalHits: validation.metrics.teamSignalHits || [],
      standingsRows: mappedRows,
      validation: {
        validationPassed: validation.validationPassed,
        blocks: validation.blocks,
        metrics: validation.metrics,
        requestLabel: `${target.slug}_StandingsForLeague_${target.configLeagueName}_2024_total`,
        endpoint,
        operationName: "StandingsForLeague",
        variables: {
          configLeagueName: target.configLeagueName,
          configSeasonStartYear: 2024,
          type: "total"
        },
        responseSha256: response.responseSha256
      },
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });
  }
}

const validationPassedRowCount = proofRows.filter(row => row.validation?.validationPassed).length;

const report = {
  status: blocks.length === 0 && validationPassedRowCount === targets.length ? "passed" : "failed",
  runner: "sportomedia_sef_previous_completed_diagnostic_only_proof",
  contractVersion: 2,
  purpose: "Diagnostic-only Sportomedia/SEF previous_completed 2024 proof for swe.1/swe.2 using exact StandingsForLeague payload. Fetches only official Sportomedia GraphQL endpoint; writes only diagnostics; no canonical/truth/production path.",
  contractPath: rel(contractPath),
  contractSha256: await sha256(contractPath),
  verifierPath: rel(verifierPath),
  verifierSha256: await sha256(verifierPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: requestAttempts.length,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: requestAttempts.length,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: targets.length,
    targetSlugs: targets.map(target => target.slug),
    targetSeasonScope: "previous_completed",
    targetSeasonLabel: "2024",
    endpoint,
    operationName: "StandingsForLeague",
    exactVariablesUsed: targets.map(target => ({
      slug: target.slug,
      configLeagueName: target.configLeagueName,
      configSeasonStartYear: 2024,
      type: "total"
    })),
    requestAttemptCount: requestAttempts.length,
    validationPassedRowCount,
    validationFailedRowCount: targets.length - validationPassedRowCount,
    acceptedNowCount: 0,
    canonicalCandidateWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    rawPayloadWritten: false,
    readyForVerifier: true
  },
  requestAttempts,
  rows: proofRows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, proofRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  requestAttempts: report.requestAttempts,
  blocks: report.blocks
}, null, 2));

if (report.status !== "passed") process.exitCode = 1;
