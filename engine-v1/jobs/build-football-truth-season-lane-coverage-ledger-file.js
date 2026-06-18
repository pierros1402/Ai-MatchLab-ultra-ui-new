#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `season-lane-coverage-ledger-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function parseJsonlSafe(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function unique(xs) {
  return [...new Set(xs.filter(Boolean))];
}

function stableSort(xs) {
  return [...xs].sort((a, b) => String(a).localeCompare(String(b)));
}

function recursivelyCollectCompetitionMeta(value, out = new Map()) {
  if (!value || typeof value !== "object") return out;

  if (Array.isArray(value)) {
    for (const item of value) recursivelyCollectCompetitionMeta(item, out);
    return out;
  }

  const slug = value.competitionSlug || value.slug || value.competition_id || value.competitionId;
  if (typeof slug === "string" && /^[a-z]{3}\.\d+$/.test(slug)) {
    const prev = out.get(slug) || {};
    const candidateName =
      value.competitionName ||
      value.name ||
      value.leagueName ||
      value.title ||
      value.label ||
      value.competitionTitle ||
      value.displayName ||
      prev.name ||
      slug;

    const candidateCountry =
      value.country ||
      value.countryName ||
      value.countryCode ||
      value.nation ||
      value.region ||
      prev.country ||
      null;

    out.set(slug, {
      slug,
      name: String(candidateName || slug),
      country: candidateCountry ? String(candidateCountry) : null
    });
  }

  for (const item of Object.values(value)) recursivelyCollectCompetitionMeta(item, out);
  return out;
}

const allDataFiles = walk(DATA_ROOT);
const jsonFiles = allDataFiles.filter((f) => f.endsWith(".json"));
const textLikeFiles = allDataFiles.filter((f) => /\.(json|jsonl|txt|md)$/i.test(f));

const slugSet = new Set();
const metaBySlug = new Map();

for (const file of textLikeFiles) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
  for (const m of text.matchAll(/\b[a-z]{3}\.(?:\d+|cup)\b/g)) slugSet.add(m[0]);
}

for (const file of jsonFiles) {
  const j = readJsonSafe(file);
  if (!j) continue;
  recursivelyCollectCompetitionMeta(j, metaBySlug);
}

const routeConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");
const routeConfig = fs.existsSync(routeConfigPath) ? readJsonSafe(routeConfigPath) : null;
const routeTargets = [];

if (routeConfig?.families) {
  for (const family of routeConfig.families) {
    for (const competition of family.competitions || []) {
      if (competition.competitionSlug) {
        slugSet.add(competition.competitionSlug);
        routeTargets.push({
          competitionSlug: competition.competitionSlug,
          familyId: family.familyId,
          sourceHost: competition.sourceHost || family.sourceHost,
          sourceUrl: competition.sourceUrl,
          adapter: competition.adapter || family.adapter,
          seasonScope: competition.seasonScope || family.seasonScope || null,
          seasonLabel: competition.seasonLabel || family.seasonLabel || null,
          seasonStartDate: competition.seasonStartDate ?? family.seasonStartDate ?? null,
          seasonEndDate: competition.seasonEndDate ?? family.seasonEndDate ?? null,
          nextSeasonStartDate: competition.nextSeasonStartDate ?? family.nextSeasonStartDate ?? null,
          seasonStateEvidence: competition.seasonStateEvidence || family.seasonStateEvidence || null
        });
      }
    }
  }
}

const routeConfiguredLeagueSlugs = new Set(routeTargets.map((t) => t.competitionSlug).filter((s) => /^[a-z]{3}\.\d+$/.test(s)));
const stateStartDateSlugs = new Set();

const authoritativeLeagueSlugsForLedger = new Set(
  [...slugSet].filter((s) => /^[a-z]{3}\.\d+$/.test(s))
);

const knownNoisePrefixesForLedger = new Set(["www", "klo", "abc", "bad"]);
const leagueSlugs = stableSort([...authoritativeLeagueSlugsForLedger].filter((s) => {
  const prefix = String(s).split(".")[0];
  return !knownNoisePrefixesForLedger.has(prefix);
}));
const cupSlugs = stableSort([...slugSet].filter((s) => /^[a-z]{3}\.cup$/.test(s)));

