import fs from "fs";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

const GENERIC_REFERENCE_DOMAINS = new Set([
  "transfermarkt.com",
  "www.transfermarkt.com",
  "worldfootball.net",
  "www.worldfootball.net",
  "int.soccerway.com",
  "soccerway.com",
  "www.soccerway.com",
  "globalsportsarchive.com",
  "www.globalsportsarchive.com"
]);

const CLASS_COUNTER_KEYS = new Map([
  ["registry_sources_not_fetching", "registrySourcesNotFetching"],
  ["missing_official_source_coverage", "missingOfficialSourceCoverage"],
  ["official_source_blocked_by_cloudflare", "officialSourceBlockedByCloudflare"],
  ["registry_fetches_but_no_usable_article", "registryFetchesButNoUsableArticle"],
  ["production_candidate_wrong_context_or_rejected", "productionCandidateWrongContextOrRejected"],
  ["production_usable", "productionUsable"],
  ["diagnostic_only", "diagnosticOnly"],
  ["no_sources", "noSources"]
]);

function normalizeDomain(value) {
  const rawValue =
    value && typeof value === "object"
      ? value.domain || value.host || value.url || value.href || ""
      : value;

  const raw = String(rawValue || "").trim().toLowerCase();

  if (!raw) return "";

  try {
    return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {}

  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function rowDomains(row) {
  return unique([
    ...(Array.isArray(row?.registrySourceDomains) ? row.registrySourceDomains : []),
    ...(Array.isArray(row?.priorityDomains) ? row.priorityDomains : []),
    ...(Array.isArray(row?.diagnosticDomains) ? row.diagnosticDomains : [])
  ].map(normalizeDomain));
}

function sourceUrlDomain(source) {
  return normalizeDomain(source?.url || source?.href || source?.sourceUrl || source?.fetchFinalUrl || "");
}

function isGenericDomain(domain) {
  return GENERIC_REFERENCE_DOMAINS.has(normalizeDomain(domain));
}

function isOfficialSourceSample(source) {
  const domain = sourceUrlDomain(source);
  const typeText = [
    source?.id,
    source?.label,
    source?.type,
    source?.trustTier,
    source?.sourceType,
    source?.registryType
  ].filter(Boolean).join(" ");

  const officialByMeta = /official|official_club_news|team_official|club_news/i.test(typeText);

  return officialByMeta && domain && !isGenericDomain(domain);
}

function isBlockedOfficialFetchSample(source) {
  if (!isOfficialSourceSample(source)) return false;

  const status = Number(source?.fetchStatus || source?.status || 0);
  const reason = String(source?.fetchReason || source?.failureReason || source?.reason || "");
  const title = String(source?.title || source?.textPreview || "");

  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    /cloudflare|captcha|challenge|blocked|forbidden|access_denied|access denied|http_not_ok/i.test(reason) ||
    /just a moment|cloudflare|captcha/i.test(title)
  );
}

function resultRowTeam(row) {
  const provider = row?.aiProviderAudit || {};
  const input = provider.input || {};

  return row?.target?.team || input.team || row?.team || "";
}

function resultRowLeague(row) {
  const provider = row?.aiProviderAudit || {};
  const input = provider.input || {};

  return String(row?.target?.leagueSlug || input.leagueSlug || row?.league || "").toLowerCase();
}

function reportRowTeam(row) {
  return row?.team || row?.targetTeam || row?.homeTeam || "";
}

function reportRowLeague(row) {
  return String(row?.league || row?.leagueSlug || "").toLowerCase();
}

function resultKey(league, team) {
  return [String(league || "").toLowerCase(), normalizeText(team)].join("::");
}

function buildResearchResultIndex(resultsRows) {
  const byLeagueTeam = new Map();
  const byTeam = new Map();

  for (const row of resultsRows || []) {
    const league = resultRowLeague(row);
    const team = resultRowTeam(row);

    if (!team) continue;

    byLeagueTeam.set(resultKey(league, team), row);
    byTeam.set(normalizeText(team), row);
  }

  return { byLeagueTeam, byTeam };
}

function findMatchingResearchRow(reportRow, resultIndex) {
  const league = reportRowLeague(reportRow);
  const team = reportRowTeam(reportRow);

  if (!team) return null;

  return (
    resultIndex.byLeagueTeam.get(resultKey(league, team)) ||
    resultIndex.byTeam.get(normalizeText(team)) ||
    null
  );
}

function registryTextSamplesFromResearchRow(resultRow) {
  return resultRow?.aiProviderAudit?.diagnostics?.registry?.registryTextSamples || [];
}

function detectOfficialBlockedRow(reportRow, resultIndex) {
  if (!reportRow || reportRow.classification !== "registry_sources_not_fetching") {
    return null;
  }

  const researchRow = findMatchingResearchRow(reportRow, resultIndex);
  const samples = registryTextSamplesFromResearchRow(researchRow);
  const blockedOfficialSamples = samples.filter(isBlockedOfficialFetchSample);

  if (!blockedOfficialSamples.length) {
    return null;
  }

  return {
    researchRow,
    blockedOfficialSamples
  };
}

function isGenericReferenceOnlyRow(row) {
  if (!row || row.classification !== "registry_sources_not_fetching") {
    return false;
  }

  const domains = rowDomains(row);

  if (!domains.length) {
    return false;
  }

  const hasPriorityDomains =
    Array.isArray(row?.priorityDomains) &&
    row.priorityDomains.map(normalizeDomain).filter(Boolean).length > 0;

  const hasDiagnosticDomains =
    Array.isArray(row?.diagnosticDomains) &&
    row.diagnosticDomains.map(normalizeDomain).filter(Boolean).length > 0;

  if (hasPriorityDomains || hasDiagnosticDomains) {
    return false;
  }

  return domains.every(domain => GENERIC_REFERENCE_DOMAINS.has(domain));
}

function adjustCount(bucket, oldKey, newKey) {
  if (!bucket || typeof bucket !== "object") return;

  if (typeof bucket[oldKey] === "number") {
    bucket[oldKey] = Math.max(0, bucket[oldKey] - 1);
  }

  bucket[newKey] = Number(bucket[newKey] || 0) + 1;
}

function adjustCamelCount(bucket, oldKey, newKey) {
  if (!bucket || typeof bucket !== "object") return;

  const oldCounter = CLASS_COUNTER_KEYS.get(oldKey);
  const newCounter = CLASS_COUNTER_KEYS.get(newKey);

  if (oldCounter && typeof bucket[oldCounter] === "number") {
    bucket[oldCounter] = Math.max(0, bucket[oldCounter] - 1);
  }

  if (newCounter) {
    bucket[newCounter] = Number(bucket[newCounter] || 0) + 1;
  }
}

function adjustByLeague(report, league, oldKey, newKey) {
  const byLeague = report?.byLeague;

  if (!byLeague || typeof byLeague !== "object" || !league) {
    return;
  }

  const row = byLeague[league];

  if (!row || typeof row !== "object") {
    return;
  }

  if (row.byClassification && typeof row.byClassification === "object") {
    adjustCount(row.byClassification, oldKey, newKey);
  }

  adjustCamelCount(row, oldKey, newKey);
}

function applyClassificationChange(report, row, changes, next) {
  const previousClassification = row.classification;

  row.classification = next.classification;
  row.recommendedNextAction = next.recommendedNextAction;
  row.classificationReason = next.classificationReason;

  if (next.extra && typeof next.extra === "object") {
    Object.assign(row, next.extra);
  }

  const change = {
    league: row.league || "unknown",
    team: row.team || null,
    opponent: row.opponent || null,
    domains: rowDomains(row),
    from: previousClassification,
    to: row.classification,
    recommendedNextAction: row.recommendedNextAction,
    reason: row.classificationReason
  };

  changes.push(change);

  adjustCount(report.byClassification, previousClassification, row.classification);
  adjustByLeague(report, row.league, previousClassification, row.classification);
}

function normalizeReport(report, resultsRows = []) {
  const rows = Array.isArray(report?.priorityBacklog) ? report.priorityBacklog : [];
  const resultIndex = buildResearchResultIndex(resultsRows);
  const changes = [];

  for (const row of rows) {
    const blocked = detectOfficialBlockedRow(row, resultIndex);

    if (blocked) {
      applyClassificationChange(report, row, changes, {
        classification: "official_source_blocked_by_cloudflare",
        recommendedNextAction: "find_alternate_trusted_team_news_source_or_official_mirror",
        classificationReason: "official_team_news_source_fetch_blocked_or_http_not_ok",
        extra: {
          officialSourceBlocked: true,
          blockedOfficialDomains: unique(blocked.blockedOfficialSamples.map(sourceUrlDomain)),
          blockedOfficialSamples: blocked.blockedOfficialSamples.slice(0, 8).map(source => ({
            id: source.id || null,
            label: source.label || null,
            type: source.type || null,
            trustTier: source.trustTier || null,
            url: source.url || null,
            fetchStatus: source.fetchStatus ?? null,
            fetchReason: source.fetchReason || null,
            fetchFinalUrl: source.fetchFinalUrl || null,
            fetchContentType: source.fetchContentType || null
          }))
        }
      });

      continue;
    }

    if (!isGenericReferenceOnlyRow(row)) {
      continue;
    }

    applyClassificationChange(report, row, changes, {
      classification: "missing_official_source_coverage",
      recommendedNextAction: "add_official_team_news_source_to_registry",
      classificationReason: "registry_has_only_generic_reference_sources_no_official_club_news_source",
      extra: {
        genericReferenceOnly: true
      }
    });
  }

  report.normalizedAt = new Date().toISOString();
  report.normalization = {
    ...(report.normalization || {}),
    sourceCoverageNormalizationApplied: true,
    missingOfficialSourceCoverageApplied: true,
    missingOfficialSourceCoverageCount: changes.filter(row => row.to === "missing_official_source_coverage").length,
    officialSourceBlockedCount: changes.filter(row => row.to === "official_source_blocked_by_cloudflare").length,
    changedRows: changes
  };

  return { report, changes };
}

function backlogKey(row) {
  return [
    String(row.league || "unknown").toLowerCase(),
    String(row.team || "unknown").toLowerCase()
  ].join("::");
}

function recommendedActionForClassification(classification) {
  if (classification === "official_source_blocked_by_cloudflare") {
    return "find_alternate_trusted_team_news_source_or_official_mirror";
  }

  return "add_official_team_news_source_to_registry";
}

function updateCumulativeBacklog(dayKey, changedRows) {
  const file = resolveDataPath("team-news", "_source-coverage-backlog.json");
  ensureDir(resolveDataPath("team-news"));

  let doc = {
    ok: true,
    generatedAt: new Date().toISOString(),
    rows: []
  };

  if (fs.existsSync(file)) {
    try {
      doc = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      doc = {
        ok: true,
        generatedAt: new Date().toISOString(),
        rows: []
      };
    }
  }

  const existingRows = Array.isArray(doc.rows) ? doc.rows : [];
  const byKey = new Map(existingRows.map(row => [backlogKey(row), row]));

  for (const changed of changedRows) {
    const key = backlogKey(changed);
    const current = byKey.get(key) || {
      league: changed.league,
      team: changed.team,
      firstSeenDayKey: dayKey,
      firstSeenAt: new Date().toISOString(),
      seenCount: 0,
      opponents: [],
      domains: []
    };

    current.classification = changed.to || "missing_official_source_coverage";
    current.latestDayKey = dayKey;
    current.lastSeenAt = new Date().toISOString();
    current.seenCount = Number(current.seenCount || 0) + 1;
    current.opponents = unique([...(current.opponents || []), changed.opponent].filter(Boolean));
    current.domains = unique([...(current.domains || []), ...(changed.domains || [])]);
    current.recommendedNextAction = changed.recommendedNextAction || recommendedActionForClassification(current.classification);
    current.reason = changed.reason || current.reason || null;

    byKey.set(key, current);
  }

  const rows = Array.from(byKey.values()).sort((a, b) => {
    const aSeen = Number(a.seenCount || 0);
    const bSeen = Number(b.seenCount || 0);

    if (bSeen !== aSeen) return bSeen - aSeen;

    return String(a.team || "").localeCompare(String(b.team || ""));
  });

  const nextDoc = {
    ok: true,
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    rows
  };

  fs.writeFileSync(file, JSON.stringify(nextDoc, null, 2) + "\n", "utf8");

  return {
    ok: true,
    file,
    totalRows: rows.length,
    changedRows: changedRows.length
  };
}

export function normalizeTeamNewsSourceCoverageReportDay(dayKey) {
  const reportFile = resolveDataPath("team-news", "_coverage-reports", `${dayKey}.json`);
  const resultFile = resolveDataPath("team-news", "_research-results", `${dayKey}.json`);

  if (!fs.existsSync(reportFile)) {
    return {
      ok: false,
      dayKey,
      reason: "coverage_report_missing",
      file: reportFile
    };
  }

  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));

  let resultsRows = [];

  if (fs.existsSync(resultFile)) {
    try {
      const resultsDoc = JSON.parse(fs.readFileSync(resultFile, "utf8"));
      resultsRows = Array.isArray(resultsDoc?.results) ? resultsDoc.results : [];
    } catch {
      resultsRows = [];
    }
  }

  const result = normalizeReport(report, resultsRows);

  fs.writeFileSync(reportFile, JSON.stringify(result.report, null, 2) + "\n", "utf8");

  const backlog = updateCumulativeBacklog(dayKey, result.changes);

  return {
    ok: true,
    dayKey,
    file: reportFile,
    changedRows: result.changes.length,
    missingOfficialSourceCoverageCount: result.changes.filter(row => row.to === "missing_official_source_coverage").length,
    officialSourceBlockedCount: result.changes.filter(row => row.to === "official_source_blocked_by_cloudflare").length,
    backlog
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("[normalize-team-news-source-coverage-report-day] missing dayKey");
    process.exit(1);
  }

  try {
    const result = normalizeTeamNewsSourceCoverageReportDay(dayKey);
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exit(1);
    }
  } catch (err) {
    console.error("[normalize-team-news-source-coverage-report-day] fatal", err);
    process.exit(1);
  }
}
