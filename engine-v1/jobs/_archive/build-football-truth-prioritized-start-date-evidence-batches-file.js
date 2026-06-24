#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const LEDGER_DIR = path.join(DATA_ROOT, "_diagnostics", `season-lane-coverage-ledger-${DATE}`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `prioritized-start-date-evidence-batches-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function readJsonl(file) {
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

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
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

const ledgerRowsPath = path.join(LEDGER_DIR, `season-lane-coverage-ledger-rows-${DATE}.jsonl`);
const startTargetsPath = path.join(LEDGER_DIR, `season-start-date-evidence-targets-${DATE}.jsonl`);

const ledgerRows = readJsonl(ledgerRowsPath);
const startTargets = readJsonl(startTargetsPath);

if (!ledgerRows.length) throw new Error(`Missing or empty ledger rows: ${ledgerRowsPath}`);
if (!startTargets.length) throw new Error(`Missing or empty start-date targets: ${startTargetsPath}`);

const routeConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");
const routeConfig = readJsonSafe(routeConfigPath);
const routeVerifiedSlugs = new Set();
for (const family of routeConfig?.families || []) {
  for (const competition of family.competitions || []) {
    if (competition.competitionSlug) routeVerifiedSlugs.add(competition.competitionSlug);
  }
}

const knownBadPrefixes = new Set([
  "www", "klo", "abc"
]);

const suppressedLowValuePrefixes = new Set([
  "afg", "pak"
]);

const highValuePrefixes = [
  "eng", "esp", "ger", "ita", "fra", "por", "ned", "bel", "aut", "sui",
  "tur", "gre", "sco", "den", "swe", "nor", "fin", "pol", "cze", "cro",
  "ser", "rom", "ukr", "rus", "arg", "bra", "mex", "usa", "jpn", "kor",
  "aus", "chn", "ksa", "qat"
];

const uefaLikePrefixes = new Set([
  "alb","and","arm","aut","aze","bel","bih","blr","bul","cro","cyp","cze","den","eng","esp","est","fin","fra","fro","geo","ger","gib","gre","hun","irl","isl","isr","ita","kaz","kos","lva","lie","ltu","lux","mda","mkd","mlt","mne","ned","nir","nor","pol","por","rom","rus","sco","ser","sui","svk","svn","swe","tur","ukr","wal"
]);

const ledgerBySlug = new Map(ledgerRows.map((row) => [row.competitionSlug, row]));

function isValidLeagueSlug(slug) {
  if (!/^[a-z]{3}\.\d+$/.test(slug)) return false;
  const prefix = slug.split(".")[0];
  if (knownBadPrefixes.has(prefix)) return false;
  if (suppressedLowValuePrefixes.has(prefix)) return false;
  return true;
}

function priorityScore(target) {
  const slug = target.competitionSlug;
  const prefix = slug.split(".")[0];
  const tier = Number(slug.split(".")[1]);
  const ledger = ledgerBySlug.get(slug) || {};
  let score = 0;

  if (routeVerifiedSlugs.has(slug)) score += 10000;
  if (ledger.previousCompletedStandingsSatisfied) score += 8000;
  if (highValuePrefixes.includes(prefix)) score += 5000 - highValuePrefixes.indexOf(prefix) * 10;
  if (uefaLikePrefixes.has(prefix)) score += 2500;
  if (tier === 1) score += 900;
  else if (tier === 2) score += 650;
  else if (tier === 3) score += 450;
  else score += 100;

  if (target.sourceHostHint) score += 500;
  if (target.sourceUrlHint) score += 500;

  return score;
}

const rejected = [];
const validTargets = [];

for (const target of startTargets) {
  const slug = target.competitionSlug;
  const prefix = String(slug || "").split(".")[0];

  if (!isValidLeagueSlug(slug)) {
    rejected.push({
      competitionSlug: slug,
      reason: knownBadPrefixes.has(prefix) ? "known_noise_prefix" :
        suppressedLowValuePrefixes.has(prefix) ? "suppressed_low_value_prefix" :
        "invalid_league_slug_shape",
      originalTarget: target
    });
    continue;
  }

  const ledger = ledgerBySlug.get(slug) || {};
  validTargets.push({
    ...target,
    priorityScore: priorityScore(target),
    previousCompletedStandingsSatisfied: Boolean(ledger.previousCompletedStandingsSatisfied),
    previousCompletedRowCount: ledger.previousCompletedRowCount || 0,
    highValuePrefix: highValuePrefixes.includes(prefix),
    uefaLikePrefix: uefaLikePrefixes.has(prefix),
    tier: Number(slug.split(".")[1]),
    existingSourceHostHint: target.sourceHostHint || null
  });
}

