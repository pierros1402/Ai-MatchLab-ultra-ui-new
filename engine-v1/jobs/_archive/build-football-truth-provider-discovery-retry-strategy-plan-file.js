#!/usr/bin/env node

import fs from "fs";
import path from "path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    searchOutput: "",
    targets: "",
    output: "",
    csvOutput: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--search-output") args.searchOutput = argv[++i];
    else if (arg === "--targets") args.targets = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--csv-output") args.csvOutput = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCsv(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const headers = [
    "searchTargetId",
    "leagueSlug",
    "searchName",
    "nameSource",
    "nameConfidence",
    "country",
    "region",
    "tier",
    "retryClass",
    "retryQueryCount",
    "firstRetryQuery",
    "secondRetryQuery",
    "thirdRetryQuery",
    "officialHintHosts",
    "providerBlockedAttemptCount",
    "providerZeroResultAttemptCount"
  ];

  const escapeCsv = (value) => {
    const text = String(value ?? "");
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replaceAll('"', '""')}"`;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))
  ];

  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
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

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = asText(keyFn(row)) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function humanizeCountry(value) {
  const text = asText(value).replaceAll("_", " ").toLowerCase();
  if (!text) return "";
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isSlugName(name, slug) {
  const value = asText(name);
  const cleanSlug = asText(slug);
  if (!value) return true;
  if (value === cleanSlug) return true;
  return /^[a-z]{2,4}\.\d+$/u.test(value);
}

function numericTier(target, slug) {
  const explicitTier = Number(target.coverageTier ?? target.tier ?? 0);
  if (Number.isFinite(explicitTier) && explicitTier > 0) return explicitTier;

  const suffix = asText(slug).split(".").at(-1);
  const suffixTier = Number(suffix);
  if (Number.isFinite(suffixTier) && suffixTier > 0) return suffixTier;

  return null;
}

function resolveSearchName(target, slug) {
  const registryName = asText(target.registryName);
  const competitionName = asText(target.competitionName);
  const name = asText(target.name);
  const country = humanizeCountry(target.country);
  const tier = numericTier(target, slug);

  if (target.hasUsefulRegistryName === true && !isSlugName(registryName, slug)) {
    return {
      value: registryName,
      source: "registryName",
      confidence: "medium"
    };
  }

  if (!isSlugName(competitionName, slug)) {
    return {
      value: competitionName,
      source: "competitionName",
      confidence: "medium"
    };
  }

  if (!isSlugName(name, slug)) {
    return {
      value: name,
      source: "name",
      confidence: "medium"
    };
  }

  if (country && tier === 1) {
    return {
      value: `${country} top division`,
      source: "country_tier_fallback",
      confidence: "low"
    };
  }

  if (country && tier === 2) {
    return {
      value: `${country} second division`,
      source: "country_tier_fallback",
      confidence: "low"
    };
  }

  if (country && tier) {
    return {
      value: `${country} tier ${tier} football league`,
      source: "country_tier_fallback",
      confidence: "low"
    };
  }

  if (country) {
    return {
      value: `${country} football league`,
      source: "country_fallback",
      confidence: "low"
    };
  }

  return {
    value: slug,
    source: "slug_last_resort",
    confidence: "very_low"
  };
}

function targetRowsFrom(targetsInput) {
  const rows = asArray(targetsInput.searchTargetRows);
  if (rows.length > 0) return rows;

  const candidates = asArray(targetsInput.candidateTargetRows);
  if (candidates.length > 0) return candidates;

  const targets = asArray(targetsInput.targets);
  if (targets.length > 0) return targets;

  const genericRows = asArray(targetsInput.rows);
  if (genericRows.length > 0) return genericRows;

  return [];
}

function targetSlug(target) {
  return asText(target.competitionSlug || target.leagueSlug || target.slug);
}

function buildTargetLookups(targetRows) {
  const byId = new Map();
  const bySlug = new Map();

  for (const target of targetRows) {
    const id = asText(target.searchTargetId);
    const slug = targetSlug(target);

    if (id && !byId.has(id)) byId.set(id, target);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, target);
  }

  return { byId, bySlug };
}

function addUniqueQuery(list, query) {
  const text = asText(query);
  if (!text) return;
  if (!list.includes(text)) list.push(text);
}

