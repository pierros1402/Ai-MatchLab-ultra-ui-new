#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-bulk-yield-runner-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");

const forbiddenFlags = [
  "--allow-fetch",
  "--allow-search",
  "--allow-broad-search",
  "--allow-canonical-write",
  "--allow-production-write",
  "--allow-write",
  "--write-canonical",
  "--write-production",
  "--promote",
  "--production"
];

const presentForbiddenFlags = forbiddenFlags.filter((flag) => args.has(flag));
if (presentForbiddenFlags.length) {
  throw new Error(`Refusing unsafe flags: ${presentForbiddenFlags.join(", ")}`);
}

const families = [
  {
    family: "laliga",
    slugs: ["esp.1", "esp.2"],
    keywords: ["laliga", "esp.1", "esp.2"],
    knownJobs: [
      "engine-v1/jobs/build-football-truth-laliga-full-table-canonical-candidate-proposal-file.js",
      "engine-v1/jobs/run-football-truth-laliga-full-table-candidate-quality-gate-file.js",
      "engine-v1/jobs/run-football-truth-laliga-full-table-extraction-expansion-runner-file.js"
    ]
  },
  {
    family: "bundesliga",
    slugs: ["ger.1", "ger.2"],
    keywords: ["bundesliga", "ger.1", "ger.2"],
    knownJobs: [
      "engine-v1/jobs/build-football-truth-bundesliga-family-local-contract-mapper-file.js",
      "engine-v1/jobs/build-football-truth-bundesliga-exact-route-quality-gate-and-canonical-write-plan-file.js",
      "engine-v1/jobs/run-football-truth-bundesliga-canonical-candidate-write-file.js"
    ]
  },
  {
    family: "norway_ntf",
    slugs: ["nor.1", "nor.2"],
    keywords: ["norway-ntf", "norway_ntf", "nor.1", "nor.2", "eliteserien", "obos"],
    knownJobs: [
      "engine-v1/jobs/build-football-truth-norway-ntf-canonical-candidate-proposal-file.js",
      "engine-v1/jobs/run-football-truth-norway-ntf-standing-candidate-quality-gate-file.js",
      "engine-v1/jobs/run-football-truth-norway-ntf-controlled-html-table-parser-runner-file.js"
    ]
  },
  {
    family: "sportomedia_sef",
    slugs: ["swe.1", "swe.2"],
    keywords: ["sportomedia", "sef", "swe.1", "swe.2", "allsvenskan", "superettan"],
    knownJobs: [
      "engine-v1/jobs/build-sportomedia-normalized-standings-evidence-file.js",
      "engine-v1/jobs/build-uefa-sportomedia-normalized-rows-file.js",
      "engine-v1/jobs/build-football-truth-controlled-sportomedia-standings-extraction-quality-gate-file.js",
      "engine-v1/jobs/run-football-truth-controlled-sportomedia-standings-extraction-runner-file.js"
    ]
  },
  {
    family: "torneopal",
    slugs: ["fin.1", "fin.2", "por.taca.portugal"],
    keywords: ["torneopal", "fin.1", "fin.2", "por.taca.portugal", "veikkausliiga"],
    knownJobs: [
      "engine-v1/jobs/build-uefa-torneopal-normalized-rows-file.js"
    ]
  },
  {
    family: "ksi",
    slugs: ["isl.1"],
    keywords: ["ksi", "isl.1", "iceland"],
    knownJobs: [
      "engine-v1/jobs/build-uefa-ksi-tournament-normalized-season-state-file.js"
    ]
  },
  {
    family: "loi_ajax",
    slugs: ["irl.1", "irl.2"],
    keywords: ["loi", "ajax", "irl.1", "irl.2", "ireland"],
    knownJobs: [
      "engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js"
    ]
  },
  {
    family: "spfl_opta",
    slugs: ["sco.1", "sco.2"],
    keywords: ["spfl", "opta", "sco.1", "sco.2", "scotland"],
    knownJobs: [
      "engine-v1/jobs/build-uefa-spfl-opta-normalized-rows-file.js",
      "engine-v1/jobs/build-spfl-official-html-standings-evidence-file.js"
    ]
  },
  {
    family: "cfa_cyprus_html",
    slugs: ["cyp.1"],
    keywords: ["cfa", "cyprus", "cyp.1"],
    knownJobs: []
  }
];