validTargets.sort((a, b) =>
  b.priorityScore - a.priorityScore ||
  String(a.competitionSlug).localeCompare(String(b.competitionSlug))
);

const batchSize = 40;
const batches = [];
for (let i = 0; i < validTargets.length; i += batchSize) {
  const targets = validTargets.slice(i, i + batchSize);
  batches.push({
    batchId: `prioritized_start_date_evidence_batch_${String(batches.length + 1).padStart(3, "0")}`,
    targetCount: targets.length,
    searchExecutedNow: false,
    priorityBand: batches.length === 0 ? "p0_verified_and_high_value" :
      batches.length < 4 ? "p1_high_value_uefa_and_major_global" :
      "p2_remaining_valid_leagues",
    slugs: targets.map((t) => t.competitionSlug),
    targets
  });
}

const byPrefix = {};
for (const target of validTargets) {
  const prefix = target.competitionSlug.split(".")[0];
  byPrefix[prefix] ||= { prefix, targetCount: 0, maxPriorityScore: 0, previousCompletedCount: 0, highValue: highValuePrefixes.includes(prefix), uefaLike: uefaLikePrefixes.has(prefix) };
  byPrefix[prefix].targetCount++;
  byPrefix[prefix].maxPriorityScore = Math.max(byPrefix[prefix].maxPriorityScore, target.priorityScore);
  if (target.previousCompletedStandingsSatisfied) byPrefix[prefix].previousCompletedCount++;
}

const summary = {
  status: "passed",
  runner: "prioritized_start_date_evidence_batches",
  sourceLedgerRowsPath: rel(ledgerRowsPath),
  sourceStartDateTargetsPath: rel(startTargetsPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inputStartDateTargetCount: startTargets.length,
  validStartDateTargetCount: validTargets.length,
  rejectedStartDateTargetCount: rejected.length,
  suppressedLowValuePrefixCount: suppressedLowValuePrefixes.size,
  batchSize,
  batchCount: batches.length,
  firstBatchTargetCount: batches[0]?.targetCount || 0,
  firstBatchSlugs: batches[0]?.slugs || [],
  verifiedPreviousCompletedStartDateTargetCount: validTargets.filter((t) => t.previousCompletedStandingsSatisfied).length,
  highValueStartDateTargetCount: validTargets.filter((t) => t.highValuePrefix).length,
  uefaLikeStartDateTargetCount: validTargets.filter((t) => t.uefaLikePrefix).length,
  recommendedNextLane: "execute_first_prioritized_start_date_evidence_batch_with_search_only_then_classify_official_date_evidence"
};

const outPath = path.join(OUT_DIR, `prioritized-start-date-evidence-batches-${DATE}.json`);
const targetsPath = path.join(OUT_DIR, `prioritized-start-date-evidence-targets-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `rejected-start-date-evidence-targets-${DATE}.jsonl`);
const prefixPath = path.join(OUT_DIR, `prioritized-start-date-evidence-prefix-summary-${DATE}.json`);

fs.writeFileSync(outPath, JSON.stringify({ summary, batches }, null, 2) + "\n", "utf8");
fs.writeFileSync(targetsPath, validTargets.map((t) => JSON.stringify(t)).join("\n") + "\n", "utf8");
fs.writeFileSync(rejectedPath, rejected.map((t) => JSON.stringify(t)).join("\n") + (rejected.length ? "\n" : ""), "utf8");
fs.writeFileSync(prefixPath, JSON.stringify(Object.values(byPrefix).sort((a, b) => b.maxPriorityScore - a.maxPriorityScore || a.prefix.localeCompare(b.prefix)), null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  targetsOutput: rel(targetsPath),
  rejectedOutput: rel(rejectedPath),
  prefixSummaryOutput: rel(prefixPath),
  summary
}, null, 2));
