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
    return;
  }

  adjustCount(row, oldKey, newKey);
}

function normalizeReport(report) {
  const rows = Array.isArray(report?.priorityBacklog) ? report.priorityBacklog : [];
  const changes = [];

  for (const row of rows) {
    if (!isGenericReferenceOnlyRow(row)) {
      continue;
    }

    const previousClassification = row.classification;
    row.classification = "missing_official_source_coverage";
    row.recommendedNextAction = "add_official_team_news_source_to_registry";
    row.classificationReason = "registry_has_only_generic_reference_sources_no_official_club_news_source";
    row.genericReferenceOnly = true;

    changes.push({
      league: row.league || "unknown",
      team: row.team || null,
      opponent: row.opponent || null,
      domains: rowDomains(row),
      from: previousClassification,
      to: row.classification
    });

    adjustCount(report.byClassification, previousClassification, row.classification);
    adjustByLeague(report, row.league, previousClassification, row.classification);
  }

  report.normalizedAt = new Date().toISOString();
  report.normalization = {
    ...(report.normalization || {}),
    missingOfficialSourceCoverageApplied: true,
    missingOfficialSourceCoverageCount: changes.length,
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

    current.classification = "missing_official_source_coverage";
    current.latestDayKey = dayKey;
    current.lastSeenAt = new Date().toISOString();
    current.seenCount = Number(current.seenCount || 0) + 1;
    current.opponents = unique([...(current.opponents || []), changed.opponent].filter(Boolean));
    current.domains = unique([...(current.domains || []), ...(changed.domains || [])]);
    current.recommendedNextAction = "add_official_team_news_source_to_registry";

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

  if (!fs.existsSync(reportFile)) {
    return {
      ok: false,
      dayKey,
      reason: "coverage_report_missing",
      file: reportFile
    };
  }

  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const result = normalizeReport(report);

  fs.writeFileSync(reportFile, JSON.stringify(result.report, null, 2) + "\n", "utf8");

  const backlog = updateCumulativeBacklog(dayKey, result.changes);

  return {
    ok: true,
    dayKey,
    file: reportFile,
    changedRows: result.changes.length,
    missingOfficialSourceCoverageCount: result.changes.length,
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
