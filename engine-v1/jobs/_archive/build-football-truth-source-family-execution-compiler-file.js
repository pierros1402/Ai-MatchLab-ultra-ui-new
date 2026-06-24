import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `source-family-execution-compiler-${DATE}`);

const HARD_BLOCKED_DIAGNOSTIC_PATTERNS = [
  {
    reason: "route_competition_mismatch_jpn2_points_to_j1",
    competitionSlug: "jpn.2",
    routeMustNotContain: "/standings/j1/"
  }
];

const FAMILY_RULES = [
  {
    familyId: "jleague_official_html",
    hostPattern: /(^|\.)jleague\.co$/,
    routeIdentityRules: [
      { competitionSlug: "jpn.1", requiredRouteRegex: /\/standings\/j1\/20\d{2}\//, rejectRouteRegex: /\/standings\/j2\// },
      { competitionSlug: "jpn.2", requiredRouteRegex: /\/standings\/j2\/20\d{2}\//, rejectRouteRegex: /\/standings\/j1\// }
    ],
    promotionMode: "central_family_adapter_only",
    requiredGates: ["route_identity", "expected_row_count", "positive_team_signals", "negative_team_signals", "arithmetic", "non_trivial", "season_scope", "duplicate_signature"]
  },
  {
    familyId: "spfl_official_rendered",
    hostPattern: /(^|\.)spfl\.co\.uk$/,
    routeIdentityRules: [
      { competitionSlug: "sco.1", requiredRouteRegex: /\/league\/premiership\/table/ },
      { competitionSlug: "sco.2", requiredRouteRegex: /\/league\/championship\/table/ }
    ],
    promotionMode: "central_family_adapter_only",
    requiredGates: ["route_identity", "expected_row_count", "team_signals", "arithmetic", "season_scope"]
  },
  {
    familyId: "laliga_official_rendered",
    hostPattern: /(^|\.)laliga\.com$/,
    promotionMode: "central_family_adapter_only",
    requiredGates: ["route_identity", "expected_row_count", "team_signals", "arithmetic", "season_scope"]
  },
  {
    familyId: "bundesliga_official_rendered",
    hostPattern: /(^|\.)bundesliga\.com$/,
    promotionMode: "central_family_adapter_only",
    requiredGates: ["route_identity", "expected_row_count", "team_signals", "arithmetic", "season_scope"]
  },
  {
    familyId: "generic_official_html_candidate",
    hostPattern: /.*/,
    promotionMode: "compile_manifest_then_adapter_only",
    requiredGates: ["route_identity", "expected_row_count", "positive_team_signals", "negative_team_signals", "arithmetic", "non_trivial", "season_scope", "duplicate_signature"]
  }
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}
function readJsonl(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function urlText(row) {
  return String(row.finalUrl || row.sourceUrl || row.apiUrl || row.url || "");
}
function familyFor(row) {
  const host = String(row.officialHost || hostFromUrl(urlText(row))).replace(/^www\./, "").toLowerCase();
  return FAMILY_RULES.find((f) => f.hostPattern.test(host)) || FAMILY_RULES[FAMILY_RULES.length - 1];
}
function routeIdentityStatus(row, family) {
  const url = urlText(row);
  const hardBlock = HARD_BLOCKED_DIAGNOSTIC_PATTERNS.find((b) =>
    b.competitionSlug === row.competitionSlug &&
    url.includes(b.routeMustNotContain)
  );
  if (hardBlock) return { passed: false, status: "blocked", reason: hardBlock.reason };

  const rule = (family.routeIdentityRules || []).find((r) => r.competitionSlug === row.competitionSlug);
  if (!rule) return { passed: false, status: "missing_route_identity_rule", reason: "no_competition_specific_route_identity_rule" };
  if (rule.rejectRouteRegex && rule.rejectRouteRegex.test(url)) return { passed: false, status: "blocked", reason: "reject_route_regex_matched" };
  if (rule.requiredRouteRegex && !rule.requiredRouteRegex.test(url)) return { passed: false, status: "blocked", reason: "required_route_regex_not_matched" };
  return { passed: true, status: "passed", reason: "route_identity_passed" };
}
function taskPriority(row) {
  let score = 0;
  if (row.taskType === "acquire_previous_completed_standings") score += 100;
  if (Number(row.tableCount || row.sourceTableCount || 0) > 0) score += 30;
  if (Number(row.trCount || 0) >= 10) score += 20;
  if (Number(row.standingSignalCount || 0) >= 5) score += 10;
  if (String(row.finalUrl || row.sourceUrl || row.apiUrl || "").includes("2025")) score += 10;
  return score;
}

ensureDir(OUT_DIR);

const ledgerRowsPath = latestFile(/season-lane-coverage-ledger-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const lifecycleDuePath = latestFile(/permanent-season-lifecycle-due-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const tableSignalPath = latestFile(/bulk-api-hint-table-signal-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
const htmlTableReviewPath = latestFile(/bulk-api-table-signal-standings-review-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const concurrentTablePath = latestFile(/concurrent-refreshed-host-first-table-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
const apiHintsPath = latestFile(/bulk-api-hint-fetch-wave-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);

const ledgerRows = readJsonl(ledgerRowsPath);
const dueTasks = readJsonl(lifecycleDuePath);
const tableSignals = readJsonl(tableSignalPath);
const htmlReviews = readJsonl(htmlTableReviewPath);
const concurrentTables = readJsonl(concurrentTablePath);
const apiFetchRows = readJsonl(apiHintsPath);

const previousSatisfied = new Set(ledgerRows.filter((r) => r.previousCompletedStandingsSatisfied).map((r) => r.competitionSlug));
const candidateRows = [
  ...tableSignals.map((r) => ({ ...r, candidateSource: "bulk_api_table_signal" })),
  ...htmlReviews.map((r) => ({ ...r, candidateSource: "bulk_api_table_review" })),
  ...concurrentTables.map((r) => ({ ...r, candidateSource: "concurrent_host_first_table" })),
  ...apiFetchRows.filter((r) => Number(r.standingSignalCount || 0) >= 5).map((r) => ({ ...r, candidateSource: "bulk_api_fetch_useful_standing" }))
];

const standingDue = new Set(dueTasks.filter((t) => t.taskType === "acquire_previous_completed_standings").map((t) => t.competitionSlug));

const compiled = [];
for (const row of candidateRows) {
  if (!row.competitionSlug) continue;
  if (!standingDue.has(row.competitionSlug)) continue;
  if (previousSatisfied.has(row.competitionSlug)) continue;

  const family = familyFor(row);
  const routeIdentity = routeIdentityStatus(row, family);

  compiled.push({
    competitionSlug: row.competitionSlug,
    taskType: row.taskType || "acquire_previous_completed_standings",
    candidateSource: row.candidateSource,
    familyId: family.familyId,
    officialHost: row.officialHost || hostFromUrl(urlText(row)),
    sourceUrl: row.sourceUrl || null,
    apiUrl: row.apiUrl || null,
    finalUrl: row.finalUrl || null,
    routeIdentityStatus: routeIdentity.status,
    routeIdentityPassed: routeIdentity.passed,
    routeIdentityReason: routeIdentity.reason,
    promotionMode: family.promotionMode,
    requiredGates: family.requiredGates,
    tableCount: Number(row.tableCount || row.sourceTableCount || 0),
    trCount: Number(row.trCount || 0),
    standingSignalCount: Number(row.standingSignalCount || 0),
    has2025: Boolean(row.has2025 || row.hasSeason2025Signal),
    bestStatus: row.bestStatus || null,
    bestParsedRowCount: row.bestParsedRowCount || null,
    priorityScore: taskPriority(row),
    rawCandidateSha256: sha(JSON.stringify(row))
  });
}

const deduped = new Map();
for (const r of compiled) {
  const key = `${r.familyId}|${r.competitionSlug}|${r.finalUrl || r.sourceUrl || r.apiUrl}`;
  if (!deduped.has(key) || deduped.get(key).priorityScore < r.priorityScore) deduped.set(key, r);
}
const rows = [...deduped.values()].sort((a, b) =>
  Number(b.routeIdentityPassed) - Number(a.routeIdentityPassed) ||
  b.priorityScore - a.priorityScore ||
  a.familyId.localeCompare(b.familyId) ||
  a.competitionSlug.localeCompare(b.competitionSlug)
);

const familyGroups = {};
for (const r of rows) {
  familyGroups[r.familyId] ||= {
    familyId: r.familyId,
    candidateCount: 0,
    routeIdentityPassedCount: 0,
    blockedCount: 0,
    uniqueSlugCount: 0,
    slugs: new Set(),
    promotionMode: r.promotionMode,
    requiredGates: r.requiredGates
  };
  familyGroups[r.familyId].candidateCount++;
  familyGroups[r.familyId].slugs.add(r.competitionSlug);
  if (r.routeIdentityPassed) familyGroups[r.familyId].routeIdentityPassedCount++;
  else familyGroups[r.familyId].blockedCount++;
}
const familyBoard = Object.values(familyGroups).map((g) => ({
  ...g,
  slugs: [...g.slugs].sort(),
  uniqueSlugCount: g.slugs.size,
  executableNow: g.routeIdentityPassedCount > 0 && g.promotionMode.includes("adapter")
})).sort((a, b) => b.routeIdentityPassedCount - a.routeIdentityPassedCount || b.uniqueSlugCount - a.uniqueSlugCount);

const hardBlockedRows = rows.filter((r) => r.routeIdentityStatus === "blocked");
const executableRows = rows.filter((r) => r.routeIdentityPassed);

const summary = {
  status: "passed",
  runner: "source_family_execution_compiler",
  ledgerRowsPath: ledgerRowsPath ? rel(ledgerRowsPath) : null,
  lifecycleDueTasksPath: lifecycleDuePath ? rel(lifecycleDuePath) : null,
  sourceCandidateFiles: {
    tableSignalPath: tableSignalPath ? rel(tableSignalPath) : null,
    htmlTableReviewPath: htmlTableReviewPath ? rel(htmlTableReviewPath) : null,
    concurrentTablePath: concurrentTablePath ? rel(concurrentTablePath) : null,
    apiHintsPath: apiHintsPath ? rel(apiHintsPath) : null
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  duePreviousCompletedTaskSlugCount: standingDue.size,
  alreadySatisfiedPreviousCompletedSlugCount: previousSatisfied.size,
  rawCandidateRowCount: candidateRows.length,
  compiledCandidateCount: rows.length,
  executableRouteIdentityPassedCandidateCount: executableRows.length,
  hardBlockedRouteMismatchCount: hardBlockedRows.length,
  familyCount: familyBoard.length,
  executableFamilyCount: familyBoard.filter((f) => f.executableNow).length,
  topExecutableFamilies: familyBoard.filter((f) => f.executableNow).slice(0, 12).map((f) => ({ familyId: f.familyId, routeIdentityPassedCount: f.routeIdentityPassedCount, slugs: f.slugs })),
  hardBlockedExamples: hardBlockedRows.slice(0, 20).map((r) => ({ competitionSlug: r.competitionSlug, familyId: r.familyId, reason: r.routeIdentityReason, finalUrl: r.finalUrl || r.sourceUrl || r.apiUrl })),
  recommendedNextLane: "execute_only_route_identity_passed_source_family_adapters_not_candidate_reviews"
};

const outPath = path.join(OUT_DIR, `source-family-execution-compiler-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `source-family-execution-compiler-rows-${DATE}.jsonl`);
const familyBoardPath = path.join(OUT_DIR, `source-family-execution-family-board-${DATE}.jsonl`);
const executableRowsPath = path.join(OUT_DIR, `source-family-executable-rows-${DATE}.jsonl`);
const blockedRowsPath = path.join(OUT_DIR, `source-family-blocked-route-mismatch-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, familyBoard, hardBlockedRows: hardBlockedRows.slice(0, 80), executableRows: executableRows.slice(0, 120) }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
fs.writeFileSync(familyBoardPath, familyBoard.map((r) => JSON.stringify(r)).join("\n") + (familyBoard.length ? "\n" : ""), "utf8");
fs.writeFileSync(executableRowsPath, executableRows.map((r) => JSON.stringify(r)).join("\n") + (executableRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(blockedRowsPath, hardBlockedRows.map((r) => JSON.stringify(r)).join("\n") + (hardBlockedRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), familyBoardOutput: rel(familyBoardPath), executableRowsOutput: rel(executableRowsPath), blockedRowsOutput: rel(blockedRowsPath), summary }, null, 2));
