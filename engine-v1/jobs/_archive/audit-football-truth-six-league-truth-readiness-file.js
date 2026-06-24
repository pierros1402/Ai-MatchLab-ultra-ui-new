import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const scanRoot = path.join("data", "football-truth");

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-truth-readiness-audit-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-truth-readiness-audit-2026-06-15.json"
);

const competitions = [
  { slug: "esp.1", label: "Spain LaLiga", family: "laliga", aliases: ["esp.1", "laliga", "laliga easports", "primera division", "primera división"] },
  { slug: "esp.2", label: "Spain LaLiga Hypermotion", family: "laliga", aliases: ["esp.2", "laliga hypermotion", "segunda division", "segunda división"] },
  { slug: "nor.1", label: "Norway Eliteserien", family: "norway_ntf", aliases: ["nor.1", "eliteserien"] },
  { slug: "nor.2", label: "Norway OBOS-ligaen", family: "norway_ntf", aliases: ["nor.2", "obos-ligaen", "obos ligaen", "obosligaen"] },
  { slug: "swe.1", label: "Sweden Allsvenskan", family: "sportomedia", aliases: ["swe.1", "allsvenskan"] },
  { slug: "swe.2", label: "Sweden Superettan", family: "sportomedia", aliases: ["swe.2", "superettan"] }
];

const allowedExts = new Set([".json", ".jsonl", ".txt", ".md", ".csv", ".html", ".htm"]);
const maxFileSizeBytes = 12 * 1024 * 1024;

const areaKeywords = {
  standingsStats: [
    "standing", "standings", "league table", "table", "position", "rank",
    "points", "played", "won", "drawn", "lost", "goalsfor", "goalsagainst",
    "goal difference", "statistics", "stats"
  ],
  fixturesResults: [
    "fixture", "fixtures", "schedule", "calendar", "match", "matches",
    "matchday", "result", "results", "next fixture", "next match", "terminliste"
  ],
  seasonState: [
    "seasonstate", "season state", "season-status", "season status",
    "active_current_season", "active", "inactive", "completed",
    "current season", "break", "paused", "interrupted"
  ],
  nextActiveRestartDate: [
    "nextactive", "next active", "nextcheck", "next check", "restart",
    "restartdate", "restart date", "resumption", "resume", "starts",
    "startdate", "start date", "first fixture", "first match", "next fixture", "next match"
  ]
};

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function shouldSkipPath(filePath) {
  const normalized = normalizePath(filePath);

  if (normalized.includes("/node_modules/")) return true;
  if (normalized.includes("/.git/")) return true;
  if (normalized.includes("/six-league-truth-readiness-audit-2026-06-15/")) return true;

  return false;
}

function categoryFor(filePath) {
  const normalized = normalizePath(filePath);

  if (normalized.includes("/_diagnostics/")) return "diagnostic";
  if (normalized.includes("/_snapshots/")) return "snapshot_or_raw_capture";
  if (normalized.startsWith("data/football-truth/")) return "production_or_canonical_candidate";

  return "other";
}

function walkFiles(root) {
  const out = [];

  function walk(current) {
    if (!fs.existsSync(current)) return;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const normalized = normalizePath(fullPath);

      if (shouldSkipPath(normalized)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExts.has(ext)) continue;

      out.push(fullPath);
    }
  }

  walk(root);
  return out.sort();
}

