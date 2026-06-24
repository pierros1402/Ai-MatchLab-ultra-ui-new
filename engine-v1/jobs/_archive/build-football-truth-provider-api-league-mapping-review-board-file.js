import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const discoveryPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-discovery-${today}`, `provider-api-league-mapping-discovery-${today}.json`);
const discoveryRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-discovery-${today}`, `provider-api-league-mapping-discovery-rows-${today}.jsonl`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-league-mapping-review-board-${today}`);
const outputPath = path.join(outputDir, `provider-api-league-mapping-review-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-league-mapping-review-board-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function exactOrAliasScore(row, candidate) {
  const league = normalize(row.league);
  const country = normalize(row.country);
  const candLeague = normalize(candidate.providerLeagueName);
  const candCountry = normalize(candidate.providerCountry);

  const aliases = {
    "eng.1": ["premier league"],
    "esp.1": ["laliga", "la liga", "primera division"],
    "ger.1": ["bundesliga"],
    "sco.1": ["scottish premiership", "premiership"],
    "swe.1": ["allsvenskan"],
    "fin.1": ["veikkausliiga"]
  };

  let strictScore = candidate.candidateScore || 0;
  const strictReasons = [...(candidate.candidateScoreReasons || [])];

  const aliasHits = (aliases[row.slug] || []).filter(alias => candLeague === normalize(alias) || candLeague.includes(normalize(alias)));
  if (aliasHits.length > 0) {
    strictScore += 60;
    strictReasons.push(`alias_hit_${aliasHits.join("_")}`);
  }

  if (candLeague === league) {
    strictScore += 70;
    strictReasons.push("strict_league_exact");
  }

  if (candCountry === country) {
    strictScore += 45;
    strictReasons.push("strict_country_exact");
  }

  if (row.providerFamily === "api_football" && Array.isArray(candidate.providerSeasonHints) && candidate.providerSeasonHints.includes(String(row.seasonLabel).slice(0, 4))) {
    strictScore += 20;
    strictReasons.push("provider_season_year_available");
  }

  if (row.providerFamily === "thesportsdb" && candidate.providerType && normalize(candidate.providerType).includes("soccer")) {
    strictScore += 15;
    strictReasons.push("sportsdb_soccer_type");
  }

  const wrongLeagueNoise =
    candLeague.includes("women") ||
    candLeague.includes("u21") ||
    candLeague.includes("u19") ||
    candLeague.includes("cup") ||
    candLeague.includes("reserves") ||
    candLeague.includes("youth");

  if (wrongLeagueNoise) {
    strictScore -= 80;
    strictReasons.push("wrong_competition_noise");
  }

  return { strictScore, strictReasons };
}

await fs.mkdir(outputDir, { recursive: true });

const discovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
const discoveryRows = parseJsonl(await fs.readFile(discoveryRowsPath, "utf8"));

const reviewRows = [];

for (const row of discoveryRows) {
  const candidates = (row.topCandidates || []).map(candidate => {
    const strict = exactOrAliasScore(row, candidate);
    return {
      providerFamily: candidate.providerFamily,
      providerLeagueId: candidate.providerLeagueId,
      providerLeagueName: candidate.providerLeagueName,
      providerCountry: candidate.providerCountry,
      providerType: candidate.providerType,
      providerSeasonHints: candidate.providerSeasonHints || [],
      candidateScore: candidate.candidateScore,
      candidateScoreReasons: candidate.candidateScoreReasons || [],
      strictScore: strict.strictScore,
      strictReasons: strict.strictReasons,
      mappingAcceptedNow: false
    };
  }).sort((a, b) => b.strictScore - a.strictScore || String(a.providerLeagueName).localeCompare(String(b.providerLeagueName)));

  const top = candidates[0] || null;
  const second = candidates[1] || null;
  const margin = top && second ? top.strictScore - second.strictScore : top ? top.strictScore : 0;

  let reviewStatus = "no_candidate";
  let selectedMappingCandidate = null;

  if (top && top.strictScore >= 180 && margin >= 40) {
    reviewStatus = "single_strong_mapping_candidate";
    selectedMappingCandidate = top;
  } else if (top && top.strictScore >= 150) {
    reviewStatus = "ambiguous_mapping_candidate";
  } else if (top) {
    reviewStatus = "weak_mapping_candidate";
  }

  reviewRows.push({
    slug: row.slug,
    league: row.league,
    country: row.country,
    providerFamily: row.providerFamily,
    discoveryStatus: row.mappingDiscoveryStatus,
    httpStatus: row.httpStatus || null,
    candidateCount: row.candidateCount || 0,
    selectedMappingCandidateCountFromDiscovery: row.selectedMappingCandidateCount || 0,
    reviewStatus,
    selectedMappingCandidate,
    topCandidateMargin: margin,
    topCandidates: candidates.slice(0, 8),
    providerLeagueIdAcceptedNow: null,
    mappingAcceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  });
}

const report = {
  status: "passed",
  runner: "provider_api_league_mapping_review_board",
  contractVersion: 1,
  purpose: "Strictly review provider league-id mapping candidates before any standings fetch. No fetch/search/canonical/truth/production writes.",
  discoveryPath: path.relative(root, discoveryPath).replaceAll("\\", "/"),
  discoveryRowsPath: path.relative(root, discoveryRowsPath).replaceAll("\\", "/"),
  discoverySha256: await sha256(discoveryPath),
  discoveryRowsSha256: await sha256(discoveryRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
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
  sourceDiscoverySummary: discovery.summary,
  summary: {
    reviewRowCount: reviewRows.length,
    providerFamilies: [...new Set(reviewRows.map(row => row.providerFamily))].sort(),
    singleStrongMappingCandidateRowCount: reviewRows.filter(row => row.reviewStatus === "single_strong_mapping_candidate").length,
    ambiguousMappingCandidateRowCount: reviewRows.filter(row => row.reviewStatus === "ambiguous_mapping_candidate").length,
    weakMappingCandidateRowCount: reviewRows.filter(row => row.reviewStatus === "weak_mapping_candidate").length,
    noCandidateRowCount: reviewRows.filter(row => row.reviewStatus === "no_candidate").length,
    strongMappingCandidates: reviewRows
      .filter(row => row.reviewStatus === "single_strong_mapping_candidate")
      .map(row => ({
        slug: row.slug,
        league: row.league,
        providerFamily: row.providerFamily,
        providerLeagueId: row.selectedMappingCandidate?.providerLeagueId,
        providerLeagueName: row.selectedMappingCandidate?.providerLeagueName,
        providerCountry: row.selectedMappingCandidate?.providerCountry,
        strictScore: row.selectedMappingCandidate?.strictScore,
        topCandidateMargin: row.topCandidateMargin
      })),
    acceptedNowCount: 0,
    recommendedNextLane: "If strong candidates exist, build a provider standings proof plan for those exact mappings only; still no canonical write."
  },
  rows: reviewRows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, reviewRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary
}, null, 2));
