#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START imports
import * as CURRENT_OR_NEW_FS from "fs";
import * as CURRENT_OR_NEW_PATH from "path";
import { loadCurrentOrNewDiagnosticState as CURRENT_OR_NEW_loadDiagnosticState } from "../lib/football-truth-current-or-new-diagnostic-state-loader.js";
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END imports

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

const browserRouteConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");
const officialApiRouteConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-official-api-route-families.json");
const browserRouteConfig = fs.existsSync(browserRouteConfigPath) ? readJsonSafe(browserRouteConfigPath) : null;
const officialApiRouteConfig = fs.existsSync(officialApiRouteConfigPath) ? readJsonSafe(officialApiRouteConfigPath) : null;
const routeTargets = [];

function appendRouteTargetsFromConfig(routeConfig, sourceLane) {
  if (!routeConfig?.families) return;
  for (const family of routeConfig.families || []) {
    for (const competition of family.competitions || []) {
      if (!competition.competitionSlug) continue;
      routeTargets.push({
        competitionSlug: competition.competitionSlug,
        sourceUrl: competition.sourceUrl || competition.endpointUrl,
        adapter: competition.adapter || family.adapter,
        sourceLane,
        routeType: competition.routeType || family.routeType || sourceLane,
        seasonScope: competition.seasonScope || family.seasonScope || null,
        seasonLabel: competition.seasonLabel || family.seasonLabel || null,
        seasonStartDate: competition.seasonStartDate ?? family.seasonStartDate ?? null
      });
    }
  }
}

appendRouteTargetsFromConfig(browserRouteConfig, "browser_rendered_official");
appendRouteTargetsFromConfig(officialApiRouteConfig, "official_api");
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
const browserRowFiles = walk(diagnosticsRoot).filter((f) => /browser-rendered-official-standings-adapter-rows-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
browserRowFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const browserSummaryFiles = walk(diagnosticsRoot).filter((f) => /browser-rendered-official-standings-adapter-summary-\d{4}-\d{2}-\d{2}\.json$/.test(f));
browserSummaryFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const officialApiRowFiles = walk(diagnosticsRoot).filter((f) => /official-api-standings-adapter-rows-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
officialApiRowFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const officialApiSummaryFiles = walk(diagnosticsRoot).filter((f) => /official-api-standings-adapter-summary-\d{4}-\d{2}-\d{2}\.json$/.test(f));
officialApiSummaryFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const latestBrowserRowsPath = browserRowFiles[0] || null;
const latestBrowserSummaryPath = browserSummaryFiles[0] || null;
const latestOfficialApiRowsPath = officialApiRowFiles[0] || null;
const latestOfficialApiSummaryPath = officialApiSummaryFiles[0] || null;

const latestRowsPath = latestBrowserRowsPath;
const latestSummaryPath = latestBrowserSummaryPath;
const latestBrowserRows = latestBrowserRowsPath ? parseJsonlSafe(latestBrowserRowsPath) : [];
const latestOfficialApiRows = latestOfficialApiRowsPath ? parseJsonlSafe(latestOfficialApiRowsPath) : [];
function latestFile(pattern, root = path.join(process.cwd(), "data", "football-truth", "_diagnostics")) {
  const found = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (pattern.test(full)) found.push(full);
    }
  }
  found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found[0] || null;
}

