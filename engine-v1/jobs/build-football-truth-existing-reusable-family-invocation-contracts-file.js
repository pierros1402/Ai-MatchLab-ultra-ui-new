#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-invocation-contracts-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const families = [
  {
    family: "laliga",
    slugs: ["esp.1", "esp.2"],
    keywords: ["laliga", "esp.1", "esp.2"],
    jobs: [
      "engine-v1/jobs/build-football-truth-laliga-full-table-canonical-candidate-proposal-file.js",
      "engine-v1/jobs/run-football-truth-laliga-full-table-candidate-quality-gate-file.js",
      "engine-v1/jobs/run-football-truth-laliga-full-table-extraction-expansion-runner-file.js"
    ]
  },
  {
    family: "bundesliga",
    slugs: ["ger.1", "ger.2"],
    keywords: ["bundesliga", "ger.1", "ger.2"],
    jobs: [
      "engine-v1/jobs/build-football-truth-bundesliga-family-local-contract-mapper-file.js",
      "engine-v1/jobs/build-football-truth-bundesliga-exact-route-quality-gate-and-canonical-write-plan-file.js",
      "engine-v1/jobs/run-football-truth-bundesliga-canonical-candidate-write-file.js"
    ]
  },
  {
    family: "norway_ntf",
    slugs: ["nor.1", "nor.2"],
    keywords: ["norway-ntf", "norway_ntf", "nor.1", "nor.2", "eliteserien", "obos"],
    jobs: [
      "engine-v1/jobs/build-football-truth-norway-ntf-canonical-candidate-proposal-file.js",
      "engine-v1/jobs/run-football-truth-norway-ntf-standing-candidate-quality-gate-file.js",
      "engine-v1/jobs/run-football-truth-norway-ntf-controlled-html-table-parser-runner-file.js"
    ]
  },
  {
    family: "sportomedia_sef",
    slugs: ["swe.1", "swe.2"],
    keywords: ["sportomedia", "sef", "swe.1", "swe.2", "allsvenskan", "superettan"],
    jobs: [
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
    jobs: [
      "engine-v1/jobs/build-uefa-torneopal-normalized-rows-file.js"
    ]
  },
  {
    family: "ksi",
    slugs: ["isl.1"],
    keywords: ["ksi", "isl.1", "iceland"],
    jobs: [
      "engine-v1/jobs/build-uefa-ksi-tournament-normalized-season-state-file.js"
    ]
  },
  {
    family: "loi_ajax",
    slugs: ["irl.1", "irl.2"],
    keywords: ["loi", "ajax", "irl.1", "irl.2", "ireland"],
    jobs: [
      "engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js"
    ]
  },
  {
    family: "spfl_opta",
    slugs: ["sco.1", "sco.2"],
    keywords: ["spfl", "opta", "sco.1", "sco.2", "scotland"],
    jobs: [
      "engine-v1/jobs/build-uefa-spfl-opta-normalized-rows-file.js",
      "engine-v1/jobs/build-spfl-official-html-standings-evidence-file.js"
    ]
  },
  {
    family: "cfa_cyprus_html",
    slugs: ["cyp.1"],
    keywords: ["cfa", "cyprus", "cyp.1"],
    jobs: []
  }
];

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(safeReadText(filePath));
  } catch {
    return null;
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function relPath(absPath) {
  return path.relative(ROOT, absPath).replaceAll("\\", "/");
}

function extractFlags(sourceText) {
  return [...new Set([...sourceText.matchAll(/--[a-z0-9][a-z0-9-]*/gi)].map((m) => m[0]))].sort();
}

function extractRequiredFlags(sourceText) {
  const flags = new Set();

  for (const m of sourceText.matchAll(/(?:Missing required|missing|required)\s+(--[a-z0-9-]+)/gi)) {
    flags.add(m[1]);
  }

  const common = [
    ["--input", /\bargs\.input\b|\bconst\s+input\b|getArg\(["']--input["']\)|--input\b/i],
    ["--output", /\bargs\.output\b|\bconst\s+output\b|getArg\(["']--output["']\)|--output\b/i],
    ["--script-fetch-out", /\bscriptFetchOut\b|--script-fetch-out\b/i],
    ["--targets", /\bargs\.targets\b|getArg\(["']--targets["']\)|--targets\b/i]
  ];

  for (const [flag, regex] of common) {
    if (regex.test(sourceText)) flags.add(flag);
  }

  return [...flags].sort();
}

function hasUnsafeExecutionSurface(sourceText) {
  return {
    mentionsFetch: /\bfetch\s*\(|\bcurl\b|https?:\/\//i.test(sourceText),
    mentionsSearch: /searchExecutedNow|allow-search|broad-search|system1|search query/i.test(sourceText),
    mentionsCanonicalWrite: /canonical.*write|write.*canonical|canonical-standings-candidates/i.test(sourceText),
    mentionsProductionWrite: /production.*write|write.*production|truth.*write/i.test(sourceText),
    mentionsAllowFlags: /allow-fetch|allow-search|allow-canonical-write|allow-production-write|allow-write/i.test(sourceText)
  };
}

function scoreArtifact(filePath, family, purpose) {
  const rel = relPath(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();
  const text = safeReadText(filePath);
  const lower = `${rel}\n${text.slice(0, 100000).toLowerCase()}`;

  let score = 0;
  for (const keyword of family.keywords) {
    if (lower.includes(String(keyword).toLowerCase())) score += 25;
  }
  for (const slug of family.slugs) {
    if (lower.includes(slug.toLowerCase())) score += 40;
  }

  if (purpose === "--input") {
    if (/candidate|proposal|standings|normalized|evidence|parser|quality|contract|mapping|snapshot|selectedrows/i.test(lower)) score += 25;
    if (/canonical-candidate|standings-candidates|normalized-rows|standing-candidate|table-parser|payload|extraction/i.test(lower)) score += 35;
  }

  if (purpose === "--script-fetch-out") {
    if (/script-fetch|widget|asset|runtime|main\.js|bundle/i.test(lower)) score += 80;
  }

  if (purpose === "--targets") {
    if (/target|input|plan|manifest/i.test(lower)) score += 50;
  }

  if (name.endsWith(".json")) score += 8;
  if (rel.includes("_diagnostics")) score += 5;
  if (rel.includes("_state/canonical-standings-candidates")) score += 15;

  const stat = fs.statSync(filePath);
  const recentBoost = Math.max(0, Math.min(25, Math.floor((stat.mtimeMs - new Date("2026-06-01").getTime()) / (1000 * 60 * 60 * 24))));
  score += recentBoost;

  return { score, text, stat };
}

function findArtifactsForFlag(flag, family, allFiles) {
  if (flag === "--output") {
    return [{
      rel: `data/football-truth/_diagnostics/existing-reusable-family-contract-execution-${DATE}/${family.family}-output.json`,
      role: "planned_output",
      score: 999999,
      exists: false
    }];
  }

  const allowedExt = new Set([".json", ".txt", ".html", ".htm", ".ndjson"]);
  const candidates = [];

  for (const filePath of allFiles) {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExt.has(ext)) continue;

    const rel = relPath(filePath);
    if (!rel.startsWith("data/football-truth/")) continue;

    const scored = scoreArtifact(filePath, family, flag);
    if (scored.score < 50) continue;

    candidates.push({
      rel,
      sha256: sha256(scored.text),
      bytes: Buffer.byteLength(scored.text, "utf8"),
      mtime: scored.stat.mtime.toISOString(),
      score: scored.score,
      exists: true
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || b.mtime.localeCompare(a.mtime))
    .slice(0, 8);
}

function loadBulkYield() {
  const dir = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-bulk-yield-runner-${DATE}`);
  const file = path.join(dir, `existing-reusable-family-bulk-yield-summary-${DATE}.json`);
  const json = safeReadJson(file);
  return json ? { rel: relPath(file), json } : { rel: null, json: null };
}

const allFiles = [
  ...walkFiles(path.join(ROOT, "data", "football-truth", "_diagnostics")),
  ...walkFiles(path.join(ROOT, "data", "football-truth", "_state"))
];

const bulkYield = loadBulkYield();
const contractFamilies = [];

for (const family of families) {
  const jobContracts = [];

  for (const jobRel of family.jobs) {
    const abs = path.join(ROOT, jobRel);
    const exists = fs.existsSync(abs);
    const sourceText = exists ? safeReadText(abs) : "";
    const allFlags = exists ? extractFlags(sourceText) : [];
    const requiredFlags = exists ? extractRequiredFlags(sourceText) : [];
    const unsafeSurface = exists ? hasUnsafeExecutionSurface(sourceText) : {
      mentionsFetch: false,
      mentionsSearch: false,
      mentionsCanonicalWrite: false,
      mentionsProductionWrite: false,
      mentionsAllowFlags: false
    };

    const flagBindings = {};
    for (const flag of requiredFlags) {
      flagBindings[flag] = findArtifactsForFlag(flag, family, allFiles);
    }

    const unresolvedRequiredFlags = requiredFlags.filter((flag) => (flagBindings[flag] || []).length === 0);
    const allRequiredFlagsBound = unresolvedRequiredFlags.length === 0;

    const directExecutionAllowedByContract =
      exists &&
      allRequiredFlagsBound &&
      !unsafeSurface.mentionsSearch &&
      !unsafeSurface.mentionsProductionWrite &&
      !unsafeSurface.mentionsCanonicalWrite &&
      !unsafeSurface.mentionsFetch;

    jobContracts.push({
      job: jobRel,
      exists,
      allFlags,
      requiredFlags,
      unresolvedRequiredFlags,
      allRequiredFlagsBound,
      unsafeSurface,
      directExecutionAllowedByContract,
      status:
        !exists ? "missing_job" :
        !allRequiredFlagsBound ? "blocked_missing_required_bindings" :
        unsafeSurface.mentionsSearch ? "blocked_search_surface" :
        unsafeSurface.mentionsProductionWrite ? "blocked_production_write_surface" :
        unsafeSurface.mentionsCanonicalWrite ? "blocked_canonical_write_surface" :
        unsafeSurface.mentionsFetch ? "blocked_fetch_surface" :
        "ready_for_no_fetch_no_search_no_write_contract_execution",
      flagBindings
    });
  }

  const yieldFamily = bulkYield.json?.families?.find((x) => x.family === family.family) || null;
  contractFamilies.push({
    family: family.family,
    slugs: family.slugs,
    yieldSnapshot: yieldFamily ? {
      extractedSlugCount: yieldFamily.extractedSlugCount,
      currentSeasonExtractedSlugCount: yieldFamily.currentSeasonExtractedSlugCount,
      canonicalCandidateEligibleSlugCount: yieldFamily.canonicalCandidateEligibleSlugCount,
      byCompetition: yieldFamily.byCompetition
    } : null,
    jobCount: family.jobs.length,
    existingJobCount: jobContracts.filter((job) => job.exists).length,
    readyNoFetchNoSearchNoWriteContractCount: jobContracts.filter((job) => job.status === "ready_for_no_fetch_no_search_no_write_contract_execution").length,
    blockedMissingBindingsCount: jobContracts.filter((job) => job.status === "blocked_missing_required_bindings").length,
    blockedUnsafeSurfaceCount: jobContracts.filter((job) => job.status.startsWith("blocked_") && job.status !== "blocked_missing_required_bindings").length,
    jobs: jobContracts
  });
}

const flatJobs = contractFamilies.flatMap((family) => family.jobs.map((job) => ({ family: family.family, ...job })));

const summary = {
  status: "passed",
  board: "existing_reusable_family_explicit_invocation_contracts",
  sourceBulkYield: bulkYield.rel,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  childJobExecutedNowCount: 0,
  familyCount: families.length,
  competitionCount: families.reduce((sum, family) => sum + family.slugs.length, 0),
  jobContractCount: flatJobs.length,
  existingJobContractCount: flatJobs.filter((job) => job.exists).length,
  readyNoFetchNoSearchNoWriteContractCount: flatJobs.filter((job) => job.status === "ready_for_no_fetch_no_search_no_write_contract_execution").length,
  blockedMissingBindingsCount: flatJobs.filter((job) => job.status === "blocked_missing_required_bindings").length,
  blockedSearchSurfaceCount: flatJobs.filter((job) => job.status === "blocked_search_surface").length,
  blockedFetchSurfaceCount: flatJobs.filter((job) => job.status === "blocked_fetch_surface").length,
  blockedCanonicalWriteSurfaceCount: flatJobs.filter((job) => job.status === "blocked_canonical_write_surface").length,
  blockedProductionWriteSurfaceCount: flatJobs.filter((job) => job.status === "blocked_production_write_surface").length,
  recommendedNextLane: flatJobs.filter((job) => job.status === "ready_for_no_fetch_no_search_no_write_contract_execution").length > 0 ? "execute_ready_no_fetch_no_search_no_write_contracts_in_bulk_then_recompute_yield" : "no_ready_contracts_build_artifact_only_blocked_surface_interpreter_for_existing_reusable_families"
};

const output = {
  summary,
  families: contractFamilies
};

const outPath = path.join(OUT_DIR, `existing-reusable-family-invocation-contracts-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `existing-reusable-family-invocation-contracts-summary-${DATE}.json`);

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
fs.writeFileSync(compactPath, JSON.stringify({
  summary,
  families: contractFamilies.map((family) => ({
    family: family.family,
    slugs: family.slugs,
    yieldSnapshot: family.yieldSnapshot ? {
      extractedSlugCount: family.yieldSnapshot.extractedSlugCount,
      currentSeasonExtractedSlugCount: family.yieldSnapshot.currentSeasonExtractedSlugCount,
      canonicalCandidateEligibleSlugCount: family.yieldSnapshot.canonicalCandidateEligibleSlugCount
    } : null,
    jobCount: family.jobCount,
    existingJobCount: family.existingJobCount,
    readyNoFetchNoSearchNoWriteContractCount: family.readyNoFetchNoSearchNoWriteContractCount,
    blockedMissingBindingsCount: family.blockedMissingBindingsCount,
    blockedUnsafeSurfaceCount: family.blockedUnsafeSurfaceCount,
    jobs: family.jobs.map((job) => ({
      job: job.job,
      status: job.status,
      requiredFlags: job.requiredFlags,
      unresolvedRequiredFlags: job.unresolvedRequiredFlags,
      directExecutionAllowedByContract: job.directExecutionAllowedByContract,
      bestBindings: Object.fromEntries(Object.entries(job.flagBindings).map(([flag, candidates]) => [
        flag,
        candidates.slice(0, 3).map((candidate) => candidate.rel)
      ]))
    }))
  }))
}, null, 2), "utf8");

console.log(JSON.stringify({
  output: relPath(outPath),
  compactOutput: relPath(compactPath),
  summary
}, null, 2));



