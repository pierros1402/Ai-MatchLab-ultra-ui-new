import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 1);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-volume-league-expansion-clean-plan-${today}`, `bulk-volume-league-expansion-clean-plan-${today}.json`);
const hygienePath = path.join(root, "data", "football-truth", "_diagnostics", `diagnostic-cooccurrence-hygiene-policy-${today}`, `diagnostic-cooccurrence-hygiene-policy-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-explicit-route-reuse-board-${today}`);
const outPath = path.join(outDir, `bulk-batch-explicit-route-reuse-board-batch-${String(batchIndex).padStart(3, "0")}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-explicit-route-reuse-board-batch-${String(batchIndex).padStart(3, "0")}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

async function readText(file) {
  try { return await fs.readFile(file, "utf8"); } catch { return ""; }
}

async function listFiles(dir, exts, limit = 20000) {
  const out = [];
  async function walk(current) {
    if (out.length >= limit) return;
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", ".next"].includes(entry.name)) continue;
        await walk(full);
      } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

function extractUrls(value) {
  const text = String(value ?? "");
  const matches = text.match(/https?:\/\/[^\s"'<>),\]}]+/g) || [];
  return matches.map(url => url.replace(/[.;]+$/g, ""));
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

function isExplicitSlugObject(obj, slug) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const slugKeys = ["slug", "competitionSlug", "targetSlug", "leagueSlug", "competition", "targetCompetition"];
  for (const key of slugKeys) {
    if (String(obj[key] ?? "") === slug) return true;
  }
  return false;
}

function objectHasMultiSlugArray(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  for (const [key, value] of Object.entries(obj)) {
    if (/slug|competition|target/i.test(key) && Array.isArray(value)) {
      const slugs = value.map(v => typeof v === "string" ? v : v?.slug || v?.competitionSlug).filter(Boolean);
      if (slugs.length > 1) return true;
    }
  }
  return false;
}

function collectExplicitFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (/sourceFamily|routeFamily|family|source|authority|official|route|url|href|endpoint|domain|host|standings|fixture|table/i.test(key)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") fields[key] = value;
    }
  }
  return fields;
}

function urlsFromSameObject(obj) {
  const urls = [];
  for (const [key, value] of Object.entries(obj || {})) {
    if (/url|href|endpoint|route|source|official|standings|fixture|table/i.test(key)) {
      if (typeof value === "string") urls.push(...extractUrls(value));
      if (Array.isArray(value)) for (const item of value) if (typeof item === "string") urls.push(...extractUrls(item));
    }
  }
  return [...new Set(urls)];
}

function candidateScore(candidate) {
  let score = 0;
  if (candidate.urls.length) score += 100;
  if (candidate.explicitFields.sourceFamily || candidate.explicitFields.routeFamily) score += 40;
  if (candidate.explicitFields.official === true || String(candidate.explicitFields.isOfficial || "").toLowerCase() === "true") score += 35;
  if (candidate.urls.some(url => /standings|table|tabell|tabelle|classification|clasificacion|rank|fixture|match/i.test(url))) score += 25;
  if (candidate.hosts.length) score += 10;
  if (/accepted|verified|candidate|route|standing|source/i.test(candidate.file)) score += 10;
  return score;
}

function walkObjects(value, visit, depth = 0) {
  if (depth > 12 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visit, depth + 1);
    return;
  }
  if (typeof value === "object") {
    visit(value);
    for (const item of Object.values(value)) walkObjects(item, visit, depth + 1);
  }
}

async function parseJsonLikeFile(file, targets) {
  const text = await readText(file);
  if (!text || !text.includes("http")) return [];
  if (!targets.some(slug => text.includes(slug))) return [];

  const candidates = [];
  const ext = path.extname(file).toLowerCase();

  const parseObjects = [];
  if (ext === ".jsonl") {
    const lines = text.split(/\r?\n/).filter(line => line.includes("http") && targets.some(slug => line.includes(slug)));
    for (const line of lines.slice(0, 5000)) {
      try { parseObjects.push(JSON.parse(line)); } catch {}
    }
  } else {
    try { parseObjects.push(JSON.parse(text)); } catch {}
  }

  for (const rootObj of parseObjects) {
    walkObjects(rootObj, obj => {
      if (objectHasMultiSlugArray(obj)) return;

      for (const slug of targets) {
        if (!isExplicitSlugObject(obj, slug)) continue;

        const urls = urlsFromSameObject(obj);
        if (urls.length === 0) continue;

        const explicitFields = collectExplicitFields(obj);
        const hosts = [...new Set(urls.map(hostOf).filter(Boolean))];

        const candidate = {
          slug,
          file: rel(file),
          urls,
          hosts,
          explicitFields,
          sameObjectEvidence: true,
          cooccurrenceOnly: false
        };
        candidate.score = candidateScore(candidate);
        candidate.evidenceSha256 = shaText(JSON.stringify(candidate));
        candidates.push(candidate);
      }
    });
  }

  return candidates;
}