const latestCurrentOrNewProofRowsPath = latestFile(/georgia-current-season-table-proof-v2-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const currentOrNewProofRows = latestCurrentOrNewProofRowsPath ? parseJsonlSafe(latestCurrentOrNewProofRowsPath) : [];
const latestOfficialHtmlRowsPath = latestFile(/jleague-official-html-standings-proof-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const officialHtmlProofRows = latestOfficialHtmlRowsPath ? parseJsonlSafe(latestOfficialHtmlRowsPath) : [];
const latestRows = [...latestBrowserRows, ...latestOfficialApiRows, ...currentOrNewProofRows, ...officialHtmlProofRows];

const latestSummary = latestBrowserSummaryPath ? readJsonSafe(latestBrowserSummaryPath) : null;
const latestOfficialApiSummary = latestOfficialApiSummaryPath ? readJsonSafe(latestOfficialApiSummaryPath) : null;
const sourceSummaries = [latestSummary, latestOfficialApiSummary].filter(Boolean);

const verifiedCompetitionSlugs = new Set(sourceSummaries.flatMap((summary) => summary?.summary?.verifiedCompetitionSlugs || []));
const competitionSummaryBySlug = new Map();
for (const sourceSummary of sourceSummaries) {
  for (const competition of sourceSummary?.competitions || []) {
    if (competition?.competitionSlug) competitionSummaryBySlug.set(competition.competitionSlug, competition);
  }
}
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

const verifiedPreviousCompletedRowSlugs = new Set(
  latestRows
    .filter((row) =>
      row.competitionSlug &&
      row.seasonScope === "previous_completed" &&
      row.qualityGateStatus === "verified" &&
      row.validationStatus === "passed"
    )
    .map((row) => row.competitionSlug)
);

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
    ["current_active", "new_not_started", "current_or_new"].includes(r.seasonScope) &&
    r.qualityGateStatus === "verified" &&
    r.validationStatus === "passed"
  );

  const previousCompletedSatisfied =
    previousRows.length > 0 &&
    (
      (verifiedCompetitionSlugs.has(slug) && comp?.qualityGateStatus === "verified") ||
      verifiedPreviousCompletedRowSlugs.has(slug)
    );

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
  latestOfficialApiRowsPath: latestOfficialApiRowsPath ? rel(latestOfficialApiRowsPath) : null,
  latestOfficialApiSummaryPath: latestOfficialApiSummaryPath ? rel(latestOfficialApiSummaryPath) : null,
  latestCurrentOrNewProofRowsPath: latestCurrentOrNewProofRowsPath ? rel(latestCurrentOrNewProofRowsPath) : null,
  currentOrNewProofRowsCount: currentOrNewProofRows.length,
  latestOfficialHtmlRowsPath: latestOfficialHtmlRowsPath ? rel(latestOfficialHtmlRowsPath) : null,
  officialHtmlProofRowsCount: officialHtmlProofRows.length,
  standingsSourceSummaryCount: sourceSummaries.length,
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

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START post-run
function CURRENT_OR_NEW_abs(p) {
  return CURRENT_OR_NEW_PATH.join(process.cwd(), p);
}

function CURRENT_OR_NEW_walk(dir, predicate, out = []) {
  const full = CURRENT_OR_NEW_abs(dir);
  if (!CURRENT_OR_NEW_FS.existsSync(full)) return out;
  for (const entry of CURRENT_OR_NEW_FS.readdirSync(full, { withFileTypes: true })) {
    const rel = CURRENT_OR_NEW_PATH.posix.join(dir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) CURRENT_OR_NEW_walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function CURRENT_OR_NEW_latestArtifact(fileRegex) {
  const re = new RegExp(fileRegex);
  const files = CURRENT_OR_NEW_walk("data/football-truth/_diagnostics", p => re.test(CURRENT_OR_NEW_PATH.basename(p)));
  if (!files.length) return null;
  return files
    .map(p => ({ p, mtimeMs: CURRENT_OR_NEW_FS.statSync(CURRENT_OR_NEW_abs(p)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function CURRENT_OR_NEW_taskSlug(task) {
  return task?.competitionSlug ?? task?.leagueSlug ?? task?.slug ?? task?.targetSlug ?? task?.competition?.slug ?? null;
}

function CURRENT_OR_NEW_isCurrentOrNewTask(task) {
  const text = JSON.stringify(task ?? {}).toLowerCase();
  return text.includes("current_or_new") || text.includes("current-or-new") || text.includes("currentornew");
}

function applyCurrentOrNewDiagnosticLifecycleOverlay(fileRegex) {
  const state = CURRENT_OR_NEW_loadDiagnosticState({
    root: process.cwd(),
    knownOutsideState: ["geo.1"]
  });

  if (state.validationStatus !== "passed") {
    throw new Error("current_or_new diagnostic state validation failed: " + JSON.stringify(state.blocks));
  }

  const artifact = CURRENT_OR_NEW_latestArtifact(fileRegex);
  if (!artifact) throw new Error("No lifecycle artifact found for regex " + fileRegex);

  const artifactPath = CURRENT_OR_NEW_abs(artifact);
  const output = JSON.parse(CURRENT_OR_NEW_FS.readFileSync(artifactPath, "utf8"));
  const summary = output.summary && typeof output.summary === "object" ? output.summary : output;

  summary.currentOrNewSeasonSatisfiedCount = state.projectedKnownCurrentOrNewSlugCount;
  summary.currentOrNewDiagnosticStateSatisfiedCount = state.materializedDiagnosticCurrentOrNewSlugCount;
  summary.currentOrNewDiagnosticStateVerifiedRowsCount = state.materializedDiagnosticCurrentOrNewRowCount;
  summary.currentOrNewKnownOutsideDiagnosticStateSatisfiedCount = state.knownExistingCurrentOrNewOutsideThisState.length;
  summary.currentOrNewProjectedKnownSlugs = state.projectedKnownCurrentOrNewSlugs;

  output.currentOrNewDiagnosticState = {
    stateDir: state.stateDir,
    stateRowsFiles: state.stateRowsFiles,
    materializedDiagnosticCurrentOrNewSlugCount: state.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: state.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: state.materializedDiagnosticCurrentOrNewSlugs,
    knownExistingCurrentOrNewOutsideDiagnosticState: state.knownExistingCurrentOrNewOutsideThisState,
    projectedKnownCurrentOrNewSlugCount: state.projectedKnownCurrentOrNewSlugCount,
    projectedKnownCurrentOrNewSlugs: state.projectedKnownCurrentOrNewSlugs,
    validationStatus: state.validationStatus,
    blocks: state.blocks
  };

  const satisfied = new Set(state.projectedKnownCurrentOrNewSlugs);
  for (const key of ["tasks", "dueTasks", "acceptedTasks", "acceptedExecutableTasks", "prioritizedTasks", "executionTasks", "rows"]) {
    if (!Array.isArray(output[key])) continue;
    const before = output[key].length;
    output[key] = output[key].filter(task => !(CURRENT_OR_NEW_isCurrentOrNewTask(task) && satisfied.has(CURRENT_OR_NEW_taskSlug(task))));
    const suppressed = before - output[key].length;
    if (suppressed > 0) {
      summary.currentOrNewSuppressedSatisfiedTaskCount = (summary.currentOrNewSuppressedSatisfiedTaskCount ?? 0) + suppressed;
    }
  }

  output.currentOrNewLifecycleIntegration = {
    status: "applied",
    mode: "post_run_diagnostic_artifact_overlay",
    loaderModule: "engine-v1/lib/football-truth-current-or-new-diagnostic-state-loader.js",
    artifact,
    currentOrNewSeasonSatisfiedCount: state.projectedKnownCurrentOrNewSlugCount,
    currentOrNewDiagnosticStateSatisfiedCount: state.materializedDiagnosticCurrentOrNewSlugCount,
    currentOrNewDiagnosticStateVerifiedRowsCount: state.materializedDiagnosticCurrentOrNewRowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  };

  CURRENT_OR_NEW_FS.writeFileSync(artifactPath, JSON.stringify(output, null, 2) + "\n");

  console.log(JSON.stringify({
    currentOrNewLifecycleIntegration: output.currentOrNewLifecycleIntegration
  }, null, 2));
}

applyCurrentOrNewDiagnosticLifecycleOverlay("^season-lane-coverage-ledger-\\d{4}-\\d{2}-\\d{2}\\.json$");
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END post-run

