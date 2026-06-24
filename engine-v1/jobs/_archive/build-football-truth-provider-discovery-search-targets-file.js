import fs from "fs";
import path from "path";
import { leagueName } from "../../workers/_shared/leagues-registry.js";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

function parseArgs(argv) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    batchId: "",
    limit: 0
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--batch-id") args.batchId = argv[++i];
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.limit && (!Number.isInteger(args.limit) || args.limit < 0)) {
    throw new Error(`Invalid --limit: ${args.limit}`);
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return Array.from(new Set(values.map(asText).filter(Boolean)));
}

function countBy(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

const COVERAGE_BY_SLUG = new Map(
  (Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : [])
    .map((row) => [row.slug || row.leagueSlug || row.competitionSlug, row])
    .filter(([slug]) => Boolean(slug))
);

function coverageForSlug(slug) {
  return COVERAGE_BY_SLUG.get(slug) || {};
}

function humanizeCountry(value) {
  return asText(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isFallbackRegistryName(slug, value) {
  const name = asText(value);
  const cleanSlug = asText(slug);

  if (!name || name === cleanSlug) return true;
  if (/^[A-Z][a-z]{2}\s+\d+$/u.test(name)) return true;
  if (/^[A-Z][a-z]{2}\s+(Cup|Gap)$/u.test(name)) return true;

  return false;
}

function usefulRegistryName(slug) {
  const name = leagueName(slug);
  return isFallbackRegistryName(slug, name) ? "" : name;
}

function tierDescriptor(row, coverage) {
  const slug = asText(row.competitionSlug || row.leagueSlug);
  const suffix = slug.split(".").at(-1);
  const tier = Number(coverage.tier ?? row.tier ?? 0);

  if (suffix === "1") return "top division";
  if (suffix === "2") return "second division";
  if (suffix === "3") return "third division";
  if (Number.isFinite(tier) && tier > 0) return `tier ${tier}`;
  return "league";
}

function searchMetadataFor(row) {
  const slug = asText(row.competitionSlug || row.leagueSlug);
  const coverage = coverageForSlug(slug);
  const registryName = usefulRegistryName(slug);
  const country = humanizeCountry(coverage.country || row.country || "");
  const region = asText(coverage.region || row.region);
  const type = asText(coverage.type || row.competitionType || "competition");
  const tier = coverage.tier ?? row.tier ?? null;
  const trust = coverage.trust ?? row.trust ?? null;
  const tierText = tierDescriptor(row, coverage);

  return {
    slug,
    registryName,
    country,
    region,
    type,
    tier,
    trust,
    tierText,
    hasUsefulRegistryName: Boolean(registryName),
    displayName: registryName || slug
  };
}

function looksLikeHost(value) {
  const text = asText(value).toLowerCase();
  if (!text || text === "unknown") return false;
  if (text.includes(" ")) return false;
  if (!text.includes(".")) return false;
  if (/^(http|https):\/\//i.test(text)) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text);
}

function hostWithoutWww(value) {
  return asText(value).toLowerCase().replace(/^www\./, "");
}

function isClearlyNoisyHost(value) {
  const host = hostWithoutWww(value);

  return [
    "account.microsoft.com",
    "myaccount.microsoft.com",
    "microsoft.com",
    "office.com",
    "signup.live.com",
    "support.microsoft.com",
    "facebook.com",
    "github.com",
    "glassdoor.fr",
    "indeed.com",
    "fr.indeed.com",
    "jooble.org",
    "fr.jooble.org",
    "hellowork.com",
    "francetravail.fr",
    "optioncarriere.com",
    "linktr.ee",
    "linklist.bio",
    "bing.com",
    "bing_html"
  ].some((bad) => host === bad || host.endsWith(`.${bad}`));
}

function isLikelyOfficialFootballHost(value) {
  const host = hostWithoutWww(value);

  if (!looksLikeHost(host)) return false;
  if (isClearlyNoisyHost(host)) return false;

  if (/(wixsite|todosnegocios|findglocal|archtrends|formalogistics|liora|m2iformation|viseo|job|career|account|login|support|profile|linktr|facebook|github|glassdoor|indeed|jooble|hellowork|optioncarriere)/i.test(host)) {
    return false;
  }

  return /(\bfotball\b|\bfootball\b|\bsoccer\b|\bfutbol\b|\bfutebol\b|\bfa\b|\bfed\b|\bfederation\b|\bleague\b|\bliga\b|\bligue\b|\bserie\b|\bdivisie\b|\bntf\b|\bobos-ligaen\b)/i.test(host);
}

function officialHostScore(host) {
  const value = hostWithoutWww(host);

  let score = 0;

  if (value === "fotball.no" || value.endsWith(".fotball.no")) score += 1000;
  if (value === "obos-ligaen.no" || value.endsWith(".obos-ligaen.no")) score += 900;
  if (/(^|\.)fotball\./i.test(value)) score += 800;
  if (/(^|\.)football\./i.test(value)) score += 750;
  if (/(^|\.)soccer\./i.test(value)) score += 700;
  if (/federation|federacao|federacion|federatie|federa/i.test(value)) score += 650;
  if (/league|liga|ligue|divisie|serie/i.test(value)) score += 600;
  if (/(^|\.)fa\./i.test(value) || /\.fa\./i.test(value)) score += 550;

  return score;
}

function officialHintHosts(row) {
  const signals = unique([
    ...asArray(row.trustedProviderIds),
    ...asArray(row.providers),
    ...asArray(row.rawProviderSignals),
    ...asArray(row.noisyProviderSignals)
  ]);

  return unique(
    signals
      .filter(looksLikeHost)
      .map(hostWithoutWww)
      .filter(isLikelyOfficialFootballHost)
      .sort((a, b) => officialHostScore(b) - officialHostScore(a) || a.localeCompare(b))
  );
}

function sourceFamily(row) {
  if (row.intentNeed === "official_standings") return "official_standings_provider";
  if (row.intentNeed === "official_fixtures") return "official_fixture_provider";
  return "official_competition_provider";
}

function targetIntent(row) {
  if (row.intentNeed === "official_standings") {
    return "provider_discovery_validation_official_standings";
  }

  return "provider_discovery_validation_official_competition_source";
}

function querySetFor(row) {
  const meta = searchMetadataFor(row);
  const slug = meta.slug;
  const statePhrase = row.seasonState === "active" ? "current season" : "season";
  const hintHosts = officialHintHosts(row);

  const identityTerms = meta.hasUsefulRegistryName
    ? [meta.registryName, `${meta.country} ${meta.registryName}`]
    : [
        `${meta.country} football ${meta.tierText}`,
        `${meta.country} football league`,
        `${meta.country} football federation`
      ];

  const hostQueries = hintHosts.slice(0, 4).flatMap((host) => {
    return identityTerms.slice(0, 2).map((term) => `site:${host} ${term} standings table`);
  });

  const nameQueries = meta.hasUsefulRegistryName
    ? [
        `${meta.registryName} official standings table`,
        `${meta.registryName} official league table ${statePhrase}`,
        `${meta.country} ${meta.registryName} official standings`,
        `${meta.country} football federation ${meta.registryName} standings`
      ]
    : [
        `${meta.country} football federation official standings`,
        `${meta.country} ${meta.tierText} football league standings`,
        `${meta.country} official league table ${statePhrase}`,
        `${meta.country} football association league standings`,
        `${meta.country} soccer federation standings`
      ];

  const slugFallbackQueries = [
    `${slug} official standings table`
  ];

  return unique([...hostQueries, ...nameQueries, ...slugFallbackQueries]).slice(0, 8);
}

function buildSearchTarget(row, index, batchId) {
  const leagueSlug = row.competitionSlug;
  const hintHosts = officialHintHosts(row);
  const queries = querySetFor(row);
  const primaryQuery = queries[0];
  const searchMeta = searchMetadataFor(row);

  return {
    searchTargetId: `${batchId}:${leagueSlug}:official-standings-provider-discovery:${String(index + 1).padStart(3, "0")}`,
    targetType: "provider_discovery_validation_search",
    searchMode: "official_provider_discovery",
    leagueSlug,
    competitionSlug: leagueSlug,
    competitionName: searchMeta.displayName,
    name: searchMeta.displayName,
    registryName: searchMeta.registryName,
    hasUsefulRegistryName: searchMeta.hasUsefulRegistryName,
    country: searchMeta.country,
    region: searchMeta.region,
    coverageTier: searchMeta.tier,
    coverageTrust: searchMeta.trust,
    competitionType: row.competitionType || searchMeta.type || "unknown",
    seasonState: row.seasonState || "unknown",
    priorityBand: row.priorityBand || "unknown",
    priority: row.priority ?? null,
    confidence: row.confidence ?? null,
    query: primaryQuery,
    queries,
    intent: targetIntent(row),
    queryIntent: targetIntent(row),
    expectedSourceFamily: sourceFamily(row),
    expectedEvidence: [
      "official source identity",
      "standings/table page or structured endpoint",
      "competition identity match",
      "season/current-state marker"
    ],
    rejectIf: [
      "aggregator-only source",
      "social/profile/account/login/job board result",
      "fixture-only result without standings/table evidence",
      "stale season with no current-season marker",
      "wrong country/competition identity"
    ],
    officialHintHosts: hintHosts,
    rawProviderSignals: asArray(row.rawProviderSignals),
    noisyProviderSignals: asArray(row.noisyProviderSignals),
    providerSignalClass: row.providerSignalClass || "unknown",
    sourceBasisKeys: asArray(row.sourceBasisKeys),
    evidenceContract: row.evidenceContract || {},
    discoveryIntent: row.discoveryIntent || {},
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    metadata: {
      originatingJob: "build-football-truth-provider-discovery-validation-plan-file",
      originatingBatchId: batchId,
      originatingExecutionBucket: row.executionBucket,
      nextSafeJobType: "run-fixture-league-date-autonomous-search-batches-file",
      sourceConvergenceRequired: true
    }
  };
}

function selectRows(plan, batchId, limit) {
  const allRows = asArray(plan.discoveryValidationRows);

  if (!batchId) {
    const out = limit > 0 ? allRows.slice(0, limit) : allRows;
    return {
      selectedRows: out,
      selectedBatch: null,
      selectionMode: limit > 0 ? "first_n_rows" : "all_rows"
    };
  }

  const batch = asArray(plan.batchGroups).find((row) => row.batchId === batchId);

  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  const competitionSet = new Set(asArray(batch.competitions));
  const batchRows = allRows.filter((row) => competitionSet.has(row.competitionSlug));
  const out = limit > 0 ? batchRows.slice(0, limit) : batchRows;

  return {
    selectedRows: out,
    selectedBatch: batch,
    selectionMode: "batch_id"
  };
}

function buildProviderDiscoverySearchTargets(plan, options = {}) {
  const batchId = options.batchId || "";
  const limit = options.limit || 0;
  const selection = selectRows(plan, batchId, limit);
  const effectiveBatchId = batchId || "provider-discovery-validation-selected";

  const searchTargetRows = selection.selectedRows.map((row, index) => {
    return buildSearchTarget(row, index, effectiveBatchId);
  });

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-search-targets-file",
    mode: "read_only_provider_discovery_search_target_derivation",
    generatedAt: new Date().toISOString(),
    inputSummary: plan.summary || {},
    selection: {
      batchId: batchId || null,
      selectionMode: selection.selectionMode,
      requestedLimit: limit,
      selectedCompetitionCount: selection.selectedRows.length,
      selectedBatch: selection.selectedBatch
    },
    summary: {
      searchTargetCount: searchTargetRows.length,
      selectedCompetitionCount: selection.selectedRows.length,
      byCompetitionType: countBy(searchTargetRows, (row) => row.competitionType),
      bySeasonState: countBy(searchTargetRows, (row) => row.seasonState),
      byPriorityBand: countBy(searchTargetRows, (row) => row.priorityBand),
      byProviderSignalClass: countBy(searchTargetRows, (row) => row.providerSignalClass),
      totalQueryCount: searchTargetRows.reduce((sum, row) => sum + row.queries.length, 0),
      targetsWithOfficialHintHosts: searchTargetRows.filter((row) => row.officialHintHosts.length > 0).length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchTargetRows,
    candidateTargetRows: searchTargetRows,
    policy: {
      purpose: "Convert provider discovery/validation plan rows into search-runner-compatible official provider discovery targets.",
      inputContract: "Consumes provider discovery validation plan output.",
      runnerContract: "Compatible with run-fixture-league-date-autonomous-search-batches-file selectTargets keys searchTargetRows/candidateTargetRows.",
      noSearch: true,
      noFetch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noSingleLeagueDrift: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      searchRequiresExplicitAllowSearch: true,
      sourceConvergenceRequired: true,
      batchBased: true
    }
  };
}

function runSelfTest() {
  const plan = {
    summary: { discoveryValidationCandidateCount: 2 },
    batchGroups: [
      {
        batchId: "provider-discovery-validation-0001",
        competitions: ["nor.2", "afg.1", "alb.2"]
      }
    ],
    discoveryValidationRows: [
      {
        competitionSlug: "nor.2",
        competitionType: "league",
        seasonState: "active",
        priorityBand: "p0_active_now",
        priority: 90,
        confidence: 0.8,
        intentNeed: "official_standings",
        executionBucket: "provider_discovery_validation_batch_candidate",
        providerSignalClass: "has_noisy_provider_signal",
        rawProviderSignals: ["fotball.no", "account.microsoft.com", "www.obos-ligaen.no"],
        noisyProviderSignals: ["github.com", "www.fotball.no"],
        sourceBasisKeys: ["missingData"],
        evidenceContract: { minimumEvidenceCount: 2 }
      },
      {
        competitionSlug: "afg.1",
        competitionType: "league",
        seasonState: "unknown",
        priorityBand: "p3_broad_map",
        priority: 999,
        confidence: 0.7,
        intentNeed: "official_standings",
        executionBucket: "provider_discovery_validation_batch_candidate",
        providerSignalClass: "has_noisy_provider_signal",
        rawProviderSignals: ["unknown"],
        noisyProviderSignals: ["facebook.com"]
      },
      {
        competitionSlug: "alb.2",
        competitionType: "league",
        seasonState: "unknown",
        priorityBand: "p3_broad_map",
        priority: 999,
        confidence: 0.7,
        intentNeed: "official_standings",
        executionBucket: "provider_discovery_validation_batch_candidate",
        providerSignalClass: "has_noisy_provider_signal",
        rawProviderSignals: [],
        noisyProviderSignals: []
      }
    ]
  };

  const report = buildProviderDiscoverySearchTargets(plan, {
    batchId: "provider-discovery-validation-0001"
  });

  if (report.summary.searchTargetCount !== 3) {
    throw new Error("Self-test expected 3 search targets");
  }

  const nor = report.searchTargetRows.find((row) => row.leagueSlug === "nor.2");
  if (!nor) throw new Error("Self-test expected nor.2 target");

  if (!nor.officialHintHosts.includes("fotball.no")) {
    throw new Error("Self-test expected fotball.no as official hint host");
  }

  if (!nor.officialHintHosts.includes("obos-ligaen.no")) {
    throw new Error("Self-test expected obos-ligaen.no as official hint host");
  }

  if (nor.officialHintHosts.includes("account.microsoft.com")) {
    throw new Error("Self-test expected Microsoft account host to be rejected");
  }

  if (nor.officialHintHosts.includes("archtrends.com")) {
    throw new Error("Self-test expected generic noisy host to be rejected");
  }

  if (nor.query !== "site:fotball.no OBOS-ligaen standings table") {
    throw new Error(`Self-test expected fotball.no + OBOS-ligaen first query, got: ${nor.query}`);
  }

  if (nor.query.includes("nor.2")) {
    throw new Error(`Self-test must not use raw slug for nor.2 after registry enrichment, got: ${nor.query}`);
  }

  const afg = report.searchTargetRows.find((row) => row.leagueSlug === "afg.1");
  if (!afg) throw new Error("Self-test expected afg.1 target");

  if (afg.hasUsefulRegistryName !== false) {
    throw new Error("Self-test expected fallback registry name for afg.1 to be rejected");
  }

  if (!afg.query.includes("Afghanistan football federation")) {
    throw new Error(`Self-test expected Afghanistan federation query, got: ${afg.query}`);
  }

  if (afg.query.includes("Afg 1")) {
    throw new Error("Self-test must not query fallback registry name Afg 1");
  }

  const alb = report.searchTargetRows.find((row) => row.leagueSlug === "alb.2");
  if (!alb) throw new Error("Self-test expected alb.2 target");

  if (alb.registryName !== "Albanian First Division") {
    throw new Error(`Self-test expected explicit registry name for alb.2, got: ${alb.registryName}`);
  }

  if (!alb.query.includes("Albanian First Division")) {
    throw new Error(`Self-test expected Albanian First Division query, got: ${alb.query}`);
  }

  if (report.guarantees.noSearch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("Self-test read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: true,
      summary: report.summary,
      firstTarget: report.searchTargetRows[0],
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const plan = readJson(args.input);
  const report = buildProviderDiscoverySearchTargets(plan, {
    batchId: args.batchId,
    limit: args.limit
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    selection: report.selection,
    summary: report.summary,
    firstTarget: report.searchTargetRows[0] || null,
    guarantees: report.guarantees
  }, null, 2));
}

main();
