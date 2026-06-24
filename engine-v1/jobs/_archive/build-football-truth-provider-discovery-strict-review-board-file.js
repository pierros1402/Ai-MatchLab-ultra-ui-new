import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = {
    inputDir: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input-dir") args.inputDir = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function asText(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function normalizeHost(value) {
  return asText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

function hostOf(row) {
  const explicit = normalizeHost(row.hostname || row.host || row.domain);
  if (explicit) return explicit;

  try {
    return normalizeHost(new URL(asText(row.url)).hostname);
  } catch {
    return "";
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isRejected(row) {
  const host = hostOf(row);
  const blob = `${host} ${lower(row.title)} ${lower(row.url)}`;

  const rejectedHostsOrTerms = [
    "facebook", "instagram", "wikipedia", "rsssf", "futbol24", "xscores",
    "sofascore", "espn", "foxsports", "footystats", "bbc", "tribuna",
    "flashscore", "livescore", "soccerway", "worldfootball", "transfermarkt",
    "fctables", "fcstats", "scorepulse", "yenisafak", "football-ranking",
    "ranking", "365scores", "aiscore", "besoccer", "oddspedia", "betexplorer",
    "microsoft", "office.com", "support.microsoft", "account.microsoft",
    "britannica", "countryreports", "reddit", "youtube", "twitter", "x.com",
    "travel", "tripadvisor", "hotels", "booking", "poczta.wp.pl", "wp.pl"
  ];

  if (rejectedHostsOrTerms.some((term) => blob.includes(term))) return true;
  if (/national team|fifa ranking|team rankings|world cup qual|wcq/i.test(blob)) return true;

  return false;
}

function hasStandingsSignal(row) {
  const blob = `${lower(row.title)} ${lower(row.url)}`;

  return [
    "standings",
    "standing",
    "league table",
    "points table",
    "points standing",
    "table",
    "tabellen",
    "classement",
    "clasificación",
    "classifica",
    "ranglijst",
    "tabelle",
    "taulukko",
    "turnering/hjem",
    "underside=tabellen"
  ].some((term) => blob.includes(term));
}

function hasSeasonSignal(row) {
  const blob = `${lower(row.title)} ${lower(row.url)}`;
  return /2024|2025|2026|season|current|round|runde|fixtures|results/i.test(blob);
}

function officialHintHostMatch(row, target) {
  const host = hostOf(row);
  const hints = Array.isArray(target.officialHintHosts) ? target.officialHintHosts : [];
  return hints.map(normalizeHost).filter(Boolean).includes(host);
}

function hasOfficialTextIdentity(row) {
  const blob = `${lower(row.title)} ${lower(row.url)} ${hostOf(row)}`;

  return [
    "football federation",
    "football association",
    "soccer federation",
    "soccer association",
    "fédération",
    "fedération",
    "federação",
    "federación",
    "fotballforbund",
    "norges fotballforbund",
    "official site",
    "official website",
    "official"
  ].some((term) => blob.includes(term));
}

function officialHostShape(row) {
  const host = hostOf(row);
  if (!host) return false;

  if (/\bfa\b/.test(host.replace(/[-.]/g, " "))) return true;
  if (/(football|futbol|futebol|soccer).*(federation|association|fed|fa)/i.test(host)) return true;
  if (/(federation|association|fed|fa).*(football|futbol|futebol|soccer)/i.test(host)) return true;

  const compact = host.replace(/[-.]/g, "");
  if (/(fifa|uefa|cafonline|concacaf|the-afc|oceaniafootball)/i.test(compact)) return true;
  if (/(footballfederation|footballassociation|soccerassociation|soccerfederation)/i.test(compact)) return true;

  return false;
}

function identityMatchScore(row, target) {
  const blob = `${lower(row.title)} ${lower(row.url)} ${hostOf(row)}`;
  const query = lower(row.query);
  const country = lower(target.country);
  const registryName = lower(target.registryName || "");
  const targetName = lower(target.name || "");

  let score = 0;

  if (country && blob.includes(country)) score += 1;
  if (country && query.includes(country)) score += 1;

  if (registryName && registryName.length > 4 && blob.includes(registryName)) score += 3;
  if (registryName && registryName.length > 4 && query.includes(registryName)) score += 1;

  if (!registryName && targetName && targetName.length > 4 && !/^[a-z]{3}\.\d+$/i.test(targetName) && blob.includes(targetName)) {
    score += 2;
  }

  return score;
}

function classifyRow(row, target) {
  if (isRejected(row)) return "reject";

  const standings = hasStandingsSignal(row);
  const season = hasSeasonSignal(row);
  const hintHost = officialHintHostMatch(row, target);
  const officialText = hasOfficialTextIdentity(row);
  const officialHost = officialHostShape(row);
  const identityScore = identityMatchScore(row, target);

  const officialIdentity = hintHost || officialText || officialHost;

  if (officialIdentity && standings && identityScore >= 1) {
    return "strong_official_standings_candidate";
  }

  if (officialIdentity && standings) {
    return "official_standings_candidate_needs_identity_probe";
  }

  if (officialIdentity) {
    return "official_identity_only_needs_route_probe";
  }

  if (standings) {
    return "third_party_standings_only";
  }

  if (season) {
    return "season_signal_only";
  }

  return "weak_or_irrelevant";
}

function bucketForCounts(counts, resultCount) {
  if ((counts.strong_official_standings_candidate || 0) > 0) {
    return "strong_official_standings_candidate";
  }

  if ((counts.official_standings_candidate_needs_identity_probe || 0) > 0) {
    return "official_standings_candidate_needs_identity_probe";
  }

  if ((counts.official_identity_only_needs_route_probe || 0) > 0) {
    return "official_identity_only_needs_route_probe";
  }

  if ((counts.third_party_standings_only || 0) > 0) {
    return "third_party_standings_only";
  }

  if (resultCount === 0) {
    return "problematic_no_results";
  }

  return "problematic_no_usable_signal";
}

function listBatchDirs(inputDir) {
  return fs.readdirSync(inputDir)
    .filter((name) => /^provider-discovery-validation-\d{4}$/.test(name))
    .sort()
    .map((name) => path.join(inputDir, name));
}

function buildBoard({ inputDir, output }) {
  if (!inputDir) throw new Error("--input-dir is required");
  if (!output) throw new Error("--output is required");
  if (!fs.existsSync(inputDir)) throw new Error(`Input directory does not exist: ${inputDir}`);

  const batchDirs = listBatchDirs(inputDir);
  const allTargets = [];
  const allRows = [];
  const batchSummaries = [];

  for (const dir of batchDirs) {
    const batchId = path.basename(dir);
    const targetFile = path.join(dir, `provider-discovery-search-targets-${batchId}.json`);
    const resultFile = path.join(dir, `provider-discovery-search-results-${batchId}.json`);

    if (!fs.existsSync(targetFile)) throw new Error(`Missing target file: ${targetFile}`);
    if (!fs.existsSync(resultFile)) throw new Error(`Missing result file: ${resultFile}`);

    const targetReport = readJson(targetFile);
    const resultReport = readJson(resultFile);

    const targets = Array.isArray(targetReport.searchTargetRows) ? targetReport.searchTargetRows : [];
    const rows = Array.isArray(resultReport.searchResultRows) ? resultReport.searchResultRows : [];

    allTargets.push(...targets.map((row) => ({ ...row, batchId })));
    allRows.push(...rows.map((row) => ({ ...row, batchId })));

    batchSummaries.push({
      batchId,
      targetCount: targets.length,
      resultRowCount: rows.length,
      completedBatchCount: resultReport.summary?.completedBatchCount ?? null,
      failedBatchCount: resultReport.summary?.failedBatchCount ?? null,
      sourceFetch: resultReport.summary?.sourceFetch ?? null,
      canonicalWrites: resultReport.summary?.canonicalWrites ?? null,
      productionWrite: resultReport.summary?.productionWrite ?? null
    });
  }

  const rowsBySlug = new Map();
  for (const row of allRows) {
    const slug = row.leagueSlug || row.competitionSlug || row.slug || "unknown";
    if (!rowsBySlug.has(slug)) rowsBySlug.set(slug, []);
    rowsBySlug.get(slug).push(row);
  }

  const leagueReviews = allTargets.map((target) => {
    const slug = target.leagueSlug || target.competitionSlug;
    const rows = rowsBySlug.get(slug) || [];

    const classifiedRows = rows.map((row) => ({
      leagueSlug: slug,
      batchId: row.batchId,
      rank: row.rank ?? null,
      query: row.query || "",
      title: row.title || "",
      url: row.url || "",
      host: hostOf(row),
      classification: classifyRow(row, target)
    }));

    const counts = {};
    for (const row of classifiedRows) {
      counts[row.classification] = (counts[row.classification] || 0) + 1;
    }

    const bucket = bucketForCounts(counts, rows.length);
    const best =
      classifiedRows.find((row) => row.classification === "strong_official_standings_candidate") ||
      classifiedRows.find((row) => row.classification === "official_standings_candidate_needs_identity_probe") ||
      classifiedRows.find((row) => row.classification === "official_identity_only_needs_route_probe") ||
      classifiedRows.find((row) => row.classification === "third_party_standings_only") ||
      classifiedRows[0] ||
      null;

    return {
      leagueSlug: slug,
      batchId: target.batchId,
      name: target.name || "",
      registryName: target.registryName || "",
      hasUsefulRegistryName: Boolean(target.hasUsefulRegistryName),
      country: target.country || "",
      region: target.region || "",
      coverageTier: target.coverageTier ?? null,
      coverageTrust: target.coverageTrust ?? null,
      query: target.query || "",
      resultCount: rows.length,
      reviewBucket: bucket,
      counts,
      bestTitle: best?.title || "",
      bestHost: best?.host || "",
      bestUrl: best?.url || "",
      bestClassification: best?.classification || "",
      topRows: classifiedRows.slice(0, 10)
    };
  });

  const byBucket = {};
  for (const row of leagueReviews) {
    byBucket[row.reviewBucket] = (byBucket[row.reviewBucket] || 0) + 1;
  }

  const board = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceDirectory: inputDir,
    summary: {
      batchCount: batchDirs.length,
      targetCount: allTargets.length,
      searchedCompetitionCount: leagueReviews.length,
      searchResultRowCount: allRows.length,
      byBucket,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    batchSummaries,
    leagueReviews,
    promotionBlockedUntil: [
      "official URL/provider route is fetched and validated",
      "season/current-state identity is confirmed",
      "canonical standings write contract exists",
      "source convergence policy is satisfied"
    ],
    strongOfficialCandidates: leagueReviews.filter((row) => row.reviewBucket === "strong_official_standings_candidate"),
    needsIdentityProbe: leagueReviews.filter((row) => row.reviewBucket === "official_standings_candidate_needs_identity_probe"),
    needsRouteProbe: leagueReviews.filter((row) => row.reviewBucket === "official_identity_only_needs_route_probe"),
    thirdPartyOnly: leagueReviews.filter((row) => row.reviewBucket === "third_party_standings_only"),
    problematic: leagueReviews.filter((row) => row.reviewBucket.startsWith("problematic_"))
  };

  writeJson(output, board);
  return board;
}

function runSelfTest() {
  const target = {
    leagueSlug: "aia.1",
    name: "aia.1",
    registryName: "",
    country: "Anguilla",
    officialHintHosts: []
  };

  const strong = classifyRow({
    title: "Points Standing - Anguilla Football Association",
    url: "https://www.anguillafa.com/matches/standings",
    query: "Anguilla football federation official standings"
  }, target);

  if (strong !== "strong_official_standings_candidate") {
    throw new Error(`Self-test expected Anguilla official standings candidate, got ${strong}`);
  }

  const rejectedRanking = classifyRow({
    title: "FIFA football ranking - LIVE - Daily updating - AFC zone",
    url: "https://football-ranking.com/rankByConfederation?zone=AFC",
    query: "Afghanistan football federation official standings"
  }, { country: "Afghanistan", registryName: "", officialHintHosts: [] });

  if (rejectedRanking !== "reject") {
    throw new Error(`Self-test expected football-ranking reject, got ${rejectedRanking}`);
  }

  const rejectedAggregator = classifyRow({
    title: "Albania 1st Division Standings - ScorePulse",
    url: "https://scorepulse.org/albania-1st-division/standings",
    query: "Albanian First Division official standings table"
  }, { country: "Albania", registryName: "Albanian First Division", officialHintHosts: [] });

  if (rejectedAggregator !== "reject") {
    throw new Error(`Self-test expected ScorePulse reject, got ${rejectedAggregator}`);
  }

  const identityOnly = classifyRow({
    title: "Afghanistan Football Federation - a new age for Afghanistan",
    url: "https://the-aff.org/",
    query: "Afghanistan football federation official standings"
  }, { country: "Afghanistan", registryName: "", officialHintHosts: [] });

  if (identityOnly !== "official_identity_only_needs_route_probe") {
    throw new Error(`Self-test expected identity-only route probe, got ${identityOnly}`);
  }

  return {
    ok: true,
    selfTest: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const board = buildBoard(args);

  console.log(JSON.stringify(board.summary, null, 2));
  console.log("\n=== bucket counts ===");
  console.table(Object.entries(board.summary.byBucket).map(([bucket, count]) => ({ bucket, count })));

  console.log("\n=== sample strong official candidates ===");
  console.table(board.strongOfficialCandidates.slice(0, 25).map((row) => ({
    leagueSlug: row.leagueSlug,
    country: row.country,
    name: row.name,
    bestHost: row.bestHost,
    bestTitle: row.bestTitle,
    bestUrl: row.bestUrl
  })));

  console.log("\n=== sample needs route probe ===");
  console.table(board.needsRouteProbe.slice(0, 25).map((row) => ({
    leagueSlug: row.leagueSlug,
    country: row.country,
    name: row.name,
    bestHost: row.bestHost,
    bestTitle: row.bestTitle
  })));

  console.log(`\nWROTE ${args.output}`);
}

main();