await fs.mkdir(outDir, { recursive: true });

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const hygiene = JSON.parse(await fs.readFile(hygienePath, "utf8"));

const blocks = [];
if (plan.status !== "passed") blocks.push("clean_plan_not_passed");
if (hygiene.status !== "passed") blocks.push("hygiene_policy_not_passed");
if (hygiene.ruleSet?.aggregateDiagnosticsCannotAssignSourceFamily !== true) blocks.push("hygiene_missing_no_cooccurrence_family_rule");
if (hygiene.ruleSet?.familyAssignmentRequiresPerSlugRouteEvidence !== true) blocks.push("hygiene_missing_per_slug_route_rule");

const batch = (plan.batches || []).find(item => item.batchIndex === batchIndex);
if (!batch) blocks.push(`missing_batch_${batchIndex}`);

const targetSlugs = batch?.slugs || [];
const planRows = (plan.rows || []).filter(row => targetSlugs.includes(row.slug));

const scanFiles = [
  ...(await listFiles(path.join(root, "data", "football-truth", "_diagnostics"), [".json", ".jsonl"], 16000)),
  ...(await listFiles(path.join(root, "engine-v1", "config"), [".json"], 2000))
].filter(file => !rel(file).includes(`bulk-batch-explicit-route-reuse-board-${today}`));

const allCandidates = [];
for (const file of scanFiles) {
  allCandidates.push(...await parseJsonLikeFile(file, targetSlugs));
}

const rows = planRows.map(planRow => {
  const candidates = allCandidates
    .filter(candidate => candidate.slug === planRow.slug)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const best = candidates[0] || null;

  return {
    slug: planRow.slug,
    displayName: planRow.displayName,
    priorityBand: planRow.priorityBand,
    batchIndex,
    explicitRouteReuseCandidateCount: candidates.length,
    bestCandidateScore: best?.score || 0,
    bestCandidateUrls: best?.urls?.slice(0, 5) || [],
    bestCandidateHosts: best?.hosts || [],
    bestCandidateFile: best?.file || null,
    bestCandidateExplicitFields: best?.explicitFields || {},
    status: best ? "explicit_route_reuse_candidate_found" : "needs_controlled_official_route_discovery",
    cooccurrenceOnlyEvidenceAccepted: false,
    familyClaimMadeNow: false,
    routeClaimMadeNow: false,
    fetchAllowedByThisBoard: false,
    productionWriteAllowedByThisBoard: false,
    truthAssertionAllowedByThisBoard: false,
    candidateEvidenceSha256: best?.evidenceSha256 || null,
    topCandidates: candidates.slice(0, 5)
  };
});

if (rows.length !== targetSlugs.length) blocks.push("row_count_mismatch");
if (rows.some(row => row.cooccurrenceOnlyEvidenceAccepted !== false)) blocks.push("cooccurrence_evidence_accepted");
if (rows.some(row => row.familyClaimMadeNow !== false || row.routeClaimMadeNow !== false)) blocks.push("family_or_route_claim_made_now");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_explicit_route_reuse_board",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  planPath: rel(planPath),
  hygienePath: rel(hygienePath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: rows.length,
    scannedFileCount: scanFiles.length,
    totalExplicitCandidateCount: allCandidates.length,
    routeReuseCandidateFoundCount: rows.filter(row => row.status === "explicit_route_reuse_candidate_found").length,
    needsControlledOfficialRouteDiscoveryCount: rows.filter(row => row.status === "needs_controlled_official_route_discovery").length,
    cooccurrenceOnlyEvidenceAcceptedCount: 0,
    familyClaimMadeNowCount: 0,
    routeClaimMadeNowCount: 0,
    nextRecommendedLane: "run controlled official route discovery/fetch only for rows still needing discovery; route reuse candidates require fetch verification before any candidate write"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    displayName: row.displayName,
    status: row.status,
    explicitRouteReuseCandidateCount: row.explicitRouteReuseCandidateCount,
    bestCandidateHosts: row.bestCandidateHosts,
    bestCandidateUrls: row.bestCandidateUrls,
    bestCandidateFile: row.bestCandidateFile
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