const expectedMinRows = new Map([
  ["esp.1", 20], ["esp.2", 20],
  ["ger.1", 18], ["ger.2", 18],
  ["nor.1", 16], ["nor.2", 16],
  ["swe.1", 16], ["swe.2", 16],
  ["fin.1", 12], ["fin.2", 10],
  ["isl.1", 12],
  ["irl.1", 10], ["irl.2", 10],
  ["sco.1", 12], ["sco.2", 10],
  ["cyp.1", 14]
]);

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function safeReadJson(filePath) {
  const text = safeReadText(filePath);
  try {
    return { text, json: JSON.parse(text), error: null };
  } catch (error) {
    return { text, json: null, error: String(error?.message || error) };
  }
}

function normKey(key) {
  return String(key).toLowerCase().replaceAll("_", "").replaceAll("-", "").replaceAll(" ", "");
}

function lowerKeyMap(obj) {
  const map = new Map();
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return map;
  for (const [key, value] of Object.entries(obj)) map.set(normKey(key), value);
  return map;
}

function numericValue(obj, names) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const wanted = names.map(normKey);
  const direct = lowerKeyMap(obj);
  for (const name of wanted) {
    if (!direct.has(name)) continue;
    const value = direct.get(name);
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = numericValue(value, names);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function stringValue(obj, names) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const wanted = names.map(normKey);
  const direct = lowerKeyMap(obj);
  for (const name of wanted) {
    if (!direct.has(name)) continue;
    const value = direct.get(name);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = stringValue(value, ["name", "displayName", "teamName", "clubName", "shortName"]);
      if (nested) return nested;
    }
  }
  return null;
}

function isStandingsLikeRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const team = stringValue(row, ["team", "teamName", "club", "clubName", "name", "displayName", "team_name", "squad"]);
  const p = numericValue(row, ["played", "pld", "matchesPlayed", "gamesPlayed", "matches", "mp"]);
  const w = numericValue(row, ["won", "wins", "w"]);
  const d = numericValue(row, ["drawn", "draws", "d"]);
  const l = numericValue(row, ["lost", "losses", "l"]);
  const pts = numericValue(row, ["points", "pts", "point"]);
  const rank = numericValue(row, ["rank", "position", "pos", "place"]);
  const gf = numericValue(row, ["goalsFor", "gf", "goals_for"]);
  const ga = numericValue(row, ["goalsAgainst", "ga", "goals_against"]);
  const gd = numericValue(row, ["goalDifference", "gd", "goal_difference"]);
  const numericCount = [p, w, d, l, pts, rank, gf, ga, gd].filter((value) => value !== null).length;
  return Boolean(team) && (numericCount >= 4 || (rank !== null && pts !== null && numericCount >= 3));
}

function extractRows(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    const directRows = node.filter(isStandingsLikeRow);
    if (directRows.length >= 2) {
      for (const row of directRows) out.push(row);
      return out;
    }
    for (const item of node) extractRows(item, out);
    return out;
  }
  if (isStandingsLikeRow(node)) {
    out.push(node);
    return out;
  }
  for (const value of Object.values(node)) extractRows(value, out);
  return out;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const team = stringValue(row, ["team", "teamName", "club", "clubName", "name", "displayName", "team_name"]) || JSON.stringify(row).slice(0, 100);
    const rank = numericValue(row, ["rank", "position", "pos", "place"]);
    const played = numericValue(row, ["played", "pld", "matchesPlayed", "gamesPlayed", "matches", "mp"]);
    const points = numericValue(row, ["points", "pts", "point"]);
    map.set(`${team}|${rank}|${played}|${points}`, row);
  }
  return [...map.values()];
}

