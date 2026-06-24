import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `refreshed-table-candidate-schema-review-${DATE}`);
const args = new Set(process.argv.slice(2));
const TIMEOUT_MS = Number(process.env.TABLE_REVIEW_FETCH_TIMEOUT_MS || "10000");

if (!args.has("--allow-fetch")) throw new Error("Refusing table candidate fetch review without --allow-fetch");

const EXPECTED_ROWS = {
  "aut.1": 12, "aut.2": 16, "geo.1": 10, "geo.2": 10, "ita.2": 20,
  "nor.1": 16, "sui.1": 12, "sui.2": 10, "ukr.1": 16, "usa.1": 30
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }

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
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cellText(html) {
  return decodeEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractTables(html) {
  const tables = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/gi;
  for (const tm of String(html || "").matchAll(tableRe)) {
    const tableHtml = tm[0];
    const rows = [];
    const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
    for (const rm of tableHtml.matchAll(rowRe)) {
      const rowHtml = rm[0];
      const cells = [];
      const cellRe = /<(?:th|td)\b[\s\S]*?<\/(?:th|td)>/gi;
      for (const cm of rowHtml.matchAll(cellRe)) cells.push(cellText(cm[0]));
      if (cells.some(Boolean)) rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function normalize(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function num(v) {
  const m = String(v ?? "").replace(/[^\d-]/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function scoreTable(slug, rows) {
  const expected = EXPECTED_ROWS[slug] || null;
  const flat = normalize(rows.flat().join(" | "));
  const header = rows[0] || [];
  const maxCols = Math.max(0, ...rows.map((r) => r.length));
  const candidateRows = rows.slice(1).filter((r) => r.length >= 4 && r.some((c) => /[A-Za-zΑ-Ωα-ωა-ჰ]/.test(c)));
  const numericDensity = candidateRows.reduce((a, r) => a + r.filter((c) => num(c) !== null).length, 0);
  const hasStandingWords = /(team|club|played|won|draw|lost|points|pts|rank|position|goals|table|standings|w|d|l|p)/.test(flat);
  const expectedRowsPassed = expected ? candidateRows.length === expected : candidateRows.length >= 8 && candidateRows.length <= 30;
  const standingLike = hasStandingWords && maxCols >= 5 && candidateRows.length >= 8;

  let arithmeticProbe = { attempted: false, passed: false, reason: "no_column_mapping" };
  const hn = header.map(normalize);
  const idx = {
    played: hn.findIndex((h) => /^(p|pl|played|mp|matches|games)$/.test(h)),
    won: hn.findIndex((h) => /^(w|won|wins)$/.test(h)),
    drawn: hn.findIndex((h) => /^(d|draw|drawn|draws)$/.test(h)),
    lost: hn.findIndex((h) => /^(l|lost|losses)$/.test(h)),
    points: hn.findIndex((h) => /^(pts|points|pnt|pt)$/.test(h))
  };
  if (Object.values(idx).every((i) => i >= 0)) {
    arithmeticProbe.attempted = true;
    const checked = candidateRows.map((r) => {
      const p = num(r[idx.played]), w = num(r[idx.won]), d = num(r[idx.drawn]), l = num(r[idx.lost]), pts = num(r[idx.points]);
      return { p, w, d, l, pts, wdlOk: p === w + d + l, ptsOk: pts === w * 3 + d };
    }).filter((x) => [x.p,x.w,x.d,x.l,x.pts].every((v) => v !== null));
    arithmeticProbe = {
      attempted: true,
      passed: checked.length === candidateRows.length && checked.every((x) => x.wdlOk && x.ptsOk),
      checkedRows: checked.length,
      reason: checked.length ? "mapped_columns" : "mapped_columns_no_numeric_rows"
    };
  }

  const reviewStatus =
    standingLike && expectedRowsPassed && arithmeticProbe.passed ? "accepted_materializable_table_schema_candidate" :
    standingLike && expectedRowsPassed ? "review_schema_mapping_needed" :
    standingLike ? "review_currentness_or_row_count" :
    "rejected_not_standings_table_shape";

  return {
    expectedRows: expected,
    physicalRowCount: rows.length,
    candidateDataRowCount: candidateRows.length,
    maxCols,
    numericDensity,
    header,
    expectedRowsPassed,
    standingLike,
    arithmeticProbe,
    reviewStatus,
    previewRows: rows.slice(0, 8)
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 football-truth-table-review/1.0", "accept": "text/html,*/*" }
    });
    const contentType = res.headers.get("content-type") || "";
    const text = contentType.toLowerCase().includes("html") || contentType.toLowerCase().includes("text") ? await res.text() : "";
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, contentType, text };
  } finally {
    clearTimeout(t);
  }
}

ensureDir(OUT_DIR);

const sourcePath = latestFile(/controlled-refreshed-host-first-table-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!sourcePath) throw new Error("Missing refreshed table candidates file");

const raw = readJsonl(sourcePath);
const trueTableCandidates = raw
  .filter((r) => Number(r.tableCount || 0) > 0)
  .sort((a, b) =>
    Number(b.trCount || 0) - Number(a.trCount || 0) ||
    Number(b.standingSignalCount || 0) - Number(a.standingSignalCount || 0) ||
    String(a.competitionSlug).localeCompare(String(b.competitionSlug))
  );

const seen = new Set();
const targets = [];
for (const r of trueTableCandidates) {
  const key = `${r.competitionSlug}|${r.finalUrl || r.sourceUrl}`;
  if (seen.has(key)) continue;
  seen.add(key);
  targets.push(r);
}
const selected = targets.slice(0, 40);

const reviews = [];
let fetchExecutedNowCount = 0;

for (const target of selected) {
  fetchExecutedNowCount += 1;
  let fetched;
  try {
    fetched = await fetchText(target.finalUrl || target.sourceUrl);
  } catch (error) {
    reviews.push({ ...target, fetchStatus: "fetch_failed", errorMessage: String(error?.message || error).slice(0, 240), tableReviews: [] });
    continue;
  }

  const tables = extractTables(fetched.text);
  const tableReviews = tables.map((rows, tableIndex) => ({
    tableIndex,
    ...scoreTable(target.competitionSlug, rows)
  })).sort((a, b) =>
    Number(b.reviewStatus === "accepted_materializable_table_schema_candidate") - Number(a.reviewStatus === "accepted_materializable_table_schema_candidate") ||
    Number(b.standingLike) - Number(a.standingLike) ||
    Number(b.expectedRowsPassed) - Number(a.expectedRowsPassed) ||
    b.candidateDataRowCount - a.candidateDataRowCount
  );

  reviews.push({
    competitionSlug: target.competitionSlug,
    taskType: target.taskType,
    officialHost: target.officialHost,
    sourceUrl: target.sourceUrl,
    finalUrl: fetched.finalUrl,
    httpStatus: fetched.status,
    contentType: fetched.contentType,
    fetchedHtmlLength: fetched.text.length,
    sourceTableCount: target.tableCount,
    fetchedTableCount: tables.length,
    bestReviewStatus: tableReviews[0]?.reviewStatus || "no_tables_after_refetch",
    bestCandidateDataRowCount: tableReviews[0]?.candidateDataRowCount || 0,
    bestExpectedRowsPassed: tableReviews[0]?.expectedRowsPassed || false,
    bestArithmeticPassed: tableReviews[0]?.arithmeticProbe?.passed || false,
    tableReviews: tableReviews.slice(0, 5)
  });
}

const accepted = reviews.filter((r) => r.bestReviewStatus === "accepted_materializable_table_schema_candidate");
const mappingNeeded = reviews.filter((r) => r.bestReviewStatus === "review_schema_mapping_needed");
const reviewNeeded = reviews.filter((r) => r.bestReviewStatus === "review_currentness_or_row_count");

const summary = {
  status: "passed",
  runner: "refreshed_table_candidate_schema_review",
  sourceTableCandidatesPath: rel(sourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputTableCandidateCount: raw.length,
  trueHtmlTableCandidateCount: trueTableCandidates.length,
  reviewedTargetCount: reviews.length,
  acceptedMaterializableTableSchemaCandidateCount: accepted.length,
  schemaMappingNeededCount: mappingNeeded.length,
  currentnessOrRowCountReviewCount: reviewNeeded.length,
  acceptedCompetitionSlugs: accepted.map((r) => r.competitionSlug),
  reviewCompetitionSlugs: [...new Set([...mappingNeeded, ...reviewNeeded].map((r) => r.competitionSlug))].sort(),
  recommendedNextLane:
    accepted.length > 0 ? "build_strict_table_adapter_proof_for_accepted_candidates" :
    mappingNeeded.length > 0 ? "inspect_table_preview_and_add_source_specific_schema_mapping" :
    "continue_api_hint_fetch_or_route_replacement"
};

const outPath = path.join(OUT_DIR, `refreshed-table-candidate-schema-review-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `refreshed-table-candidate-schema-review-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `refreshed-table-candidate-schema-accepted-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, mappingNeeded, reviewNeeded, reviews }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviews.map((r) => JSON.stringify(r)).join("\n") + (reviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  acceptedOutput: rel(acceptedPath),
  summary
}, null, 2));
