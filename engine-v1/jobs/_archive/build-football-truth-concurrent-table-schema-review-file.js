import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `concurrent-table-schema-review-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-fetch")) throw new Error("Refusing table schema review fetch without --allow-fetch");

const TIMEOUT_MS = Number(process.env.TABLE_SCHEMA_REVIEW_TIMEOUT_MS || "9000");
const MAX_TARGETS = Number(process.env.TABLE_SCHEMA_REVIEW_MAX_TARGETS || "80");

const EXPECTED_ROWS = {
  "arg.1": 30, "arg.2": 36,
  "aus.1": 12, "aus.2": 14,
  "aut.1": 12, "aut.2": 16,
  "can.1": 8, "can.2": 12,
  "cro.1": 10, "cro.2": 12,
  "geo.1": 10, "geo.2": 10,
  "ita.1": 20, "ita.2": 20,
  "jpn.1": 20, "jpn.2": 20,
  "nor.1": 16, "nor.2": 16,
  "sco.1": 12, "sco.2": 10,
  "sui.1": 12, "sui.2": 10,
  "ukr.1": 16,
  "usa.1": 30, "usa.2": 24,
  "wal.1": 12
};

const ALREADY_PREVIOUS_COMPLETED = new Set(["esp.1","esp.2","ger.1","ger.2","ger.3","cro.1","sco.1","sco.2","ned.1","den.1"]);
const ALREADY_START_DATE = new Set(["eng.1","ksa.1"]);
const ALREADY_CURRENT_OR_NEW = new Set(["geo.1"]);

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
  for (const tm of String(html || "").matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = [];
    for (const rm of tm[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const cells = [];
      for (const cm of rm[0].matchAll(/<(?:th|td)\b[\s\S]*?<\/(?:th|td)>/gi)) cells.push(cellText(cm[0]));
      if (cells.some(Boolean)) rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function n(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toInt(v) {
  const raw = String(v ?? "").replace(/[^\d-]/g, "");
  if (!raw || raw === "-") return null;
  return Number(raw);
}

function isTeamLike(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return false;
  return /[A-Za-zΑ-Ωα-ωÀ-ÿა-ჰ]/.test(t);
}

function findHeaderIndex(header, patterns) {
  const h = header.map(n);
  for (const p of patterns) {
    const idx = h.findIndex((x) => p.test(x));
    if (idx >= 0) return idx;
  }
  return -1;
}

function inferMapping(rows) {
  const header = rows[0] || [];
  const idx = {
    position: findHeaderIndex(header, [/^#$/, /^pos$/, /^rank$/, /^position$/, /^p$/]),
    team: findHeaderIndex(header, [/^club$/, /^team$/, /^name$/, /^teams$/, /^squadra$/, /^societa$/, /^verein$/]),
    played: findHeaderIndex(header, [/^p(l|layed|lays)?$/, /^mp$/, /^matches$/, /^games$/, /^g$/, /^pg$/, /^pld$/]),
    won: findHeaderIndex(header, [/^w$/, /^won$/, /^wins$/, /^v$/]),
    drawn: findHeaderIndex(header, [/^d$/, /^draw$/, /^drawn$/, /^draws$/, /^x$/, /^n$/]),
    lost: findHeaderIndex(header, [/^l$/, /^lost$/, /^losses$/, /^defeats$/, /^p$/]),
    goalsFor: findHeaderIndex(header, [/^gf$/, /^for$/, /^goals for$/, /^f$/, /^goals\+$/, /^rf$/]),
    goalsAgainst: findHeaderIndex(header, [/^ga$/, /^against$/, /^goals against$/, /^a$/, /^goals-$/, /^ra$/]),
    goalDifference: findHeaderIndex(header, [/^gd$/, /^diff$/, /^goal difference$/, /^\+\/-$/, /^dr$/]),
    points: findHeaderIndex(header, [/^pts$/, /^points$/, /^pt$/, /^pnts$/, /^p$/])
  };

  const complete = Object.values(idx).every((x) => x >= 0) && new Set(Object.values(idx)).size === Object.values(idx).length;
  if (complete) return { method: "header", idx, complete: true };

  const sampleRows = rows.slice(1).filter((r) => r.length >= 6);
  const maxCols = Math.max(0, ...rows.map((r) => r.length));
  const candidates = [];

  for (let team = 0; team < maxCols; team++) {
    const teamOk = sampleRows.slice(0, 12).filter((r) => isTeamLike(r[team])).length >= Math.min(8, sampleRows.length);
    if (!teamOk) continue;

    const numericCols = [];
    for (let c = 0; c < maxCols; c++) {
      if (c === team) continue;
      const ok = sampleRows.slice(0, 12).filter((r) => toInt(r[c]) !== null).length >= Math.min(8, sampleRows.length);
      if (ok) numericCols.push(c);
    }

    for (const played of numericCols) for (const won of numericCols) for (const drawn of numericCols) for (const lost of numericCols) for (const points of numericCols) {
      const set = new Set([played, won, drawn, lost, points]);
      if (set.size < 5) continue;
      let checked = 0, wdlOk = 0, ptsOk = 0, nonZero = 0;
      for (const r of sampleRows) {
        const p = toInt(r[played]), w = toInt(r[won]), d = toInt(r[drawn]), l = toInt(r[lost]), pts = toInt(r[points]);
        if ([p,w,d,l,pts].some((x) => x === null)) continue;
        checked++;
        if (p === w + d + l) wdlOk++;
        if (pts === w * 3 + d) ptsOk++;
        if (p > 0 || pts > 0) nonZero++;
      }
      if (checked >= Math.min(8, sampleRows.length) && wdlOk === checked && ptsOk === checked && nonZero > 0) {
        candidates.push({ idx: { position: 0, team, played, won, drawn, lost, goalsFor: -1, goalsAgainst: -1, goalDifference: -1, points }, checked });
      }
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.checked - a.checked);
    return { method: "arithmetic_inferred", idx: candidates[0].idx, complete: false };
  }

  return { method: "none", idx, complete: false };
}

function parseRows(table, target, tableIndex) {
  const mapping = inferMapping(table);
  const dataRows = table.slice(1).filter((r) => r.length >= 4);
  const out = [];

  for (const r of dataRows) {
    const team = String(r[mapping.idx.team] || "").trim();
    const played = toInt(r[mapping.idx.played]);
    const won = toInt(r[mapping.idx.won]);
    const drawn = toInt(r[mapping.idx.drawn]);
    const lost = toInt(r[mapping.idx.lost]);
    const points = toInt(r[mapping.idx.points]);

    if (!team || [played, won, drawn, lost, points].some((x) => x === null)) continue;

    const goalsFor = mapping.idx.goalsFor >= 0 ? toInt(r[mapping.idx.goalsFor]) : null;
    const goalsAgainst = mapping.idx.goalsAgainst >= 0 ? toInt(r[mapping.idx.goalsAgainst]) : null;
    const goalDifference = mapping.idx.goalDifference >= 0 ? toInt(r[mapping.idx.goalDifference]) : (goalsFor !== null && goalsAgainst !== null ? goalsFor - goalsAgainst : null);
    const position = mapping.idx.position >= 0 ? toInt(r[mapping.idx.position]) : out.length + 1;

    out.push({
      competitionSlug: target.competitionSlug,
      sourceHost: target.officialHost,
      sourceUrl: target.finalUrl,
      tableIndex,
      position,
      team,
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      goalDifference,
      points
    });
  }

  return { mapping, rows: out };
}

function validate(parsedRows, target, table) {
  const expected = EXPECTED_ROWS[target.competitionSlug] || null;
  const expectedRowsPassed = expected ? parsedRows.length === expected : parsedRows.length >= 8 && parsedRows.length <= 36;
  const arithmeticRows = parsedRows.map((r) => ({
    team: r.team,
    wdlOk: r.played === r.won + r.drawn + r.lost,
    pointsOk: r.points === r.won * 3 + r.drawn,
    gdOk: r.goalDifference === null || r.goalsFor === null || r.goalsAgainst === null || r.goalDifference === r.goalsFor - r.goalsAgainst
  }));
  const arithmeticGatePassed = arithmeticRows.length === parsedRows.length && arithmeticRows.every((r) => r.wdlOk && r.pointsOk && r.gdOk);
  const nonTrivialGatePassed =
    parsedRows.reduce((a, r) => a + r.played, 0) > 0 &&
    parsedRows.reduce((a, r) => a + r.points, 0) > 0 &&
    parsedRows.some((r) => r.played > 0) &&
    (parsedRows.length ? Math.max(...parsedRows.map((r) => r.points)) : 0) > 0;

  const flat = n(table.flat().join(" | "));
  const seasonScope =
    target.taskType === "acquire_next_season_start_date" ? "not_a_standings_target" :
    /2026|2026\/27|2026-2027/.test(flat) && !/2025\/26|2025-2026/.test(flat) ? "current_or_new_review" :
    /2025|2025\/26|2025-2026/.test(flat) ? "previous_completed_candidate" :
    "season_scope_unknown";

  const status =
    ALREADY_PREVIOUS_COMPLETED.has(target.competitionSlug) ? "blocked_already_previous_completed_satisfied" :
    target.taskType !== "acquire_previous_completed_standings" ? "blocked_not_previous_completed_task" :
    expectedRowsPassed && arithmeticGatePassed && nonTrivialGatePassed && seasonScope === "previous_completed_candidate" ? "accepted_previous_completed_table_candidate" :
    expectedRowsPassed && arithmeticGatePassed && nonTrivialGatePassed ? "review_season_scope_needed" :
    expectedRowsPassed && nonTrivialGatePassed ? "review_mapping_or_points_gate" :
    "rejected_table_shape_or_row_count";

  return { expected, expectedRowsPassed, arithmeticGatePassed, nonTrivialGatePassed, seasonScope, status, arithmeticRows };
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 football-truth-bulk-table-review/1.0", "accept": "text/html,*/*" } });
    const contentType = res.headers.get("content-type") || "";
    const text = /html|text/i.test(contentType) ? await res.text() : "";
    return { status: res.status, finalUrl: res.url || url, contentType, text };
  } finally {
    clearTimeout(timer);
  }
}

ensureDir(OUT_DIR);

const sourcePath = latestFile(/concurrent-refreshed-host-first-table-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!sourcePath) throw new Error("Missing concurrent table candidates file");

const all = readJsonl(sourcePath);
const trueTableRows = all.filter((r) => Number(r.tableCount || 0) > 0);
const seen = new Set();
const targets = [];
for (const r of trueTableRows) {
  const key = `${r.competitionSlug}|${r.taskType}|${r.finalUrl || r.sourceUrl}`;
  if (seen.has(key)) continue;
  seen.add(key);
  targets.push(r);
}
targets.sort((a, b) =>
  Number(ALREADY_PREVIOUS_COMPLETED.has(a.competitionSlug)) - Number(ALREADY_PREVIOUS_COMPLETED.has(b.competitionSlug)) ||
  Number(b.taskType === "acquire_previous_completed_standings") - Number(a.taskType === "acquire_previous_completed_standings") ||
  Number(b.tableCount || 0) - Number(a.tableCount || 0) ||
  Number(b.trCount || 0) - Number(a.trCount || 0) ||
  String(a.competitionSlug).localeCompare(String(b.competitionSlug))
);

const selected = targets.slice(0, MAX_TARGETS);
const reviews = [];

let fetchExecutedNowCount = 0;
for (const target of selected) {
  fetchExecutedNowCount += 1;
  let fetched;
  try {
    fetched = await fetchHtml(target.finalUrl || target.sourceUrl);
  } catch (error) {
    reviews.push({ ...target, reviewStatus: "fetch_failed", errorMessage: String(error?.message || error).slice(0, 240), tableReviews: [] });
    continue;
  }

  const tables = extractTables(fetched.text);
  const tableReviews = tables.map((table, tableIndex) => {
    const parsed = parseRows(table, { ...target, finalUrl: fetched.finalUrl }, tableIndex);
    const validation = validate(parsed.rows, target, table);
    return {
      tableIndex,
      header: table[0] || [],
      physicalRowCount: table.length,
      maxCols: Math.max(0, ...table.map((r) => r.length)),
      parsedRowCount: parsed.rows.length,
      mappingMethod: parsed.mapping.method,
      mapping: parsed.mapping.idx,
      ...validation,
      previewRows: table.slice(0, 6),
      parsedRowsPreview: parsed.rows.slice(0, 24)
    };
  }).sort((a, b) =>
    Number(b.status === "accepted_previous_completed_table_candidate") - Number(a.status === "accepted_previous_completed_table_candidate") ||
    Number(b.status === "review_season_scope_needed") - Number(a.status === "review_season_scope_needed") ||
    Number(b.expectedRowsPassed) - Number(a.expectedRowsPassed) ||
    Number(b.arithmeticGatePassed) - Number(a.arithmeticGatePassed) ||
    b.parsedRowCount - a.parsedRowCount
  );

  const best = tableReviews[0] || null;
  reviews.push({
    competitionSlug: target.competitionSlug,
    taskType: target.taskType,
    officialHost: target.officialHost,
    sourceUrl: target.sourceUrl,
    finalUrl: fetched.finalUrl,
    httpStatus: fetched.status,
    contentType: fetched.contentType,
    sourceTableCount: target.tableCount,
    fetchedTableCount: tables.length,
    bestStatus: best?.status || "no_tables_after_refetch",
    bestParsedRowCount: best?.parsedRowCount || 0,
    bestExpectedRowsPassed: best?.expectedRowsPassed || false,
    bestArithmeticGatePassed: best?.arithmeticGatePassed || false,
    bestNonTrivialGatePassed: best?.nonTrivialGatePassed || false,
    bestSeasonScope: best?.seasonScope || null,
    alreadyPreviousCompletedSatisfied: ALREADY_PREVIOUS_COMPLETED.has(target.competitionSlug),
    alreadyStartDateSatisfied: ALREADY_START_DATE.has(target.competitionSlug),
    alreadyCurrentOrNewSatisfied: ALREADY_CURRENT_OR_NEW.has(target.competitionSlug),
    tableReviews: tableReviews.slice(0, 5)
  });
}

const accepted = reviews.filter((r) => r.bestStatus === "accepted_previous_completed_table_candidate");
const seasonReview = reviews.filter((r) => r.bestStatus === "review_season_scope_needed");
const mappingReview = reviews.filter((r) => r.bestStatus === "review_mapping_or_points_gate");
const blockedSatisfied = reviews.filter((r) => r.bestStatus === "blocked_already_previous_completed_satisfied");
const blockedTask = reviews.filter((r) => r.bestStatus === "blocked_not_previous_completed_task");

const summary = {
  status: "passed",
  runner: "concurrent_table_schema_review",
  sourceTableCandidatesPath: rel(sourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputTableCandidateCount: all.length,
  trueHtmlTableCandidateCount: trueTableRows.length,
  uniqueTargetCount: targets.length,
  reviewedTargetCount: reviews.length,
  acceptedPreviousCompletedTableCandidateCount: accepted.length,
  seasonScopeReviewCount: seasonReview.length,
  mappingOrPointsGateReviewCount: mappingReview.length,
  blockedAlreadySatisfiedCount: blockedSatisfied.length,
  blockedNotPreviousCompletedTaskCount: blockedTask.length,
  acceptedCompetitionSlugs: accepted.map((r) => r.competitionSlug),
  reviewCompetitionSlugs: [...new Set([...seasonReview, ...mappingReview].map((r) => r.competitionSlug))].sort(),
  recommendedNextLane:
    accepted.length > 0 ? "build_adapter_proofs_for_accepted_previous_completed_table_candidates" :
    seasonReview.length > 0 ? "inspect_season_scope_for_review_candidates" :
    mappingReview.length > 0 ? "inspect_mapping_for_review_candidates" :
    "bulk_controlled_api_hint_fetch_wave"
};

const outPath = path.join(OUT_DIR, `concurrent-table-schema-review-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `concurrent-table-schema-review-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `concurrent-table-schema-accepted-${DATE}.jsonl`);
const reviewPath = path.join(OUT_DIR, `concurrent-table-schema-review-needed-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, seasonReview, mappingReview, blockedSatisfied, blockedTask, reviews }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviews.map((r) => JSON.stringify(r)).join("\n") + (reviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(reviewPath, [...seasonReview, ...mappingReview].map((r) => JSON.stringify(r)).join("\n") + ((seasonReview.length + mappingReview.length) ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), acceptedOutput: rel(acceptedPath), reviewOutput: rel(reviewPath), summary }, null, 2));
