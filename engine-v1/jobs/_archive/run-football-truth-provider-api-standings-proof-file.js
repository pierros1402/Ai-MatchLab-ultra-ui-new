import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const args = new Set(process.argv.slice(2));
const allowFetch = args.has("--allow-fetch");
const allowTheSportsDbTestKey = args.has("--allow-thesportsdb-test-key");

const configPath = path.join(root, "engine-v1", "config", "football-truth-provider-api-source-contracts.json");
const contractRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-source-contract-board-${today}`, `provider-api-source-contract-board-rows-${today}.jsonl`);
const mappingReviewPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-${today}`, `provider-api-league-mapping-review-board-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-${today}`);
const outputPath = path.join(outputDir, `provider-api-standings-proof-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-standings-proof-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getPath(obj, dottedPath) {
  return String(dottedPath).split(".").reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : undefined, obj);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveProviderSeasonParam(providerFamily, seasonLabel) {
  const firstYear = String(seasonLabel || "").match(/\d{4}/)?.[0] || "";
  if (providerFamily === "api_football") return firstYear;
  if (providerFamily === "thesportsdb") return String(seasonLabel || firstYear);
  return firstYear;
}

function flattenApiFootballStandings(json) {
  const out = [];
  for (const responseItem of json?.response || []) {
    for (const leagueStanding of responseItem?.league?.standings || []) {
      if (Array.isArray(leagueStanding)) out.push(...leagueStanding);
    }
  }
  return out;
}

function flattenTheSportsDbStandings(json) {
  if (Array.isArray(json?.table)) return json.table;
  if (Array.isArray(json?.standings)) return json.standings;
  return [];
}

function mapStandingRow(raw, rowMapping) {
  const mapped = {
    rank: getPath(raw, rowMapping.rank),
    team: getPath(raw, rowMapping.team),
    teamId: getPath(raw, rowMapping.teamId),
    played: num(getPath(raw, rowMapping.played)),
    wins: num(getPath(raw, rowMapping.wins)),
    draws: num(getPath(raw, rowMapping.draws)),
    losses: num(getPath(raw, rowMapping.losses)),
    goalsFor: num(getPath(raw, rowMapping.goalsFor)),
    goalsAgainst: num(getPath(raw, rowMapping.goalsAgainst)),
    goalDifference: num(getPath(raw, rowMapping.goalDifference)),
    points: num(getPath(raw, rowMapping.points))
  };

  return mapped;
}

function validateRows(mappedRows, contractRow) {
  const expectedRows = contractRow.expectedRows;
  const teamSignals = contractRow.teamSignalTerms || [];
  const tableText = mappedRows.map(row => String(row.team || "")).join(" ").toLowerCase();

  const teamSignalHits = teamSignals.filter(term => tableText.includes(String(term).toLowerCase()));
  let playedArithmeticPassCount = 0;
  let pointsArithmeticPassCount = 0;
  let gdArithmeticPassCount = 0;
  let nonTrivialRows = 0;

  for (const row of mappedRows) {
    if ([row.played, row.wins, row.draws, row.losses].every(v => typeof v === "number")) {
      if (row.played === row.wins + row.draws + row.losses) playedArithmeticPassCount += 1;
    }

    if ([row.points, row.wins, row.draws].every(v => typeof v === "number")) {
      if (row.points === row.wins * 3 + row.draws) pointsArithmeticPassCount += 1;
    }

    if ([row.goalDifference, row.goalsFor, row.goalsAgainst].every(v => typeof v === "number")) {
      if (row.goalDifference === row.goalsFor - row.goalsAgainst) gdArithmeticPassCount += 1;
    }

    if ((row.played || 0) > 0 || (row.points || 0) > 0 || (row.goalsFor || 0) > 0) nonTrivialRows += 1;
  }

  const extractedRowCount = mappedRows.length;
  const expectedRowsPass = extractedRowCount === expectedRows;
  const teamSignalPass = teamSignalHits.length >= Math.min(3, teamSignals.length);
  const playedArithmeticPass = playedArithmeticPassCount === extractedRowCount && extractedRowCount > 0;
  const pointsArithmeticPass = pointsArithmeticPassCount === extractedRowCount && extractedRowCount > 0;
  const gdArithmeticPass = gdArithmeticPassCount === extractedRowCount && extractedRowCount > 0;
  const nonTrivialPass = nonTrivialRows >= Math.max(1, Math.floor(extractedRowCount * 0.8));

  return {
    expectedRows,
    extractedRowCount,
    expectedRowsPass,
    teamSignalHits,
    teamSignalCount: teamSignalHits.length,
    teamSignalPass,
    playedArithmeticPassCount,
    playedArithmeticPass,
    pointsArithmeticPassCount,
    pointsArithmeticPass,
    gdArithmeticPassCount,
    gdArithmeticPass,
    nonTrivialRows,
    nonTrivialPass,
    validationPassed: expectedRowsPass &&
      teamSignalPass &&
      playedArithmeticPass &&
      pointsArithmeticPass &&
      gdArithmeticPass &&
      nonTrivialPass
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      ok: response.ok,
      status: response.status,
      url,
      json,
      textPreview: text.slice(0, 300)
    };
  } finally {
    clearTimeout(timeout);
  }
}

await fs.mkdir(outputDir, { recursive: true });

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const contractRows = parseJsonl(await fs.readFile(contractRowsPath, "utf8"));
const mappingReview = JSON.parse(await fs.readFile(mappingReviewPath, "utf8"));

const providerByName = new Map((config.providerFamilies || []).map(provider => [provider.providerFamily, provider]));
const contractBySlugProvider = new Map(contractRows.map(row => [`${row.slug}|${row.providerFamily}`, row]));

const strongMappings = mappingReview.summary.strongMappingCandidates || [];
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch_flag");
if (config.globalPolicy?.providerTruthWithoutValidationAllowed !== false) blocks.push("provider_truth_without_validation_not_false");
if (config.globalPolicy?.canonicalWriteAllowedByThisConfig !== false) blocks.push("canonical_write_allowed_by_config");
if (config.globalPolicy?.truthAssertionAllowedByThisConfig !== false) blocks.push("truth_assertion_allowed_by_config");
if (strongMappings.length !== 5) blocks.push("strong_mapping_candidate_count_not_5");

const rows = [];
let providerFetchExecutedNowCount = 0;
let standingsFetchExecutedNowCount = 0;
let failedFetchCount = 0;
let skippedNoKeyCount = 0;

if (blocks.length === 0) {
  for (const mapping of strongMappings) {
    const provider = providerByName.get(mapping.providerFamily);
    const contractRow = contractBySlugProvider.get(`${mapping.slug}|${mapping.providerFamily}`);

    if (!provider || !contractRow) {
      rows.push({
        slug: mapping.slug,
        providerFamily: mapping.providerFamily,
        proofStatus: "missing_provider_or_contract",
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      continue;
    }

    const authEnvVar = provider.auth?.envVar;
    let key = authEnvVar ? process.env[authEnvVar] : "";

    if (!key && provider.providerFamily === "thesportsdb" && allowTheSportsDbTestKey && provider.auth?.testKeyAllowedOnlyForLocalDiagnostics === true) {
      key = "123";
    }

    if (!key) {
      skippedNoKeyCount += 1;
      rows.push({
        slug: mapping.slug,
        league: mapping.league,
        providerFamily: mapping.providerFamily,
        providerLeagueId: mapping.providerLeagueId,
        proofStatus: "skipped_missing_provider_key",
        authEnvVar,
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      continue;
    }

    const providerSeasonParam = deriveProviderSeasonParam(provider.providerFamily, contractRow.seasonLabel);
    const endpointTemplate = provider.endpoints?.standings || "";
    const endpoint = endpointTemplate
      .replace("{providerLeagueId}", encodeURIComponent(mapping.providerLeagueId))
      .replace("{providerSeasonParam}", encodeURIComponent(providerSeasonParam));

    let url = "";
    const headers = {};

    if (provider.providerFamily === "api_football") {
      url = `${provider.baseUrl}${endpoint}`;
      headers[provider.auth.headerName] = key;
    } else if (provider.providerFamily === "thesportsdb") {
      const base = provider.baseUrl.replace("{apiKey}", encodeURIComponent(key));
      url = `${base}${endpoint}`;
    }

    providerFetchExecutedNowCount += 1;
    standingsFetchExecutedNowCount += 1;

    let fetched;
    try {
      fetched = await fetchJson(url, { headers });
    } catch (error) {
      failedFetchCount += 1;
      rows.push({
        slug: mapping.slug,
        league: mapping.league,
        country: mapping.providerCountry,
        providerFamily: mapping.providerFamily,
        providerLeagueId: mapping.providerLeagueId,
        providerSeasonParam,
        proofStatus: "fetch_failed",
        errorName: error?.name || "Error",
        errorMessage: String(error?.message || error).slice(0, 300),
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      continue;
    }

    if (!fetched.ok || !fetched.json) {
      failedFetchCount += 1;
      rows.push({
        slug: mapping.slug,
        league: mapping.league,
        country: mapping.providerCountry,
        providerFamily: mapping.providerFamily,
        providerLeagueId: mapping.providerLeagueId,
        providerLeagueName: mapping.providerLeagueName,
        providerSeasonParam,
        seasonLabel: contractRow.seasonLabel,
        seasonScope: contractRow.seasonScope,
        expectedRows: contractRow.expectedRows,
        proofStatus: "non_ok_or_non_json",
        httpStatus: fetched.status,
        textPreview: fetched.textPreview,
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      await sleep(350);
      continue;
    }

    const rawStandings = provider.providerFamily === "api_football"
      ? flattenApiFootballStandings(fetched.json)
      : flattenTheSportsDbStandings(fetched.json);

    const mappedRows = rawStandings.map(raw => mapStandingRow(raw, provider.rowMapping));
    const validation = validateRows(mappedRows, contractRow);

    rows.push({
      slug: mapping.slug,
      league: mapping.league,
      country: mapping.providerCountry,
      providerFamily: mapping.providerFamily,
      providerLeagueId: mapping.providerLeagueId,
      providerLeagueName: mapping.providerLeagueName,
      providerSeasonParam,
      seasonLabel: contractRow.seasonLabel,
      seasonScope: contractRow.seasonScope,
      expectedRows: contractRow.expectedRows,
      proofStatus: "standings_fetched_and_validated",
      httpStatus: fetched.status,
      rawStandingRowCount: rawStandings.length,
      mappedStandingRowCount: mappedRows.length,
      validation,
      rowPreview: mappedRows.slice(0, 5),
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });

    await sleep(350);
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "provider_api_standings_proof",
  contractVersion: 1,
  purpose: "Fetch and validate standings only for strong provider league mappings. No canonical writes, production writes, or truth assertions.",
  configPath: path.relative(root, configPath).replaceAll("\\", "/"),
  contractRowsPath: path.relative(root, contractRowsPath).replaceAll("\\", "/"),
  mappingReviewPath: path.relative(root, mappingReviewPath).replaceAll("\\", "/"),
  configSha256: await sha256(configPath),
  contractRowsSha256: await sha256(contractRowsPath),
  mappingReviewSha256: await sha256(mappingReviewPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowFetch,
    allowTheSportsDbTestKey,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: providerFetchExecutedNowCount,
    providerFetchExecutedNowCount,
    standingsFetchExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    strongMappingInputCount: strongMappings.length,
    proofRowCount: rows.length,
    providerFetchExecutedNowCount,
    standingsFetchExecutedNowCount,
    skippedNoKeyCount,
    failedFetchCount,
    fetchedAndValidatedRowCount: rows.filter(row => row.proofStatus === "standings_fetched_and_validated").length,
    validationPassedRowCount: rows.filter(row => row.validation?.validationPassed === true).length,
    validationPassedRows: rows
      .filter(row => row.validation?.validationPassed === true)
      .map(row => ({
        slug: row.slug,
        league: row.league,
        providerFamily: row.providerFamily,
        providerLeagueId: row.providerLeagueId,
        providerLeagueName: row.providerLeagueName,
        providerSeasonParam: row.providerSeasonParam,
        seasonLabel: row.seasonLabel,
        seasonScope: row.seasonScope,
        expectedRows: row.expectedRows,
        extractedRowCount: row.validation.extractedRowCount,
        teamSignalCount: row.validation.teamSignalCount,
        playedArithmeticPassCount: row.validation.playedArithmeticPassCount,
        pointsArithmeticPassCount: row.validation.pointsArithmeticPassCount,
        gdArithmeticPassCount: row.validation.gdArithmeticPassCount
      })),
    acceptedNowCount: 0
  },
  blocks,
  rows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
