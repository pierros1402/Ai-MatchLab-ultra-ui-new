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

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-discovery-${today}`);
const outputPath = path.join(outputDir, `provider-api-league-mapping-discovery-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-league-mapping-discovery-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreCandidate(target, candidate) {
  const targetLeague = normalizeText(target.league);
  const targetCountry = normalizeText(target.country);
  const candidateLeague = normalizeText(candidate.providerLeagueName);
  const candidateCountry = normalizeText(candidate.providerCountry);

  let score = 0;
  const reasons = [];

  if (candidateLeague === targetLeague) {
    score += 80;
    reasons.push("league_exact");
  } else if (candidateLeague.includes(targetLeague) || targetLeague.includes(candidateLeague)) {
    score += 45;
    reasons.push("league_contains");
  } else {
    const targetTokens = new Set(targetLeague.split(" ").filter(Boolean));
    const candidateTokens = new Set(candidateLeague.split(" ").filter(Boolean));
    const overlap = [...targetTokens].filter(token => candidateTokens.has(token)).length;
    if (overlap > 0) {
      score += Math.min(35, overlap * 12);
      reasons.push(`league_token_overlap_${overlap}`);
    }
  }

  if (candidateCountry === targetCountry) {
    score += 40;
    reasons.push("country_exact");
  } else if (candidateCountry.includes(targetCountry) || targetCountry.includes(candidateCountry)) {
    score += 20;
    reasons.push("country_contains");
  }

  if (candidate.providerSeasonHints?.includes(target.seasonLabel)) {
    score += 20;
    reasons.push("season_label_available");
  }

  if (target.slug === "sco.1" && /premier|premiership/.test(candidateLeague) && /scotland/.test(candidateCountry)) {
    score += 25;
    reasons.push("scotland_premiership_hint");
  }

  if (target.slug === "fin.1" && /veikkausliiga/.test(candidateLeague)) {
    score += 30;
    reasons.push("veikkausliiga_exact_hint");
  }

  if (target.slug === "swe.1" && /allsvenskan/.test(candidateLeague)) {
    score += 30;
    reasons.push("allsvenskan_exact_hint");
  }

  return { score, reasons };
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
      textPreview: text.slice(0, 400)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function apiFootballCandidates(target, data) {
  const out = [];
  for (const item of data?.response || []) {
    const league = item.league || {};
    const country = item.country || {};
    const seasons = Array.isArray(item.seasons) ? item.seasons : [];
    out.push({
      providerFamily: "api_football",
      providerLeagueId: league.id ?? null,
      providerLeagueName: league.name || "",
      providerCountry: country.name || "",
      providerType: league.type || "",
      providerLogoPresent: Boolean(league.logo),
      providerSeasonHints: seasons.map(s => String(s.year || "")).filter(Boolean),
      rawFieldPreview: {
        leagueId: league.id ?? null,
        leagueName: league.name || "",
        countryName: country.name || "",
        seasonCount: seasons.length
      }
    });
  }
  return out;
}

function theSportsDbCandidates(target, data) {
  const out = [];
  for (const item of data?.countries || data?.leagues || []) {
    out.push({
      providerFamily: "thesportsdb",
      providerLeagueId: item.idLeague ?? null,
      providerLeagueName: item.strLeague || item.strLeagueAlternate || "",
      providerCountry: item.strCountry || target.country || "",
      providerType: item.strSport || "",
      providerLogoPresent: Boolean(item.strBadge || item.strLogo),
      providerSeasonHints: [],
      rawFieldPreview: {
        leagueId: item.idLeague ?? null,
        leagueName: item.strLeague || "",
        countryName: item.strCountry || "",
        sport: item.strSport || ""
      }
    });
  }
  return out;
}

await fs.mkdir(outputDir, { recursive: true });

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const contractRows = parseJsonl(await fs.readFile(contractRowsPath, "utf8"));

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch_flag");
if (config.globalPolicy?.providerTruthWithoutValidationAllowed !== false) blocks.push("provider_truth_without_validation_not_false");
if (config.globalPolicy?.canonicalWriteAllowedByThisConfig !== false) blocks.push("canonical_write_allowed_by_config");
if (config.globalPolicy?.truthAssertionAllowedByThisConfig !== false) blocks.push("truth_assertion_allowed_by_config");

const providerByName = new Map((config.providerFamilies || []).map(provider => [provider.providerFamily, provider]));
const rows = [];
let providerFetchExecutedNowCount = 0;
let skippedNoKeyCount = 0;
let failedFetchCount = 0;

if (blocks.length === 0) {
  for (const contractRow of contractRows) {
    const provider = providerByName.get(contractRow.providerFamily);
    if (!provider) continue;

    const authEnvVar = provider.auth?.envVar;
    let key = authEnvVar ? process.env[authEnvVar] : "";

    if (!key && provider.providerFamily === "thesportsdb" && allowTheSportsDbTestKey && provider.auth?.testKeyAllowedOnlyForLocalDiagnostics === true) {
      key = "123";
    }

    if (!key) {
      skippedNoKeyCount += 1;
      rows.push({
        slug: contractRow.slug,
        league: contractRow.league,
        country: contractRow.country,
        providerFamily: contractRow.providerFamily,
        mappingDiscoveryStatus: "skipped_missing_provider_key",
        authEnvVar,
        candidateCount: 0,
        topCandidates: [],
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      continue;
    }

    let url = "";
    const headers = {};

    if (provider.providerFamily === "api_football") {
      url = `${provider.baseUrl}/leagues?search=${encodeURIComponent(contractRow.league)}`;
      headers[provider.auth.headerName] = key;
    } else if (provider.providerFamily === "thesportsdb") {
      const base = provider.baseUrl.replace("{apiKey}", encodeURIComponent(key));
      url = `${base}/search_all_leagues.php?c=${encodeURIComponent(contractRow.country)}&s=Soccer`;
    } else {
      continue;
    }

    providerFetchExecutedNowCount += 1;
    let fetched;
    try {
      fetched = await fetchJson(url, { headers });
    } catch (error) {
      failedFetchCount += 1;
      rows.push({
        slug: contractRow.slug,
        league: contractRow.league,
        country: contractRow.country,
        providerFamily: contractRow.providerFamily,
        mappingDiscoveryStatus: "fetch_failed",
        authEnvVar,
        candidateCount: 0,
        errorName: error?.name || "Error",
        errorMessage: String(error?.message || error).slice(0, 300),
        topCandidates: [],
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      continue;
    }

    if (!fetched.ok || !fetched.json) {
      failedFetchCount += 1;
      rows.push({
        slug: contractRow.slug,
        league: contractRow.league,
        country: contractRow.country,
        providerFamily: contractRow.providerFamily,
        mappingDiscoveryStatus: "non_ok_or_non_json",
        authEnvVar,
        httpStatus: fetched.status,
        candidateCount: 0,
        textPreview: fetched.textPreview,
        topCandidates: [],
        acceptedNow: false,
        acceptanceAllowedNow: false,
        reviewOnly: true
      });
      await sleep(250);
      continue;
    }

    const candidates = provider.providerFamily === "api_football"
      ? apiFootballCandidates(contractRow, fetched.json)
      : theSportsDbCandidates(contractRow, fetched.json);

    const scored = candidates.map(candidate => {
      const s = scoreCandidate(contractRow, candidate);
      return {
        ...candidate,
        candidateScore: s.score,
        candidateScoreReasons: s.reasons,
        mappingCandidate: s.score >= 80,
        mappingAcceptedNow: false
      };
    }).sort((a, b) => b.candidateScore - a.candidateScore || String(a.providerLeagueName).localeCompare(String(b.providerLeagueName)));

    rows.push({
      slug: contractRow.slug,
      league: contractRow.league,
      country: contractRow.country,
      providerFamily: contractRow.providerFamily,
      mappingDiscoveryStatus: "fetched_candidates",
      authEnvVar,
      httpStatus: fetched.status,
      candidateCount: scored.length,
      topCandidates: scored.slice(0, 8),
      selectedMappingCandidateCount: scored.filter(c => c.mappingCandidate).length,
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });

    await sleep(350);
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "provider_api_league_mapping_discovery",
  contractVersion: 1,
  purpose: "Discover provider league-id mapping candidates only. No standings fetch, no canonical writes, no truth assertions.",
  configPath: path.relative(root, configPath).replaceAll("\\", "/"),
  contractRowsPath: path.relative(root, contractRowsPath).replaceAll("\\", "/"),
  configSha256: await sha256(configPath),
  contractRowsSha256: await sha256(contractRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowFetch,
    allowTheSportsDbTestKey,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: providerFetchExecutedNowCount,
    providerFetchExecutedNowCount,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    inputContractRowCount: contractRows.length,
    mappingDiscoveryRowCount: rows.length,
    providerFetchExecutedNowCount,
    skippedNoKeyCount,
    failedFetchCount,
    fetchedCandidateRowCount: rows.filter(row => row.mappingDiscoveryStatus === "fetched_candidates").length,
    selectedMappingCandidateRowCount: rows.filter(row => (row.selectedMappingCandidateCount || 0) > 0).length,
    selectedMappingCandidateCount: rows.reduce((sum, row) => sum + (row.selectedMappingCandidateCount || 0), 0),
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