function arithmeticAssessment(rows) {
  let testedRows = 0;
  let passedRows = 0;
  let failedRows = 0;
  const failures = [];

  for (const row of rows) {
    const team = stringValue(row, ["team", "teamName", "club", "clubName", "name", "displayName", "team_name"]) || "unknown";
    const p = numericValue(row, ["played", "pld", "matchesPlayed", "gamesPlayed", "matches", "mp"]);
    const w = numericValue(row, ["won", "wins", "w"]);
    const d = numericValue(row, ["drawn", "draws", "d"]);
    const l = numericValue(row, ["lost", "losses", "l"]);
    const pts = numericValue(row, ["points", "pts", "point"]);

    let rowTested = false;
    let rowFailed = false;

    if ([p, w, d, l].every((value) => value !== null)) {
      rowTested = true;
      if (p !== w + d + l) {
        rowFailed = true;
        failures.push({ team, check: "played_equals_wins_draws_losses", p, w, d, l });
      }
    }

    if ([pts, w, d].every((value) => value !== null)) {
      rowTested = true;
      const expected = (w * 3) + d;
      if (pts !== expected) {
        rowFailed = true;
        failures.push({ team, check: "points_equals_3w_plus_d", pts, expected, w, d });
      }
    }

    if (rowTested) {
      testedRows += 1;
      if (rowFailed) failedRows += 1;
      else passedRows += 1;
    }
  }

  return {
    status: testedRows === 0 ? "not_assessed" : failedRows === 0 ? "passed" : "failed",
    testedRows,
    passedRows,
    failedRows,
    failureSample: failures.slice(0, 10)
  };
}

function hasCurrentSeasonEvidence(text, rel) {
  const hay = `${rel}\n${text.slice(0, 250000)}`;
  return /active_current_season|currentSeason|current_season|current-season|2026[^0-9]|2025[\/-]26|2025\/2026|2025-2026/i.test(hay);
}

function slugsInText(text, slugs) {
  const lower = text.toLowerCase();
  return slugs.filter((slug) => lower.includes(slug.toLowerCase()));
}

function rowSlug(row, slugs) {
  const text = JSON.stringify(row).toLowerCase();
  return slugs.find((slug) => text.includes(slug.toLowerCase())) || null;
}

