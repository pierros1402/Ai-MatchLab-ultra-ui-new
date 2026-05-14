import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(MODULE_DIR, "..", "..");

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function resolveDataPath(...parts) {
  return path.join(ROOT_DIR, "data", ...parts);
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return {
      __readError: err?.message || String(err),
      file
    };
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function researchResultsPath(dayKey) {
  return resolveDataPath("team-news", "_research-results", `${dayKey}.json`);
}

function coverageReportPath(dayKey) {
  return resolveDataPath("team-news", "_coverage-reports", `${dayKey}.json`);
}

function league(row) {
  return lower(
    row?.match?.leagueSlug ||
    row?.target?.leagueSlug ||
    row?.candidateOutput?.aiProvider?.input?.leagueSlug ||
    row?.aiProviderAudit?.input?.leagueSlug ||
    ""
  );
}

function registry(row) {
  return row?.aiProviderAudit?.diagnostics?.registry || {};
}

function diagnostics(row) {
  return row?.aiProviderAudit?.diagnostics || {};
}

function extraction(row) {
  return row?.aiProviderAudit?.extractionDiagnostics || {};
}

function hostFromSource(item = {}) {
  const url = text(item?.url);

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return text(item?.publisher).replace(/^www\./, "");
  }
}

function topDomains(samples = []) {
  const out = new Map();

  for (const item of samples) {
    const host = hostFromSource(item);
    if (!host) continue;
    out.set(host, (out.get(host) || 0) + 1);
  }

  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count]) => ({ domain, count }));
}

function classifyRow(row) {
  const p = row.aiProviderAudit || {};
  const d = diagnostics(row);
  const r = registry(row);
  const e = extraction(row);

  const sourceCount = Number(p.sourceCount || 0);
  const relevantSourceCount = Number(d.relevantSourceCount || 0);
  const productionEligibleSourceCount = Number(d.productionEligibleSourceCount || 0);
  const diagnosticOnlySourceCount = Number(d.diagnosticOnlySourceCount || 0);
  const fetchedRegistryCount = Number(r.fetchedRegistryCount || 0);
  const registryArticleSamples = Array.isArray(r.registryArticleSamples) ? r.registryArticleSamples : [];
  const sourceAvailableNoteCount = Number(e.sourceAvailableNoteCount || 0);

  if (sourceAvailableNoteCount > 0 && sourceCount > 0) {
    return "production_usable";
  }

  if (productionEligibleSourceCount > 0 && relevantSourceCount === 0) {
    return "production_candidate_wrong_context_or_rejected";
  }

  if (fetchedRegistryCount > 0 && registryArticleSamples.length === 0) {
    return "registry_fetches_but_no_usable_article";
  }

  if (fetchedRegistryCount === 0 && Number(r.registrySourceCount || 0) > 0) {
    return "registry_sources_not_fetching";
  }

  if (diagnosticOnlySourceCount > 0) {
    return "diagnostic_only_search_sources";
  }

  return "no_sources";
}

function recommendedNextAction(classification) {
  if (classification === "production_usable") {
    return "keep_monitoring";
  }

  if (classification === "production_candidate_wrong_context_or_rejected") {
    return "fix_registry_article_context_or_article_pattern";
  }

  if (classification === "registry_fetches_but_no_usable_article") {
    return "add_article_discovery_pattern_or_better_official_url";
  }

  if (classification === "registry_sources_not_fetching") {
    return "repair_registry_fetch_url_or_blocked_page";
  }

  if (classification === "diagnostic_only_search_sources") {
    return "add_approved_registry_or_local_media_source";
  }

  return "add_source_registry_coverage";
}

