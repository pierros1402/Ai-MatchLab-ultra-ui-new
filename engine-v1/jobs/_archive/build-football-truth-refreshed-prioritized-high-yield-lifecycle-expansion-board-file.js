import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `refreshed-prioritized-high-yield-lifecycle-expansion-board-${today}`);
const outputPath = path.join(outputDir, `refreshed-prioritized-high-yield-lifecycle-expansion-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `refreshed-prioritized-high-yield-lifecycle-expansion-board-rows-${today}.jsonl`);

const satisfiedPreviousCompleted = new Set([
  "esp.1", "esp.2", "ger.1", "ger.2", "ger.3", "cro.1",
  "sco.1", "sco.2", "ned.1", "den.1", "jpn.1", "eng.1"
]);

const satisfiedCurrentOrNew = new Set([
  "geo.1", "cyp.1", "fin.1", "fin.2", "isl.1", "isl.2", "nor.1", "swe.1", "swe.2"
]);

const satisfiedNextSeasonStartDate = new Set(["eng.1", "ksa.1"]);
const blockedUnlessGovernedEvidenceExists = new Set(["nor.2", "cyp.2"]);
const reviewOnlySingleLeagueRabbitHole = new Set(["ita.1"]);

const highValueCountryCodes = new Set([
  "eng", "ita", "fra", "esp", "ger", "por", "ned", "bel", "tur", "gre",
  "sco", "aut", "sui", "den", "swe", "nor", "pol", "cro", "jpn", "kor",
  "bra", "arg", "usa", "mex", "aus", "ksa"
]);

const slugPattern = /^[a-z]{2,4}\.\d+$/i;

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walkJsonFiles(dir, out = []) {
  if (!(await exists(dir))) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase().includes("raw") || entry.name.toLowerCase().includes("payload")) continue;
      await walkJsonFiles(p, out);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      const stat = await fs.stat(p);
      if (stat.size <= 15 * 1024 * 1024) out.push({ path: p, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return out;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function asText(value) {
  try { return JSON.stringify(value).slice(0, 6000).toLowerCase(); } catch { return ""; }
}

function pickSlug(obj) {
  if (!obj || typeof obj !== "object") return null;
  const directKeys = [
    "slug", "competitionSlug", "competition_slug", "normalizedCompetitionSlug",
    "normalized_slug", "competitionId", "competitionKey"
  ];
  for (const key of directKeys) {
    const value = obj[key];
    if (typeof value === "string" && slugPattern.test(value)) return value.toLowerCase();
  }
  if (obj.competition && typeof obj.competition === "object") {
    const nested = pickSlug(obj.competition);
    if (nested) return nested;
  }
  return null;
}

function pickFamily(obj, text) {
  const keys = ["sourceFamily", "family", "providerFamily", "routeFamily", "runner", "adapter", "sourceGroup"];
  for (const key of keys) {
    if (obj && typeof obj === "object" && typeof obj[key] === "string" && obj[key].trim()) return obj[key].trim();
  }
  if (text.includes("browser-rendered") || text.includes("browser_rendered")) return "browser_rendered";
  if (text.includes("sourcefamily") || text.includes("source_family")) return "source_family";
  if (text.includes("dapi.legaseriea.it")) return "legaseriea_dapi";
  return null;
}

function inferLane(obj, pointerText) {
  const text = `${pointerText} ${asText(obj)}`;
  if (text.includes("previous_completed") || text.includes("previouscompleted") || text.includes("previous completed")) return "previous_completed_standings";
  if ((text.includes("nextseason") && text.includes("start")) || text.includes("start_date") || text.includes("startdate") || text.includes("start date")) return "next_season_start_date";
  if (text.includes("current_or_new") || text.includes("currentornew") || text.includes("current/new")) return "current_or_new_standings";
  return null;
}

function collectTasks(value, file, pointer = "$", out = []) {
  const pointerLower = pointer.toLowerCase();

  if (Array.isArray(value)) {
    const stringSlugs = value.filter(v => typeof v === "string" && slugPattern.test(v));
    if (stringSlugs.length > 0) {
      let lane = null;
      if (pointerLower.includes("previous")) lane = "previous_completed_standings";
      if (pointerLower.includes("start")) lane = "next_season_start_date";
      if (pointerLower.includes("current")) lane = "current_or_new_standings";
      if (lane) {
        for (const slug of stringSlugs) {
          out.push({ slug: slug.toLowerCase(), lane, sourceFile: file, pointer, sourceShape: "slug-array" });
        }
      }
    }
    for (let i = 0; i < value.length; i += 1) {
      if (i > 3000) break;
      collectTasks(value[i], file, `${pointer}[${i}]`, out);
    }
    return out;
  }

  if (!value || typeof value !== "object") return out;

  const slug = pickSlug(value);
  const lane = inferLane(value, pointerLower);
  if (slug && lane) {
    const text = asText(value);
    out.push({
      slug,
      lane,
      sourceFile: file,
      pointer,
      sourceShape: "object",
      family: pickFamily(value, text),
      hasUrl: /https?:\/\//i.test(text),
      hasOfficialHint: text.includes("official") || text.includes("source") || text.includes("rendered") || text.includes("dapi"),
      rawTaskType: value.taskType || value.kind || value.lane || value.lifecycleLane || value.taskLane || null,
      textSample: text.slice(0, 500)
    });
  }

  const entries = Object.entries(value);
  for (const [key, child] of entries) {
    if (pointer.split(".").length > 10) continue;
    collectTasks(child, file, `${pointer}.${key}`, out);
  }

  return out;
}

function shouldExclude(task) {
  const text = `${task.textSample || ""} ${task.pointer || ""}`.toLowerCase();

  if (reviewOnlySingleLeagueRabbitHole.has(task.slug)) {
    return "known_review_only_single_league_rabbit_hole";
  }

  if (task.lane === "previous_completed_standings" && satisfiedPreviousCompleted.has(task.slug)) {
    return "already_satisfied_previous_completed";
  }

  if (task.lane === "next_season_start_date" && satisfiedNextSeasonStartDate.has(task.slug)) {
    return "already_satisfied_next_season_start_date";
  }

  if (task.lane === "current_or_new_standings" && satisfiedCurrentOrNew.has(task.slug)) {
    return "already_satisfied_current_or_new";
  }

  if (blockedUnlessGovernedEvidenceExists.has(task.slug) && !text.includes("governed") && !text.includes("phase parser")) {
    return "known_blocked_without_governed_evidence_or_phase_parser";
  }

  if (text.includes("all-zero") || text.includes("all zero") || text.includes("zerorows") || text.includes("zero rows")) {
    return "known_all_zero_rejected_signature";
  }

  if (task.slug === "eng.1" && text.includes("premierleague.com") && (text.includes("2026-27") || text.includes("2026/27"))) {
    return "rejected_pl_current_all_zero_route_signature";
  }

  if (task.slug === "ita.1" && text.includes("serie a") && (text.includes("current") || text.includes("all-zero"))) {
    return "serie_a_review_only_not_previous_completed_acceptance";
  }

  if (task.lane === "current_or_new_standings") {
    return "not_target_lane_for_this_board";
  }

  return null;
}

function scoreTask(task) {
  const country = task.slug.split(".")[0];
  const tier = Number(task.slug.split(".")[1]);
  let score = 0;
  const reasons = [];

  if (task.lane === "previous_completed_standings") { score += 100; reasons.push("previous_completed_due"); }
  if (task.lane === "next_season_start_date") { score += 80; reasons.push("next_season_start_date_due"); }
  if (task.family) { score += 35; reasons.push(`family:${task.family}`); }
  if (task.hasOfficialHint) { score += 20; reasons.push("official_or_rendered_hint"); }
  if (task.hasUrl) { score += 10; reasons.push("route_or_url_present"); }
  if (tier === 1) { score += 18; reasons.push("top_tier"); }
  else if (tier === 2) { score += 9; reasons.push("second_tier"); }
  if (highValueCountryCodes.has(country)) { score += 15; reasons.push("high_value_country"); }
  if (task.sourceFile.includes("prioritized-lifecycle-execution-board")) { score += 25; reasons.push("from_prioritized_lifecycle_board"); }
  if (task.sourceFile.includes("permanent-season-lifecycle-plan")) { score += 15; reasons.push("from_permanent_lifecycle_plan"); }
  if (task.sourceFile.includes("season-lane-coverage-ledger")) { score += 10; reasons.push("from_season_lane_ledger"); }

  return { score, reasons };
}

await fs.mkdir(outputDir, { recursive: true });

const scanRoots = [
  path.join(root, "data", "football-truth", "_diagnostics"),
  path.join(root, "data", "football-truth", "_state")
];

const files = [];
for (const scanRoot of scanRoots) await walkJsonFiles(scanRoot, files);

const sourceFiles = files
  .filter(f => {
    const base = path.basename(f.path).toLowerCase();
    return (
      base.includes("lifecycle") ||
      base.includes("season-lane") ||
      base.includes("previous-completed") ||
      base.includes("start-date") ||
      base.includes("source-family")
    );
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs)
  .slice(0, 240);

const rawTasks = [];
const parsedArtifacts = [];

for (const file of sourceFiles) {
  const json = await readJson(file.path);
  if (!json) continue;
  const rel = path.relative(root, file.path).replaceAll("\\", "/");
  parsedArtifacts.push({
    path: rel,
    size: file.size,
    sha256: await sha256(file.path)
  });
  collectTasks(json, rel, "$", rawTasks);
}

const exclusionCounts = {};
const accepted = [];

for (const task of rawTasks) {
  const exclusion = shouldExclude(task);
  if (exclusion) {
    exclusionCounts[exclusion] = (exclusionCounts[exclusion] || 0) + 1;
    continue;
  }
  const scored = scoreTask(task);
  accepted.push({
    slug: task.slug,
    lane: task.lane,
    priorityScore: scored.score,
    reasons: scored.reasons,
    family: task.family || null,
    sourceFile: task.sourceFile,
    pointer: task.pointer,
    sourceShape: task.sourceShape
  });
}

const deduped = new Map();
for (const row of accepted) {
  const key = `${row.slug}|${row.lane}`;
  const previous = deduped.get(key);
  if (!previous || row.priorityScore > previous.priorityScore) deduped.set(key, row);
}

const boardRows = [...deduped.values()]
  .sort((a, b) => b.priorityScore - a.priorityScore || a.slug.localeCompare(b.slug))
  .map((row, index) => ({ rank: index + 1, ...row }))
  .slice(0, 160);

if (boardRows.length < 1) {
  throw new Error("No accepted lifecycle expansion board rows were found from current diagnostics/state artifacts.");
}

const report = {
  status: "passed",
  runner: "refreshed_prioritized_high_yield_lifecycle_expansion_board",
  contractVersion: 1,
  purpose: "Build a diagnostic-only high-yield lifecycle expansion board from existing artifacts; no fetch/search/canonical/truth/production writes.",
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false
  },
  suppressions: {
    satisfiedPreviousCompleted: [...satisfiedPreviousCompleted].sort(),
    satisfiedCurrentOrNew: [...satisfiedCurrentOrNew].sort(),
    satisfiedNextSeasonStartDate: [...satisfiedNextSeasonStartDate].sort(),
    blockedUnlessGovernedEvidenceExists: [...blockedUnlessGovernedEvidenceExists].sort()
  },
  summary: {
    scannedJsonFileCount: files.length,
    parsedRelevantArtifactCount: parsedArtifacts.length,
    rawTaskLikeCount: rawTasks.length,
    acceptedBoardRowCount: boardRows.length,
    previousCompletedExpansionRowCount: boardRows.filter(r => r.lane === "previous_completed_standings").length,
    nextSeasonStartDateExpansionRowCount: boardRows.filter(r => r.lane === "next_season_start_date").length,
    sourceFamilyRows: boardRows.filter(r => r.family).length,
    exclusionCounts
  },
  topRows: boardRows.slice(0, 30),
  parsedArtifacts: parsedArtifacts.slice(0, 80)
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, boardRows.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  summary: report.summary,
  topRows: report.topRows.slice(0, 15)
}, null, 2));