const diagnosticsRoot = path.join(DATA_ROOT, "_diagnostics");
const rowFiles = walk(diagnosticsRoot).filter((f) => /browser-rendered-official-standings-adapter-rows-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
rowFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const summaryFiles = walk(diagnosticsRoot).filter((f) => /browser-rendered-official-standings-adapter-summary-\d{4}-\d{2}-\d{2}\.json$/.test(f));
summaryFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const latestRowsPath = rowFiles[0] || null;
const latestSummaryPath = summaryFiles[0] || null;
const latestRows = latestRowsPath ? parseJsonlSafe(latestRowsPath) : [];
const latestSummary = latestSummaryPath ? readJsonSafe(latestSummaryPath) : null;

const verifiedCompetitionSlugs = new Set(latestSummary?.summary?.verifiedCompetitionSlugs || []);
const competitionSummaryBySlug = new Map((latestSummary?.competitions || []).map((c) => [c.competitionSlug, c]));
const routeTargetBySlug = new Map(routeTargets.map((t) => [t.competitionSlug, t]));

const acceptedStartDateEvidenceBySlug = new Map();
const startDateEvidenceStateFiles = walk(path.join(DATA_ROOT, "_state", "season-start-date-evidence"))
  .filter((f) => /accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

for (const file of startDateEvidenceStateFiles) {
  for (const evidence of parseJsonlSafe(file)) {
    if (
      evidence.competitionSlug &&
      hasDate(evidence.nextSeasonStartDate) &&
      evidence.qualityGateStatus === "verified" &&
      evidence.validationStatus === "passed"
    ) {
      if (!acceptedStartDateEvidenceBySlug.has(evidence.competitionSlug)) {
        stateStartDateSlugs.add(evidence.competitionSlug);
        acceptedStartDateEvidenceBySlug.set(evidence.competitionSlug, {
          ...evidence,
          evidenceStatePath: rel(file)
        });
      }
    }
  }
}

const rowsBySlug = new Map();
for (const row of latestRows) {
  if (!row.competitionSlug) continue;
  if (!rowsBySlug.has(row.competitionSlug)) rowsBySlug.set(row.competitionSlug, []);
  rowsBySlug.get(row.competitionSlug).push(row);
}

function hasDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildStartDateTarget(slug, meta, routeTarget, previousCompletedSatisfied) {
  const displayName = meta?.name && meta.name !== slug ? meta.name : slug;
  const country = meta?.country;
  const base = country ? `${displayName} ${country}` : displayName;
  const priorityBand = previousCompletedSatisfied ? "p0_has_previous_completed_needs_next_start_date" : "p1_needs_previous_completed_and_next_start_date";

  const queries = [
    `"${base}" official fixtures 2026 2027 start date`,
    `"${base}" official schedule 2026 2027 first match`,
    `"${base}" league season 2026 2027 starts official`,
    `"${base}" 2026 2027 calendar official`
  ];

  if (routeTarget?.sourceHost) {
    queries.unshift(`site:${routeTarget.sourceHost} "${displayName}" 2026 2027 fixtures start date`);
  }

  return {
    competitionSlug: slug,
    competitionName: displayName,
    country,
    priorityBand,
    searchExecutionStatus: "not_executed_by_ledger",
    reason: "nextSeasonStartDate_missing",
    sourceHostHint: routeTarget?.sourceHost || null,
    sourceUrlHint: routeTarget?.sourceUrl || null,
    queries: unique(queries)
  };
}

const ledgerRows = [];
const startDateTargets = [];

for (const slug of leagueSlugs) {
  const rows = rowsBySlug.get(slug) || [];
  const comp = competitionSummaryBySlug.get(slug) || null;
  const routeTarget = routeTargetBySlug.get(slug) || null;
  const meta = metaBySlug.get(slug) || { slug, name: slug, country: null };

  const previousRows = rows.filter((r) =>
    r.seasonScope === "previous_completed" &&
    r.qualityGateStatus === "verified" &&
    r.validationStatus === "passed"
  );

  const currentRows = rows.filter((r) =>
    ["current_active", "new_not_started"].includes(r.seasonScope) &&
    r.qualityGateStatus === "verified" &&
    r.validationStatus === "passed"
  );

  const previousCompletedSatisfied =
    previousRows.length > 0 &&
    verifiedCompetitionSlugs.has(slug) &&
    comp?.qualityGateStatus === "verified";

  const acceptedStartDateEvidence = acceptedStartDateEvidenceBySlug.get(slug) || null;

  const nextSeasonStartDate =
    acceptedStartDateEvidence?.nextSeasonStartDate ||
    rows.find((r) => hasDate(r.nextSeasonStartDate))?.nextSeasonStartDate ||
    (hasDate(routeTarget?.nextSeasonStartDate) ? routeTarget.nextSeasonStartDate : null);

  const currentOrNewSeasonSatisfied = currentRows.length > 0;
  const nextSeasonStartDateSatisfied = hasDate(nextSeasonStartDate);

  const strictAllThreeLaneSatisfied =
    previousCompletedSatisfied &&
    currentOrNewSeasonSatisfied &&
    nextSeasonStartDateSatisfied;

  const practicalFullCoverageSatisfied =
    previousCompletedSatisfied &&
    nextSeasonStartDateSatisfied &&
    (currentOrNewSeasonSatisfied || true);

  const missingLanes = [];
  if (!previousCompletedSatisfied) missingLanes.push("previous_completed_season_standings");
  if (!currentOrNewSeasonSatisfied) missingLanes.push("current_or_new_season_standings");
  if (!nextSeasonStartDateSatisfied) missingLanes.push("next_season_start_date");

  const ledger = {
    competitionSlug: slug,
    competitionName: meta.name,
    country: meta.country,
    previousCompletedStandingsSatisfied: previousCompletedSatisfied,
    previousCompletedRowCount: previousRows.length,
    currentOrNewSeasonStandingsSatisfied: currentOrNewSeasonSatisfied,
    currentOrNewSeasonRowCount: currentRows.length,
    nextSeasonStartDateSatisfied,
    nextSeasonStartDate,
    nextSeasonStartDateEvidenceStatus: acceptedStartDateEvidence?.evidenceStatus || null,
    nextSeasonStartDateEvidenceHost: acceptedStartDateEvidence?.evidenceHost || null,
    nextSeasonStartDateEvidenceUrl: acceptedStartDateEvidence?.evidenceUrl || null,
    nextSeasonStartDateEvidenceStatePath: acceptedStartDateEvidence?.evidenceStatePath || null,
    strictAllThreeLaneSatisfied,
    practicalFullCoverageSatisfied,
    missingLanes,
    verifiedInLatestBrowserAdapter: verifiedCompetitionSlugs.has(slug),
    latestQualityGateStatus: comp?.qualityGateStatus || null,
    latestParsedRowCount: comp?.parsedRowCount || null,
    familyId: routeTarget?.familyId || null,
    sourceHost: routeTarget?.sourceHost || null,
    sourceUrl: routeTarget?.sourceUrl || null
  };

  ledgerRows.push(ledger);

  if (!nextSeasonStartDateSatisfied) {
    startDateTargets.push(buildStartDateTarget(slug, meta, routeTarget, previousCompletedSatisfied));
  }
}

const previousCompletedSatisfiedCount = ledgerRows.filter((r) => r.previousCompletedStandingsSatisfied).length;
const currentOrNewSeasonSatisfiedCount = ledgerRows.filter((r) => r.currentOrNewSeasonStandingsSatisfied).length;
const nextSeasonStartDateSatisfiedCount = ledgerRows.filter((r) => r.nextSeasonStartDateSatisfied).length;
const strictAllThreeLaneSatisfiedCount = ledgerRows.filter((r) => r.strictAllThreeLaneSatisfied).length;
const practicalFullCoverageSatisfiedCount = ledgerRows.filter((r) => r.practicalFullCoverageSatisfied).length;

const byCountryPrefix = {};
for (const row of ledgerRows) {
  const prefix = row.competitionSlug.split(".")[0];
  byCountryPrefix[prefix] ||= {
    countryPrefix: prefix,
    leagueCount: 0,
    previousCompletedSatisfiedCount: 0,
    nextSeasonStartDateSatisfiedCount: 0,
    strictAllThreeLaneSatisfiedCount: 0
  };
  byCountryPrefix[prefix].leagueCount++;
  if (row.previousCompletedStandingsSatisfied) byCountryPrefix[prefix].previousCompletedSatisfiedCount++;
  if (row.nextSeasonStartDateSatisfied) byCountryPrefix[prefix].nextSeasonStartDateSatisfiedCount++;
  if (row.strictAllThreeLaneSatisfied) byCountryPrefix[prefix].strictAllThreeLaneSatisfiedCount++;
}

const startDateBatches = [];
const batchSize = 40;
for (let i = 0; i < startDateTargets.length; i += batchSize) {
  const batch = startDateTargets.slice(i, i + batchSize);
  startDateBatches.push({
    batchId: `start_date_evidence_batch_${String(startDateBatches.length + 1).padStart(3, "0")}`,
    targetCount: batch.length,
    slugs: batch.map((t) => t.competitionSlug),
    searchExecutedNow: false
  });
}

const summary = {
  status: "passed",
  runner: "season_lane_coverage_ledger",
  latestBrowserRowsPath: latestRowsPath ? rel(latestRowsPath) : null,
  latestBrowserSummaryPath: latestSummaryPath ? rel(latestSummaryPath) : null,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  discoveredCompetitionSlugCount: leagueSlugs.length + cupSlugs.length,
  leagueCompetitionCount: leagueSlugs.length,
  routeConfiguredLeagueSlugCount: routeConfiguredLeagueSlugs.size,
  stateStartDateSlugCount: stateStartDateSlugs.size,
  cupCompetitionCount: cupSlugs.length,
  previousCompletedSatisfiedCount,
  previousCompletedVerifiedRowsCount: latestRows.filter((r) => r.seasonScope === "previous_completed" && r.qualityGateStatus === "verified").length,
  currentOrNewSeasonSatisfiedCount,
  nextSeasonStartDateSatisfiedCount,
  acceptedStartDateEvidenceStateCount: acceptedStartDateEvidenceBySlug.size,
  acceptedStartDateEvidenceStateSlugs: [...acceptedStartDateEvidenceBySlug.keys()].sort(),
  strictAllThreeLaneSatisfiedCount,
  practicalFullCoverageSatisfiedCount,
  missingPreviousCompletedCount: ledgerRows.length - previousCompletedSatisfiedCount,
  missingCurrentOrNewSeasonCount: ledgerRows.length - currentOrNewSeasonSatisfiedCount,
  missingNextSeasonStartDateCount: ledgerRows.length - nextSeasonStartDateSatisfiedCount,
  startDateEvidenceTargetCount: startDateTargets.length,
  startDateEvidenceBatchCount: startDateBatches.length,
  startDateEvidenceBatchSize: batchSize,
  recommendedNextLane: "execute_start_date_evidence_discovery_batches_then_backfill_nextSeasonStartDate_before_expanding_more_standings"
};

const outPath = path.join(OUT_DIR, `season-lane-coverage-ledger-${DATE}.json`);
const ledgerPath = path.join(OUT_DIR, `season-lane-coverage-ledger-rows-${DATE}.jsonl`);
const startDateTargetsPath = path.join(OUT_DIR, `season-start-date-evidence-targets-${DATE}.jsonl`);
const startDateBatchesPath = path.join(OUT_DIR, `season-start-date-evidence-batches-${DATE}.json`);

const report = {
  summary,
  byCountryPrefix: Object.values(byCountryPrefix).sort((a, b) => b.leagueCount - a.leagueCount || a.countryPrefix.localeCompare(b.countryPrefix)),
  startDateBatches,
  topCoverageRows: ledgerRows.filter((r) => r.previousCompletedStandingsSatisfied || r.nextSeasonStartDateSatisfied || r.strictAllThreeLaneSatisfied),
  worstGapRowsSample: ledgerRows.filter((r) => r.missingLanes.length === 3).slice(0, 200),
  startDateTargetsSample: startDateTargets.slice(0, 200)
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
fs.writeFileSync(ledgerPath, ledgerRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
fs.writeFileSync(startDateTargetsPath, startDateTargets.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
fs.writeFileSync(startDateBatchesPath, JSON.stringify(startDateBatches, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  ledgerRowsOutput: rel(ledgerPath),
  startDateTargetsOutput: rel(startDateTargetsPath),
  startDateBatchesOutput: rel(startDateBatchesPath),
  summary
}, null, 2));