function buildReport(dayKey) {
  const file = researchResultsPath(dayKey);
  const doc = readJson(file, null);

  if (!doc || doc.__readError) {
    throw new Error(`cannot read research results: ${file}${doc?.__readError ? `: ${doc.__readError}` : ""}`);
  }

  const rows = Array.isArray(doc.results) ? doc.results : [];

  const mapped = rows.map(row => {
    const p = row.aiProviderAudit || {};
    const d = diagnostics(row);
    const r = registry(row);
    const e = extraction(row);

    const registrySamples = Array.isArray(r.registrySamples) ? r.registrySamples : [];
    const registryArticleSamples = Array.isArray(r.registryArticleSamples) ? r.registryArticleSamples : [];
    const rejectedArticleSamples = Array.isArray(r.registryRejectedArticleSamples) ? r.registryRejectedArticleSamples : [];
    const diagnosticOnlySamples = Array.isArray(d.diagnosticOnlySamples) ? d.diagnosticOnlySamples : [];
    const prioritySamples = Array.isArray(d.fetchPrioritySamples) ? d.fetchPrioritySamples : [];

    const classification = classifyRow(row);

    return {
      league: league(row),
      team: row?.target?.team || p?.input?.team || null,
      opponent: row?.target?.opponent || p?.input?.opponent || null,
      status: row.status || null,
      providerStatus: p.status || null,
      providerReason: p.reason || null,

      classification,
      recommendedNextAction: recommendedNextAction(classification),

      sourceCount: Number(p.sourceCount || 0),
      relevantSourceCount: Number(d.relevantSourceCount || 0),
      realSourceCount: d.realSourceCount ?? null,
      productionEligibleSourceCount: Number(d.productionEligibleSourceCount || 0),
      diagnosticOnlySourceCount: Number(d.diagnosticOnlySourceCount || 0),

      registrySourceCount: Number(r.registrySourceCount || 0),
      fetchedRegistryCount: Number(r.fetchedRegistryCount || 0),
      usableRegistryCount: Number(r.usableRegistryCount || 0),
      registryArticleCount: registryArticleSamples.length,
      rejectedArticleCount: rejectedArticleSamples.length,
      sourceAvailableNoteCount: Number(e.sourceAvailableNoteCount || 0),

      registrySourceDomains: topDomains(registrySamples),
      diagnosticDomains: topDomains(diagnosticOnlySamples),
      priorityDomains: topDomains(prioritySamples),

      topRegistryArticles: registryArticleSamples.slice(0, 4).map(item => ({
        title: item.title,
        url: item.url,
        fetched: item.fetched,
        fetchStatus: item.fetchStatus,
        textLength: item.textLength
      })),

      topRejectedArticles: rejectedArticleSamples.slice(0, 5).map(item => ({
        title: item.title,
        reason: item.reason,
        url: item.url
      })),

      topDiagnosticSamples: diagnosticOnlySamples.slice(0, 5).map(item => ({
        title: item.title,
        publisher: item.publisher,
        url: item.url,
        sourceMode: item.sourceMode
      }))
    };
  });

  const byClassification = {};
  const byLeague = {};

  for (const row of mapped) {
    byClassification[row.classification] = (byClassification[row.classification] || 0) + 1;

    byLeague[row.league] ||= {
      rows: 0,
      productionUsable: 0,
      registryFetchesButNoUsableArticle: 0,
      productionCandidateWrongContextOrRejected: 0,
      registrySourcesNotFetching: 0,
      diagnosticOnly: 0,
      noSources: 0,
      needsRegistryWork: 0
    };

    byLeague[row.league].rows += 1;

    if (row.classification === "production_usable") {
      byLeague[row.league].productionUsable += 1;
    }

    if (row.classification === "registry_fetches_but_no_usable_article") {
      byLeague[row.league].registryFetchesButNoUsableArticle += 1;
    }

    if (row.classification === "production_candidate_wrong_context_or_rejected") {
      byLeague[row.league].productionCandidateWrongContextOrRejected += 1;
    }

    if (row.classification === "registry_sources_not_fetching") {
      byLeague[row.league].registrySourcesNotFetching += 1;
    }

    if (row.classification === "diagnostic_only_search_sources") {
      byLeague[row.league].diagnosticOnly += 1;
    }

    if (row.classification === "no_sources") {
      byLeague[row.league].noSources += 1;
    }

    if (row.classification !== "production_usable") {
      byLeague[row.league].needsRegistryWork += 1;
    }
  }

  const order = {
    registry_fetches_but_no_usable_article: 0,
    production_candidate_wrong_context_or_rejected: 1,
    registry_sources_not_fetching: 2,
    diagnostic_only_search_sources: 3,
    no_sources: 4,
    production_usable: 9
  };

  const priorityBacklog = mapped
    .filter(row => row.classification !== "production_usable")
    .sort((a, b) => {
      const classOrder = (order[a.classification] ?? 99) - (order[b.classification] ?? 99);
      if (classOrder !== 0) return classOrder;
      return `${a.league}:${a.team}`.localeCompare(`${b.league}:${b.team}`);
    });

  const report = {
    ok: true,
    dayKey,
    generatedAt: new Date().toISOString(),
    sourceFile: file,
    totalRows: rows.length,
    safety: {
      acceptedCandidateCount: doc.acceptedCandidateCount,
      canonicalWriteCount: doc.canonicalWriteCount,
      candidateOnly: doc.candidateOnly,
      promoteCanonical: doc.promoteCanonical
    },
    byClassification,
    byLeague,
    priorityBacklog
  };

  return report;
}

export function buildTeamNewsSourceCoverageReportDay(dayKey) {
  const report = buildReport(dayKey);
  const outputFile = coverageReportPath(dayKey);
  writeJson(outputFile, report);
  return {
    ok: true,
    dayKey,
    file: outputFile,
    totalRows: report.totalRows,
    byClassification: report.byClassification,
    byLeague: report.byLeague
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("Usage: node engine-v1/jobs/build-team-news-source-coverage-report-day.js YYYY-MM-DD");
    process.exit(1);
  }

  try {
    const result = buildTeamNewsSourceCoverageReportDay(dayKey);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[build-team-news-source-coverage-report-day] failed", err);
    process.exit(1);
  }
}