function safeRead(filePath) {
  const stat = fs.statSync(filePath);

  if (stat.size > maxFileSizeBytes) {
    return { skipped: true, sizeBytes: stat.size, text: "" };
  }

  return { skipped: false, sizeBytes: stat.size, text: fs.readFileSync(filePath, "utf8") };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactTermRegex(term) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term.toLowerCase())}([^a-z0-9]|$)`, "i");
}

function hasExactTerm(text, term) {
  return exactTermRegex(term).test(text);
}

function includesAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function hasDateLikeText(text) {
  return (
    /\b20[2-9][0-9][-/.][0-1]?[0-9][-/.][0-3]?[0-9]\b/.test(text) ||
    /\b[0-3]?[0-9][-/.][0-1]?[0-9][-/.]20[2-9][0-9]\b/.test(text) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)
  );
}

function snippetFor(text, terms) {
  const lower = text.toLowerCase();
  let best = -1;

  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }

  if (best < 0) return null;

  return text
    .slice(Math.max(0, best - 180), Math.min(text.length, best + 300))
    .replace(/\s+/g, " ")
    .trim();
}

const files = walkFiles(scanRoot);
const scanned = [];
const skipped = [];

for (const filePath of files) {
  const relPath = normalizePath(path.relative(process.cwd(), filePath));
  const read = safeRead(filePath);

  if (read.skipped) {
    skipped.push({ path: relPath, sizeBytes: read.sizeBytes, reason: "file_too_large" });
    continue;
  }

  scanned.push({
    path: relPath,
    category: categoryFor(relPath),
    sizeBytes: read.sizeBytes,
    text: read.text,
    lowerText: read.text.toLowerCase()
  });
}

function analyzeFileForCompetition(file, competition) {
  const pathText = file.path.toLowerCase();
  const text = file.lowerText;

  const directSlugMention =
    hasExactTerm(pathText, competition.slug) ||
    hasExactTerm(text, competition.slug);

  const aliasMention =
    competition.aliases.some((alias) => hasExactTerm(pathText, alias) || hasExactTerm(text, alias));

  if (!directSlugMention && !aliasMention) {
    return null;
  }

  const standingsStats = includesAny(text, areaKeywords.standingsStats);
  const fixturesResults = includesAny(text, areaKeywords.fixturesResults);
  const seasonState = includesAny(text, areaKeywords.seasonState);
  const nextActiveRestartDate =
    includesAny(text, areaKeywords.nextActiveRestartDate) && hasDateLikeText(file.text);

  const anyRequiredArea =
    standingsStats || fixturesResults || seasonState || nextActiveRestartDate;

  return {
    path: file.path,
    category: file.category,
    sizeBytes: file.sizeBytes,
    directSlugMention,
    aliasMention,
    standingsStats,
    fixturesResults,
    seasonState,
    nextActiveRestartDate,
    anyRequiredArea,
    snippet: snippetFor(file.text, [
      competition.slug,
      ...competition.aliases,
      ...Object.values(areaKeywords).flat()
    ])
  };
}

function summarizeCompetition(competition) {
  const evidenceRows = scanned
    .map((file) => analyzeFileForCompetition(file, competition))
    .filter(Boolean)
    .filter((row) => row.anyRequiredArea);

  const diagnosticRows = evidenceRows.filter((row) => row.category === "diagnostic");
  const snapshotRows = evidenceRows.filter((row) => row.category === "snapshot_or_raw_capture");
  const productionRows = evidenceRows.filter((row) => row.category === "production_or_canonical_candidate");

  const productionDirectRows = productionRows.filter((row) => row.directSlugMention);
  const diagnosticDirectRows = diagnosticRows.filter((row) => row.directSlugMention);
  const snapshotDirectRows = snapshotRows.filter((row) => row.directSlugMention);

  const strict = {
    standingsStats: productionDirectRows.filter((row) => row.standingsStats).length,
    fixturesResults: productionDirectRows.filter((row) => row.fixturesResults).length,
    seasonState: productionDirectRows.filter((row) => row.seasonState).length,
    nextActiveRestartDate: productionDirectRows.filter((row) => row.nextActiveRestartDate).length
  };

  const diagnosticOrSnapshot = {
    standingsStats: [...diagnosticDirectRows, ...snapshotDirectRows].filter((row) => row.standingsStats).length,
    fixturesResults: [...diagnosticDirectRows, ...snapshotDirectRows].filter((row) => row.fixturesResults).length,
    seasonState: [...diagnosticDirectRows, ...snapshotDirectRows].filter((row) => row.seasonState).length,
    nextActiveRestartDate: [...diagnosticDirectRows, ...snapshotDirectRows].filter((row) => row.nextActiveRestartDate).length
  };

  const missingStrictTruthAreas = Object.entries(strict)
    .filter(([, count]) => count === 0)
    .map(([key]) => key);

  let strictTruthReadinessStatus = "no_local_required_area_evidence_found";

  if (productionDirectRows.length === 0 && (diagnosticDirectRows.length > 0 || snapshotDirectRows.length > 0)) {
    strictTruthReadinessStatus = "diagnostic_or_snapshot_only_not_project_truth";
  } else if (productionDirectRows.length > 0 && missingStrictTruthAreas.length > 0) {
    strictTruthReadinessStatus = "production_candidate_partial_truth_incomplete";
  } else if (productionDirectRows.length > 0 && missingStrictTruthAreas.length === 0) {
    strictTruthReadinessStatus = "production_candidate_all_required_areas_present_needs_manual_validation";
  }

  const topProductionCandidates = productionDirectRows
    .sort((a, b) =>
      Number(b.standingsStats) + Number(b.fixturesResults) + Number(b.seasonState) + Number(b.nextActiveRestartDate) -
      (Number(a.standingsStats) + Number(a.fixturesResults) + Number(a.seasonState) + Number(a.nextActiveRestartDate)) ||
      a.path.localeCompare(b.path)
    )
    .slice(0, 12);

  const topDiagnosticOrSnapshotCandidates = [...diagnosticDirectRows, ...snapshotDirectRows]
    .sort((a, b) =>
      Number(b.standingsStats) + Number(b.fixturesResults) + Number(b.seasonState) + Number(b.nextActiveRestartDate) -
      (Number(a.standingsStats) + Number(a.fixturesResults) + Number(a.seasonState) + Number(a.nextActiveRestartDate)) ||
      a.path.localeCompare(b.path)
    )
    .slice(0, 12);

  return {
    slug: competition.slug,
    label: competition.label,
    family: competition.family,
    auditDoesNotAssertTruth: true,
    strictTruthReadinessStatus,
    missingStrictTruthAreas,

    evidenceCandidateFileCount: evidenceRows.length,
    diagnosticEvidenceCandidateFileCount: diagnosticRows.length,
    snapshotEvidenceCandidateFileCount: snapshotRows.length,
    productionOrCanonicalCandidateFileCount: productionRows.length,

    directProductionOrCanonicalCandidateFileCount: productionDirectRows.length,
    directDiagnosticCandidateFileCount: diagnosticDirectRows.length,
    directSnapshotCandidateFileCount: snapshotDirectRows.length,

    strictProductionDirectAreaCounts: strict,
    diagnosticOrSnapshotDirectAreaCounts: diagnosticOrSnapshot,

    topProductionCandidates,
    topDiagnosticOrSnapshotCandidates
  };
}

const competitionAuditRows = competitions.map(summarizeCompetition);

const strictCompleteRows = competitionAuditRows.filter(
  (row) => row.missingStrictTruthAreas.length === 0 && row.directProductionOrCanonicalCandidateFileCount > 0
);

const strictIncompleteRows = competitionAuditRows.filter(
  (row) => row.missingStrictTruthAreas.length > 0 || row.directProductionOrCanonicalCandidateFileCount === 0
);

const summary = {
  sixLeagueStrictTruthReadinessAuditCompetitionCount: competitionAuditRows.length,
  scannedRootCount: 1,
  scannedFileCount: scanned.length,
  skippedLargeFileCount: skipped.length,

  strictProductionCompleteCandidateCompetitionCount: strictCompleteRows.length,
  strictProductionIncompleteCompetitionCount: strictIncompleteRows.length,

  diagnosticOrSnapshotOnlyCompetitionCount: competitionAuditRows.filter(
    (row) => row.strictTruthReadinessStatus === "diagnostic_or_snapshot_only_not_project_truth"
  ).length,

  productionCandidatePartialTruthIncompleteCompetitionCount: competitionAuditRows.filter(
    (row) => row.strictTruthReadinessStatus === "production_candidate_partial_truth_incomplete"
  ).length,

  productionCandidateAllRequiredAreasPresentNeedsManualValidationCompetitionCount: strictCompleteRows.length,

  mayBuildSixLeagueEvidenceCompletionPlanCount: strictIncompleteRows.length > 0 ? 1 : 0,
  mayBuildSixLeagueManualValidationPlanCount: strictCompleteRows.length > 0 ? 1 : 0,

  auditIsExecutionPermissionNowCount: 0,
  auditIsFetchPermissionNowCount: 0,
  auditIsSearchPermissionNowCount: 0,
  auditIsBroadSearchPermissionNowCount: 0,
  auditIsClassifierPermissionNowCount: 0,
  auditIsCanonicalWritePermissionNowCount: 0,
  auditIsProductionWritePermissionNowCount: 0,
  auditIsTruthAssertionPermissionNowCount: 0,

  mayExecuteFurtherNowCount: 0,
  mayFetchNowCount: 0,
  maySearchNowCount: 0,
  mayBroadSearchNowCount: 0,
  mayClassifySeasonStateNowCount: 0,
  mayWriteCanonicalNowCount: 0,
  mayAssertTruthNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueStrictTruthReadinessAuditTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "audit-football-truth-six-league-truth-readiness-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "strict_no_write_no_fetch_no_provider_search_local_truth_source_separation_audit",
  dryRun: true,
  scope: {
    competitions,
    purpose:
      "Strictly separate production/canonical-like local project data from diagnostics/snapshots for the six controlled reusable-validation leagues."
  },
  policy: {
    localFileScanOnly: true,
    diagnosticsDoNotCountAsProjectTruth: true,
    snapshotsDoNotCountAsProjectTruth: true,
    noFetch: true,
    noProviderSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true,
    auditDoesNotAssertTruth: true
  },
  summary,
  competitionAuditRows,
  strictIncompleteRows,
  skippedFiles: skipped,
  guardrails: [
    { name: "local_file_scan_only", allowed: true, executed: true },
    { name: "diagnostics_do_not_count_as_project_truth", allowed: true, executed: true },
    { name: "snapshots_do_not_count_as_project_truth", allowed: true, executed: true },
    { name: "no_fetch", allowed: false, executed: false },
    { name: "no_provider_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false }
  ],
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