function retryStatuses() {
  return new Set([
    "parser_zero_results_needs_retry",
    "provider_blocked_or_zero_results_needs_retry"
  ]);
}

function retryReason(status) {
  if (status === "parser_zero_results_needs_retry") {
    return "Search providers returned 200/202 with zero parsed result rows; retry with broader and host-aware query variants.";
  }

  if (status === "provider_blocked_or_zero_results_needs_retry") {
    return "At least one provider showed blocked/403-like behavior or zero-result provider profile; retry separately with lower batch pressure and alternate query variants.";
  }

  return "Retry required by search quality classification.";
}

function buildRetryQueries({ attempt, target, slug, searchName, country, tier }) {
  const queries = [];

  addUniqueQuery(queries, attempt.query);

  addUniqueQuery(queries, `"${searchName}" official standings`);
  addUniqueQuery(queries, `"${searchName}" official table`);
  addUniqueQuery(queries, `"${searchName}" league table`);
  addUniqueQuery(queries, `"${searchName}" results standings`);
  addUniqueQuery(queries, `"${searchName}" 2025 2026 standings`);

  if (country) {
    addUniqueQuery(queries, `${country} football federation standings`);
    addUniqueQuery(queries, `${country} football federation competitions table`);
    addUniqueQuery(queries, `${country} football league official standings`);
    addUniqueQuery(queries, `${country} football association league table`);
  }

  if (country && tier) {
    addUniqueQuery(queries, `${country} football tier ${tier} standings`);
    addUniqueQuery(queries, `${country} division ${tier} football table`);
  }

  for (const host of asArray(target.officialHintHosts).map(asText).filter(Boolean)) {
    addUniqueQuery(queries, `site:${host} "${searchName}" standings`);
    addUniqueQuery(queries, `site:${host} "${searchName}" table`);
    addUniqueQuery(queries, `site:${host} standings`);
    addUniqueQuery(queries, `site:${host} table`);
  }

  return unique(queries);
}

