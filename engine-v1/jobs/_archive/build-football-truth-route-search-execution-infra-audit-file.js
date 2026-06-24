import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `route-search-execution-infra-audit-${today}`
);

const outputPath = path.join(
  outputDir,
  `route-search-execution-infra-audit-${today}.json`
);

const rowsOutputPath = path.join(
  outputDir,
  `route-search-execution-infra-audit-rows-${today}.jsonl`
);

const searchTerms = [
  "searchExecutedNowCount",
  "allowSearch",
  "ALLOW_SEARCH",
  "--allow-search",
  "searchBatch",
  "searchResults",
  "rss",
  "system1",
  "queryRow",
  "queries",
  "fetch("
];

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function walk(dir, out = []) {
  if (!(await exists(dir))) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", "build"].includes(entry.name)) continue;
      await walk(p, out);
    } else if (entry.isFile() && /\.(js|mjs|cjs|ts|json)$/i.test(entry.name)) {
      const stat = await fs.stat(p);
      if (stat.size <= 2 * 1024 * 1024) out.push({ path: p, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return out;
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function lineHits(text) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    const matchedTerms = searchTerms.filter(term => lower.includes(term.toLowerCase()));
    if (matchedTerms.length > 0) {
      hits.push({
        line: i + 1,
        matchedTerms,
        text: line.trim().slice(0, 300)
      });
    }
  }
  return hits;
}

function classify(relPath, text, hits) {
  const lowerPath = relPath.toLowerCase();
  const lower = text.toLowerCase();
  const roles = [];

  if (lowerPath.includes("start-date") && lowerPath.includes("search")) roles.push("existing_start_date_search_runner");
  if (lowerPath.includes("official") && lowerPath.includes("search")) roles.push("existing_official_search_runner_or_builder");
  if (lowerPath.includes("frontier") && lowerPath.includes("search")) roles.push("existing_frontier_search_runner_or_builder");
  if (lowerPath.includes("route") && lowerPath.includes("search")) roles.push("existing_route_search_runner_or_builder");
  if (lower.includes("--allow-search") || lower.includes("allowsearch") || lower.includes("allow_search")) roles.push("has_allow_search_gate");
  if (lower.includes("searchExecutedNowCount".toLowerCase())) roles.push("tracks_search_executed_count");
  if (lower.includes("fetch(")) roles.push("uses_node_fetch_or_fetch_api");
  if (lower.includes("rss")) roles.push("rss_search_pattern");
  if (lower.includes("jsonl")) roles.push("jsonl_rows_pattern");
  if (lower.includes("canonicalWriteExecutedNowCount".toLowerCase())) roles.push("tracks_write_guardrails");

  const score =
    hits.length +
    roles.length * 5 +
    (lowerPath.includes("run-football-truth") ? 8 : 0) +
    (lowerPath.includes("build-football-truth") ? 4 : 0);

  return { roles, score };
}

await fs.mkdir(outputDir, { recursive: true });

const candidateRoots = [
  path.join(root, "engine-v1", "jobs"),
  path.join(root, "engine-v1", "lib"),
  path.join(root, "engine-v1", "src"),
  path.join(root, "scripts")
];

const files = [];
for (const dir of candidateRoots) {
  await walk(dir, files);
}

const rows = [];

for (const file of files) {
  const text = await fs.readFile(file.path, "utf8");
  const hits = lineHits(text);
  if (hits.length === 0) continue;

  const relPath = path.relative(root, file.path).replaceAll("\\", "/");
  if (relPath === "engine-v1/jobs/build-football-truth-route-search-execution-infra-audit-file.js") continue;
  const classified = classify(relPath, text, hits);

  if (classified.score < 8) continue;

  rows.push({
    path: relPath,
    size: file.size,
    sha256: await sha256(file.path),
    score: classified.score,
    roles: classified.roles,
    hitCount: hits.length,
    topHits: hits.slice(0, 20)
  });
}

rows.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

const report = {
  status: "passed",
  runner: "route_search_execution_infra_audit",
  contractVersion: 1,
  purpose: "Diagnostic-only audit of existing search execution infrastructure before writing a high-yield previous_completed route-search executor.",
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
  summary: {
    scannedFileCount: files.length,
    matchingFileCount: rows.length,
    allowSearchGateFileCount: rows.filter(row => row.roles.includes("has_allow_search_gate")).length,
    nodeFetchPatternFileCount: rows.filter(row => row.roles.includes("uses_node_fetch_or_fetch_api")).length,
    rssPatternFileCount: rows.filter(row => row.roles.includes("rss_search_pattern")).length,
    recommendedReuseFiles: rows.slice(0, 12).map(row => row.path)
  },
  recommendedNextStep: "Use the highest-ranked gated search runner patterns to create a search-only executor for high-yield previous_completed route search batch 01. Do not fetch result pages, do not canonical-write, do not truth-assert.",
  topRows: rows.slice(0, 20)
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  summary: report.summary,
  recommendedNextStep: report.recommendedNextStep,
  topRows: report.topRows.slice(0, 12).map(row => ({
    path: row.path,
    score: row.score,
    roles: row.roles,
    hitCount: row.hitCount,
    topHits: row.topHits.slice(0, 5)
  }))
}, null, 2));