function classifyJob(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    return { relPath, exists: false, status: "missing", executableNow: false, requiredArgs: [] };
  }

  const text = safeReadText(abs);
  const requiredArgs = [...new Set([...text.matchAll(/(?:Missing required|missing|required)\s+(--[a-z0-9-]+)/gi)].map((m) => m[1]))];
  const mentionsInput = /--input\b|args\.input|const input|getArg\(["']--input["']\)/.test(text);
  const mentionsOutput = /--output\b|args\.output|const output|getArg\(["']--output["']\)/.test(text);
  const mentionsScriptFetchOut = /--script-fetch-out\b|scriptFetchOut/.test(text);
  const mentionsFetch = /fetch\(|https?:\/\//.test(text);
  const mentionsWrite = /writeFileSync|fs\.writeFile|canonical|production/i.test(text);

  const inferredRequiredArgs = new Set(requiredArgs);
  if (mentionsInput) inferredRequiredArgs.add("--input");
  if (mentionsOutput) inferredRequiredArgs.add("--output");
  if (mentionsScriptFetchOut) inferredRequiredArgs.add("--script-fetch-out");

  const executableNow = false;
  const status = "not_executed_requires_explicit_contract_invocation";

  return {
    relPath,
    exists: true,
    status,
    executableNow,
    requiredArgs: [...inferredRequiredArgs].sort(),
    mentionsFetch,
    mentionsWrite,
    reason: "bulk runner refuses blind child-process execution; use only existing artifacts or a future explicit per-family invocation contract"
  };
}

const scanRoots = [
  path.join(ROOT, "data", "football-truth", "_diagnostics"),
  path.join(ROOT, "data", "football-truth", "_state", "canonical-standings-candidates")
];

const allJsonFiles = scanRoots.flatMap((dir) => walkFiles(dir));
const familyReports = [];
const jobSurface = [];

for (const family of families) {
  const familyJobSurface = family.knownJobs.map(classifyJob);
  jobSurface.push({ family: family.family, jobs: familyJobSurface });

  const candidatesBySlug = Object.fromEntries(family.slugs.map((slug) => [slug, []]));

  for (const filePath of allJsonFiles) {
    const rel = path.relative(ROOT, filePath).replaceAll("\\", "/");
    const relLower = rel.toLowerCase();
    const pathMatches = family.keywords.some((keyword) => relLower.includes(String(keyword).toLowerCase()));
    if (!pathMatches) continue;

    const read = safeReadJson(filePath);
    if (!read.json) continue;

    const extractedRows = dedupeRows(extractRows(read.json));
    if (extractedRows.length === 0) continue;

    const fileTextForSlug = `${relLower}\n${read.text.toLowerCase().slice(0, 250000)}`;
    const slugHits = slugsInText(fileTextForSlug, family.slugs);
    const fileCurrentEvidence = hasCurrentSeasonEvidence(read.text, rel);
    const stat = fs.statSync(filePath);

    for (const slug of family.slugs) {
      let rowsForSlug = extractedRows.filter((row) => rowSlug(row, [slug]) === slug);

      if (rowsForSlug.length === 0 && slugHits.length === 1 && slugHits[0] === slug) {
        rowsForSlug = extractedRows;
      }

      if (rowsForSlug.length === 0) continue;

      rowsForSlug = dedupeRows(rowsForSlug);
      const arithmetic = arithmeticAssessment(rowsForSlug);
      const expectedMinRows = expectedMinRowsFor(slug);
      const rowCountMeetsExpected = rowsForSlug.length >= expectedMinRows;
      const canonicalCandidateEligibility = rowCountMeetsExpected && fileCurrentEvidence && arithmetic.status !== "failed";

      candidatesBySlug[slug].push({
        rel,
        sha256: sha256(read.text),
        bytes: Buffer.byteLength(read.text, "utf8"),
        mtime: stat.mtime.toISOString(),
        rowCount: rowsForSlug.length,
        expectedMinRows,
        rowCountMeetsExpected,
        currentSeasonEvidence: fileCurrentEvidence,
        arithmetic,
        canonicalCandidateEligibility,
        score:
          (canonicalCandidateEligibility ? 100000 : 0) +
          (fileCurrentEvidence ? 10000 : 0) +
          (arithmetic.status === "passed" ? 1000 : arithmetic.status === "not_assessed" ? 250 : 0) +
          Math.min(rowsForSlug.length, 100)
      });
    }
  }

  const byCompetition = {};
  for (const slug of family.slugs) {
    const candidates = candidatesBySlug[slug].sort((a, b) => b.score - a.score || b.rowCount - a.rowCount || b.mtime.localeCompare(a.mtime));
    const best = candidates[0] || null;
    byCompetition[slug] = {
      candidateArtifactCount: candidates.length,
      bestArtifact: best ? {
        rel: best.rel,
        sha256: best.sha256,
        mtime: best.mtime,
        rowCount: best.rowCount,
        expectedMinRows: best.expectedMinRows,
        rowCountMeetsExpected: best.rowCountMeetsExpected,
        currentSeasonEvidence: best.currentSeasonEvidence,
        arithmeticStatus: best.arithmetic.status,
        arithmeticFailedRows: best.arithmetic.failedRows,
        canonicalCandidateEligibility: best.canonicalCandidateEligibility
      } : null,
      topArtifacts: candidates.slice(0, 5).map((candidate) => ({
        rel: candidate.rel,
        rowCount: candidate.rowCount,
        currentSeasonEvidence: candidate.currentSeasonEvidence,
        arithmeticStatus: candidate.arithmetic.status,
        canonicalCandidateEligibility: candidate.canonicalCandidateEligibility
      })),
      rowCount: best?.rowCount || 0,
      expectedMinRows: expectedMinRowsFor(slug),
      currentSeasonEvidence: Boolean(best?.currentSeasonEvidence),
      currentSeasonStandingsRowsExtracted: Boolean(best?.currentSeasonEvidence && best?.rowCountMeetsExpected),
      arithmeticReconciliation: best?.arithmetic || { status: "not_assessed", testedRows: 0, passedRows: 0, failedRows: 0, failureSample: [] },
      canonicalCandidateEligibility: Boolean(best?.canonicalCandidateEligibility),
      status:
        best?.canonicalCandidateEligibility ? "canonical_candidate_eligible" :
        best && !best.currentSeasonEvidence ? "blocked_currentness_not_proven" :
        best && best.arithmetic.status === "failed" ? "review_required_arithmetic_failed" :
        best ? "review_required" :
        "no_rows_extracted"
    };
  }

  const values = Object.values(byCompetition);
  familyReports.push({
    family: family.family,
    slugs: family.slugs,
    knownJobCount: family.knownJobs.length,
    existingKnownJobCount: familyJobSurface.filter((job) => job.exists).length,
    blindExecutionBlockedJobCount: familyJobSurface.filter((job) => job.exists && !job.executableNow).length,
    extractedSlugCount: values.filter((report) => report.rowCount > 0).length,
    currentSeasonExtractedSlugCount: values.filter((report) => report.currentSeasonStandingsRowsExtracted).length,
    canonicalCandidateEligibleSlugCount: values.filter((report) => report.canonicalCandidateEligibility).length,
    byCompetition
  });
}

function expectedMinRowsFor(slug) {
  return expectedMinRows.get(slug) || 8;
}

const flatReports = familyReports.flatMap((family) => Object.entries(family.byCompetition).map(([slug, report]) => ({
  family: family.family,
  slug,
  ...report
})));

const summary = {
  status: "passed",
  runner: "existing_reusable_family_bulk_yield_runner",
  safetyMode: "no_blind_child_process_execution",
  allowExecuteFlagPresent: allowExecute,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  childJobExecutedNowCount: 0,
  childJobFailedNowCount: 0,
  familyCount: families.length,
  competitionCount: families.reduce((sum, family) => sum + family.slugs.length, 0),
  knownJobCount: families.reduce((sum, family) => sum + family.knownJobs.length, 0),
  existingKnownJobCount: jobSurface.flatMap((family) => family.jobs).filter((job) => job.exists).length,
  blindExecutionBlockedJobCount: jobSurface.flatMap((family) => family.jobs).filter((job) => job.exists && !job.executableNow).length,
  slugWithRowsCount: flatReports.filter((report) => report.rowCount > 0).length,
  currentSeasonExtractedSlugCount: flatReports.filter((report) => report.currentSeasonStandingsRowsExtracted).length,
  canonicalCandidateEligibleSlugCount: flatReports.filter((report) => report.canonicalCandidateEligibility).length,
  reviewRequiredArithmeticFailedCount: flatReports.filter((report) => report.status === "review_required_arithmetic_failed").length,
  blockedCurrentnessNotProvenCount: flatReports.filter((report) => report.status === "blocked_currentness_not_proven").length,
  noRowsExtractedCount: flatReports.filter((report) => report.status === "no_rows_extracted").length,
  recommendedNextLane: "build_explicit_invocation_contracts_for_existing_reusable_families_no_generic_search_no_single_league_probe"
};

const output = {
  summary,
  jobSurface,
  families: familyReports
};

const outPath = path.join(OUT_DIR, `existing-reusable-family-bulk-yield-runner-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `existing-reusable-family-bulk-yield-summary-${DATE}.json`);

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
fs.writeFileSync(compactPath, JSON.stringify({
  summary,
  families: familyReports.map((family) => ({
    family: family.family,
    extractedSlugCount: family.extractedSlugCount,
    currentSeasonExtractedSlugCount: family.currentSeasonExtractedSlugCount,
    canonicalCandidateEligibleSlugCount: family.canonicalCandidateEligibleSlugCount,
    byCompetition: Object.fromEntries(Object.entries(family.byCompetition).map(([slug, report]) => [slug, {
      rowCount: report.rowCount,
      expectedMinRows: report.expectedMinRows,
      currentSeasonEvidence: report.currentSeasonEvidence,
      currentSeasonStandingsRowsExtracted: report.currentSeasonStandingsRowsExtracted,
      arithmeticStatus: report.arithmeticReconciliation.status,
      arithmeticFailedRows: report.arithmeticReconciliation.failedRows,
      canonicalCandidateEligibility: report.canonicalCandidateEligibility,
      status: report.status,
      bestArtifact: report.bestArtifact?.rel || null
    }]))
  }))
}, null, 2), "utf8");

console.log(JSON.stringify({
  output: path.relative(ROOT, outPath),
  compactOutput: path.relative(ROOT, compactPath),
  summary
}, null, 2));