function buildRetryRow(attempt, target) {
  const slug = asText(attempt.leagueSlug || targetSlug(target));
  const resolvedName = resolveSearchName(target, slug);
  const searchName = asText(resolvedName.value);
  const country = humanizeCountry(target.country);
  const region = asText(target.region);
  const tier = numericTier(target, slug);

  const retryQueries = buildRetryQueries({
    attempt,
    target,
    slug,
    searchName,
    country,
    tier
  });

  return {
    searchTargetId: asText(attempt.searchTargetId),
    leagueSlug: slug,
    searchName,
    nameSource: resolvedName.source,
    nameConfidence: resolvedName.confidence,
    country,
    region,
    tier,
    seasonState: asText(target.seasonState),
    priorityBand: asText(target.priorityBand),
    retryClass: asText(attempt.status),
    retryReason: retryReason(asText(attempt.status)),
    originalQuery: asText(attempt.query),
    retryQueryCount: retryQueries.length,
    retryQueries,
    officialHintHosts: asArray(target.officialHintHosts).map(asText).filter(Boolean).join(";"),
    resultCount: Number(attempt.resultCount || 0),
    usableResultCount: Number(attempt.usableResultCount || 0),
    providerBlockedAttemptCount: Number(attempt.providerBlockedAttemptCount || 0),
    providerZeroResultAttemptCount: Number(attempt.providerZeroResultAttemptCount || 0),
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function csvRowsFor(retryRows) {
  return retryRows.map((row) => ({
    searchTargetId: row.searchTargetId,
    leagueSlug: row.leagueSlug,
    searchName: row.searchName,
    nameSource: row.nameSource,
    nameConfidence: row.nameConfidence,
    country: row.country,
    region: row.region,
    tier: row.tier,
    retryClass: row.retryClass,
    retryQueryCount: row.retryQueryCount,
    firstRetryQuery: row.retryQueries[0] || "",
    secondRetryQuery: row.retryQueries[1] || "",
    thirdRetryQuery: row.retryQueries[2] || "",
    officialHintHosts: row.officialHintHosts,
    providerBlockedAttemptCount: row.providerBlockedAttemptCount,
    providerZeroResultAttemptCount: row.providerZeroResultAttemptCount
  }));
}

function buildProviderDiscoveryRetryStrategyPlan(searchOutput, targetsInput) {
  const targetRows = targetRowsFrom(targetsInput);
  const lookups = buildTargetLookups(targetRows);
  const attempts = asArray(searchOutput.searchAttempts);
  const retryStatusSet = retryStatuses();

  const retryRows = [];

  for (const attempt of attempts) {
    const status = asText(attempt.status);
    if (!retryStatusSet.has(status)) continue;

    const target = lookups.byId.get(asText(attempt.searchTargetId)) ||
      lookups.bySlug.get(asText(attempt.leagueSlug));

    if (!target) {
      throw new Error(`Could not resolve target for retry attempt: ${asText(attempt.searchTargetId) || asText(attempt.leagueSlug)}`);
    }

    retryRows.push(buildRetryRow(attempt, target));
  }

  const lowQualityReviewAttempts = attempts
    .filter((attempt) => asText(attempt.status) === "low_quality_search_batch_needs_review")
    .map((attempt) => ({
      leagueSlug: asText(attempt.leagueSlug),
      status: asText(attempt.status),
      resultCount: Number(attempt.resultCount || 0),
      usableResultCount: Number(attempt.usableResultCount || 0),
      query: asText(attempt.query)
    }));

  const usableAttempts = attempts
    .filter((attempt) => asText(attempt.status) === "ok" && Number(attempt.usableResultCount || 0) > 0)
    .map((attempt) => ({
      leagueSlug: asText(attempt.leagueSlug),
      status: asText(attempt.status),
      resultCount: Number(attempt.resultCount || 0),
      usableResultCount: Number(attempt.usableResultCount || 0),
      query: asText(attempt.query)
    }));

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-retry-strategy-plan-file",
    mode: "read_only_provider_discovery_retry_strategy_plan",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      searchOutputSummary: searchOutput.summary || {},
      targetSummary: targetsInput.summary || {}
    },
    summary: {
      searchTargetCount: Number(searchOutput.summary?.searchTargetCount || targetRows.length),
      selectedSearchTargetCount: Number(searchOutput.summary?.selectedSearchTargetCount || attempts.length),
      searchAttemptCount: attempts.length,
      retryAttemptCount: retryRows.length,
      lowQualityReviewAttemptCount: lowQualityReviewAttempts.length,
      usableOfficialAttemptCount: usableAttempts.length,
      totalRetryQueryCount: retryRows.reduce((sum, row) => sum + row.retryQueryCount, 0),
      byRetryClass: countBy(retryRows, (row) => row.retryClass),
      byNameSource: countBy(retryRows, (row) => row.nameSource),
      byNameConfidence: countBy(retryRows, (row) => row.nameConfidence),
      byRegion: countBy(retryRows, (row) => row.region),
      slugLastResortCount: retryRows.filter((row) => row.nameSource === "slug_last_resort").length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    retryRows,
    retryCsvRows: csvRowsFor(retryRows),
    lowQualityReviewAttempts,
    usableAttempts,
    policy: {
      purpose: "Build retry strategy rows for provider-discovery attempts classified as parser/provider retry candidates.",
      inputContract: "Consumes patched provider-discovery search output plus its original search target rows.",
      retryRowsAreSearchHints: true,
      fallbackNamesAreSearchHintsNotTruthValues: true,
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
      diagnosticOnly: true,
      fallbackNamesAreSearchHintsNotTruthValues: true
    }
  };
}

function runSelfTest() {
  const searchOutput = {
    summary: {
      searchTargetCount: 4,
      selectedSearchTargetCount: 4
    },
    searchAttempts: [
      {
        searchTargetId: "selected:nor.2:001",
        leagueSlug: "nor.2",
        status: "ok",
        resultCount: 2,
        usableResultCount: 1,
        query: "site:fotball.no OBOS-ligaen standings table"
      },
      {
        searchTargetId: "selected:ang.1:002",
        leagueSlug: "ang.1",
        status: "parser_zero_results_needs_retry",
        resultCount: 0,
        usableResultCount: 0,
        query: "Angola football federation official standings",
        providerZeroResultAttemptCount: 2
      },
      {
        searchTargetId: "selected:alb.2:003",
        leagueSlug: "alb.2",
        status: "provider_blocked_or_zero_results_needs_retry",
        resultCount: 0,
        usableResultCount: 0,
        query: "Albanian First Division official standings",
        providerBlockedAttemptCount: 1
      },
      {
        searchTargetId: "selected:and.1:004",
        leagueSlug: "and.1",
        status: "low_quality_search_batch_needs_review",
        resultCount: 2,
        usableResultCount: 0,
        query: "Andorran Primera Divisió official standings"
      }
    ]
  };

  const targetsInput = {
    summary: {
      searchTargetCount: 4
    },
    searchTargetRows: [
      {
        searchTargetId: "selected:nor.2:001",
        leagueSlug: "nor.2",
        competitionSlug: "nor.2",
        competitionName: "OBOS-ligaen",
        registryName: "OBOS-ligaen",
        hasUsefulRegistryName: true,
        country: "Norway",
        region: "europe",
        coverageTier: 2,
        officialHintHosts: ["fotball.no"]
      },
      {
        searchTargetId: "selected:ang.1:002",
        leagueSlug: "ang.1",
        competitionSlug: "ang.1",
        competitionName: "ang.1",
        name: "ang.1",
        registryName: "",
        hasUsefulRegistryName: false,
        country: "angola",
        region: "africa",
        coverageTier: 1,
        officialHintHosts: []
      },
      {
        searchTargetId: "selected:alb.2:003",
        leagueSlug: "alb.2",
        competitionSlug: "alb.2",
        competitionName: "Albanian First Division",
        registryName: "Albanian First Division",
        hasUsefulRegistryName: true,
        country: "Albania",
        region: "europe",
        coverageTier: 2,
        officialHintHosts: []
      },
      {
        searchTargetId: "selected:and.1:004",
        leagueSlug: "and.1",
        competitionSlug: "and.1",
        competitionName: "Andorran Primera Divisió",
        registryName: "Andorran Primera Divisió",
        hasUsefulRegistryName: true,
        country: "Andorra",
        region: "europe",
        coverageTier: 1,
        officialHintHosts: []
      }
    ]
  };

  const report = buildProviderDiscoveryRetryStrategyPlan(searchOutput, targetsInput);

  if (report.summary.retryAttemptCount !== 2) {
    throw new Error(`Self-test expected 2 retry rows, got ${report.summary.retryAttemptCount}`);
  }

  if (report.summary.lowQualityReviewAttemptCount !== 1) {
    throw new Error("Self-test expected 1 low-quality review attempt");
  }

  if (report.summary.usableOfficialAttemptCount !== 1) {
    throw new Error("Self-test expected 1 usable official attempt");
  }

  const ang = report.retryRows.find((row) => row.leagueSlug === "ang.1");
  if (!ang) throw new Error("Self-test expected ang.1 retry row");

  if (ang.searchName !== "Angola top division") {
    throw new Error(`Self-test expected Angola top division fallback, got: ${ang.searchName}`);
  }

  if (ang.nameSource !== "country_tier_fallback" || ang.nameConfidence !== "low") {
    throw new Error("Self-test expected low-confidence country_tier_fallback");
  }

  if (ang.retryQueries.some((query) => query.includes('"ang.1"'))) {
    throw new Error("Self-test must not quote raw slug as retry search name");
  }

  const alb = report.retryRows.find((row) => row.leagueSlug === "alb.2");
  if (!alb) throw new Error("Self-test expected alb.2 retry row");

  if (alb.searchName !== "Albanian First Division" || alb.nameSource !== "registryName") {
    throw new Error("Self-test expected registryName for alb.2");
  }

  if (report.summary.slugLastResortCount !== 0) {
    throw new Error("Self-test expected zero slug last resort rows");
  }

  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("Self-test read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: true,
      summary: report.summary,
      firstRetryRow: report.retryRows[0] || null,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.searchOutput) throw new Error("Missing required --search-output");
  if (!args.targets) throw new Error("Missing required --targets");
  if (!args.output) throw new Error("Missing required --output");

  const searchOutput = readJson(args.searchOutput);
  const targetsInput = readJson(args.targets);
  const report = buildProviderDiscoveryRetryStrategyPlan(searchOutput, targetsInput);

  writeJson(args.output, report);

  if (args.csvOutput) {
    writeCsv(args.csvOutput, report.retryCsvRows);
  }

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    csvOutput: args.csvOutput || null,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
