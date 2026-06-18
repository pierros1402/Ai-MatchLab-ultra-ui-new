import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-api-table-signal-standings-review-${DATE}`);

const args = new Set(process.argv.slice(2));
if (!args.has("--allow-fetch")) throw new Error("Refusing table-signal standings review fetch without --allow-fetch");

const MAX_TARGETS = Number(process.env.BULK_API_TABLE_SIGNAL_REVIEW_MAX || "120");
const CONCURRENCY = Number(process.env.BULK_API_TABLE_SIGNAL_REVIEW_CONCURRENCY || "16");
const TIMEOUT_MS = Number(process.env.BULK_API_TABLE_SIGNAL_REVIEW_TIMEOUT_MS || "9000");

const EXPECTED_ROWS = {
  "arg.1": 30, "arg.2": 36,
  "aus.1": 12, "aus.2": 14,
  "aut.1": 12, "aut.2": 16,
  "bel.1": 16, "bel.2": 16,
  "can.1": 8, "can.2": 12,
  "cro.1": 10, "cro.2": 12,
  "eng.1": 20, "eng.2": 24, "eng.3": 24, "eng.4": 24, "eng.5": 24,
  "fra.1": 18, "fra.2": 18,
  "geo.1": 10, "geo.2": 10,
  "irl.1": 10, "irl.2": 10,
  "ita.1": 20, "ita.2": 20,
  "jpn.1": 20, "jpn.2": 20,
  "nor.1": 16, "nor.2": 16,
  "pol.1": 18, "pol.2": 18,
  "por.1": 18, "por.2": 18,
  "qat.1": 12,
  "sco.1": 12, "sco.2": 10,
  "ser.1": 16,
  "sui.1": 12, "sui.2": 10,
  "ukr.1": 16, "ukr.2": 16,
  "usa.1": 30, "usa.2": 24,
  "wal.1": 12
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
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function toInt(v) {
  const raw = String(v ?? "").replace(/[^\d-]/g, "");
  if (!raw || raw === "-") return null;
  return Number(raw);
}
function findHeaderIndex(header, patterns) {
  const h = header.map(norm);
  for (const p of patterns) {
    const idx = h.findIndex((x) => p.test(x));
    if (idx >= 0) return idx;
  }
  return -1;
}
function inferMapping(rows) {
  const header = rows[0] || [];
  const headerIdx = {
    position: findHeaderIndex(header, [/^#$/, /^pos$/, /^rank$/, /^position$/, /^p$/]),
    team: findHeaderIndex(header, [/^club$/, /^team$/, /^squadra$/, /^societa$/, /^verein$/, /^name$/]),
    played: findHeaderIndex(header, [/^p(l|layed|lays)?$/, /^mp$/, /^matches$/, /^games$/, /^g$/, /^pg$/, /^pld$/, /^partite$/]),
    won: findHeaderIndex(header, [/^w$/, /^won$/, /^wins$/, /^v$/, /^victories$/]),
    drawn: findHeaderIndex(header, [/^d$/, /^draw$/, /^drawn$/, /^draws$/, /^n$/, /^x$/]),
    lost: findHeaderIndex(header, [/^l$/, /^lost$/, /^losses$/, /^p$/, /^defeats$/]),
    goalsFor: findHeaderIndex(header, [/^gf$/, /^for$/, /^goals for$/, /^f$/, /^rf$/, /^goals\+$/]),
    goalsAgainst: findHeaderIndex(header, [/^ga$/, /^against$/, /^goals against$/, /^a$/, /^ra$/, /^goals-$/]),
    goalDifference: findHeaderIndex(header, [/^gd$/, /^diff$/, /^goal difference$/, /^dr$/, /^\+\/-$/]),
    points: findHeaderIndex(header, [/^pts$/, /^points$/, /^pt$/, /^p\.ti$/, /^pnti$/, /^pnts$/])
  };
  if ([headerIdx.team, headerIdx.played, headerIdx.won, headerIdx.drawn, headerIdx.lost, headerIdx.points].every((x) => x >= 0)) {
    return { method: "header", idx: headerIdx };
  }

  const sample = rows.slice(1).filter((r) => r.length >= 6);
  const maxCols = Math.max(0, ...rows.map((r) => r.length));
  const candidates = [];
  for (let team = 0; team < maxCols; team++) {
    const teamOk = sample.slice(0, 14).filter((r) => /[A-Za-zÀ-ÿΑ-Ωα-ωა-ჰ]/.test(String(r[team] || "")) && !/^\d+$/.test(String(r[team] || "").trim())).length >= Math.min(8, sample.length);
    if (!teamOk) continue;
    const numericCols = [];
    for (let c = 0; c < maxCols; c++) {
      if (c === team) continue;
      const ok = sample.slice(0, 14).filter((r) => toInt(r[c]) !== null).length >= Math.min(8, sample.length);
      if (ok) numericCols.push(c);
    }
    for (const played of numericCols) for (const won of numericCols) for (const drawn of numericCols) for (const lost of numericCols) for (const points of numericCols) {
      if (new Set([played, won, drawn, lost, points]).size < 5) continue;
      let checked = 0, pass = 0, nonZero = 0;
      for (const r of sample) {
        const p = toInt(r[played]), w = toInt(r[won]), d = toInt(r[drawn]), l = toInt(r[lost]), pts = toInt(r[points]);
        if ([p,w,d,l,pts].some((x) => x === null)) continue;
        checked++;
        if (p === w + d + l && pts === w * 3 + d) pass++;
        if (p > 0 || pts > 0) nonZero++;
      }
      if (checked >= Math.min(8, sample.length) && pass === checked && nonZero > 0) candidates.push({ idx: { position: 0, team, played, won, drawn, lost, goalsFor: -1, goalsAgainst: -1, goalDifference: -1, points }, checked });
    }
  }
  candidates.sort((a, b) => b.checked - a.checked);
  return candidates[0] ? { method: "arithmetic_inferred", idx: candidates[0].idx } : { method: "none", idx: headerIdx };
}
function parseTable(table, source) {
  const mapping = inferMapping(table);
  const rows = [];
  for (const r of table.slice(1)) {
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
    rows.push({
      competitionSlug: source.competitionSlug,
      sourceHost: source.officialHost,
      sourceUrl: source.finalUrl,
      position: mapping.idx.position >= 0 ? toInt(r[mapping.idx.position]) : rows.length + 1,
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
  return { mapping, rows };
}
function validate(source, table, parsed) {
  const expected = EXPECTED_ROWS[source.competitionSlug] || null;
  const expectedRowsPassed = expected ? parsed.rows.length === expected : parsed.rows.length >= 8 && parsed.rows.length <= 36;
  const arithmeticGatePassed = parsed.rows.length > 0 && parsed.rows.every((r) => r.played === r.won + r.drawn + r.lost && r.points === r.won * 3 + r.drawn);
  const nonTrivialGatePassed = parsed.rows.reduce((a, r) => a + r.played, 0) > 0 && parsed.rows.reduce((a, r) => a + r.points, 0) > 0;
  const fullText = norm(`${source.finalUrl} ${source.apiUrl} ${JSON.stringify(table.slice(0, 8))}`);
  const seasonScope =
    /2025\/26|2025-2026|2025\/2026|\/2025\/|2025/.test(fullText) && !/2026\/27|2026-2027/.test(fullText)
      ? "previous_completed_candidate"
      : /2026|2026\/27|2026-2027/.test(fullText)
        ? "current_or_new_or_next_review"
        : "season_scope_unknown";
  const status =
    expectedRowsPassed && arithmeticGatePassed && nonTrivialGatePassed && seasonScope === "previous_completed_candidate"
      ? "accepted_previous_completed_table_signal_candidate"
      : expectedRowsPassed && arithmeticGatePassed && nonTrivialGatePassed
        ? "review_season_scope_needed"
        : expectedRowsPassed && nonTrivialGatePassed
          ? "review_mapping_or_arithmetic_needed"
          : "rejected_shape_or_row_count";
  return { expected, expectedRowsPassed, arithmeticGatePassed, nonTrivialGatePassed, seasonScope, status };
}
async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 football-truth-api-table-signal-review/1.0", "accept": "text/html,application/json,text/plain,*/*" } });
    const contentType = res.headers.get("content-type") || "";
    const text = /html|text|json|javascript/i.test(contentType) ? await res.text() : "";
    return { status: res.status, finalUrl: res.url || url, contentType, text };
  } finally {
    clearTimeout(timer);
  }
}
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done++;
      if (done % 25 === 0 || done === items.length) console.error(`TABLE_SIGNAL_REVIEW_PROGRESS ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}
function dedupe(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()];
}

ensureDir(OUT_DIR);

const tableSignalsPath = latestFile(/bulk-api-hint-table-signal-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
const ledgerRowsPath = latestFile(/season-lane-coverage-ledger-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!tableSignalsPath) throw new Error("Missing bulk API table-signal candidates file");
if (!ledgerRowsPath) throw new Error("Missing season-lane ledger rows file");

const ledgerRows = readJsonl(ledgerRowsPath);
const previousSatisfied = new Set(ledgerRows.filter((r) => r.previousCompletedStandingsSatisfied).map((r) => r.competitionSlug));

const rawSignals = readJsonl(tableSignalsPath);
const eligible = rawSignals.filter((r) =>
  r.taskType === "acquire_previous_completed_standings" &&
  !previousSatisfied.has(r.competitionSlug) &&
  Number(r.tableCount || 0) > 0
);
const unique = dedupe(eligible, (r) => `${r.competitionSlug}|${r.finalUrl || r.apiUrl}`);
unique.sort((a, b) =>
  Number(b.has2025) - Number(a.has2025) ||
  Number(b.standingSignalCount || 0) - Number(a.standingSignalCount || 0) ||
  Number(b.tableCount || 0) - Number(a.tableCount || 0) ||
  Number(b.trCount || 0) - Number(a.trCount || 0) ||
  String(a.competitionSlug).localeCompare(String(b.competitionSlug))
);

const selected = unique.slice(0, MAX_TARGETS);

async function reviewOne(target) {
  try {
    const fetched = await fetchHtml(target.finalUrl || target.apiUrl);
    const tables = extractTables(fetched.text);
    const tableReviews = tables.map((table, tableIndex) => {
      const parsed = parseTable(table, { ...target, finalUrl: fetched.finalUrl });
      const validation = validate({ ...target, finalUrl: fetched.finalUrl }, table, parsed);
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
        parsedRowsPreview: parsed.rows.slice(0, 30)
      };
    }).sort((a, b) =>
      Number(b.status === "accepted_previous_completed_table_signal_candidate") - Number(a.status === "accepted_previous_completed_table_signal_candidate") ||
      Number(b.status === "review_season_scope_needed") - Number(a.status === "review_season_scope_needed") ||
      Number(b.expectedRowsPassed) - Number(a.expectedRowsPassed) ||
      Number(b.arithmeticGatePassed) - Number(a.arithmeticGatePassed) ||
      b.parsedRowCount - a.parsedRowCount
    );

    const best = tableReviews[0] || null;
    return {
      competitionSlug: target.competitionSlug,
      taskType: target.taskType,
      officialHost: target.officialHost,
      apiUrl: target.apiUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      contentType: fetched.contentType,
      sourceTableCount: target.tableCount,
      fetchedTableCount: tables.length,
      bestStatus: best?.status || "no_tables_after_refetch",
      bestParsedRowCount: best?.parsedRowCount || 0,
      bestExpectedRowsPassed: Boolean(best?.expectedRowsPassed),
      bestArithmeticGatePassed: Boolean(best?.arithmeticGatePassed),
      bestNonTrivialGatePassed: Boolean(best?.nonTrivialGatePassed),
      bestSeasonScope: best?.seasonScope || null,
      tableReviews: tableReviews.slice(0, 5)
    };
  } catch (error) {
    return { ...target, bestStatus: "fetch_failed", errorMessage: String(error?.message || error).slice(0, 240), tableReviews: [] };
  }
}

const reviews = await runPool(selected, reviewOne, CONCURRENCY);
const accepted = reviews.filter((r) => r.bestStatus === "accepted_previous_completed_table_signal_candidate");
const seasonReview = reviews.filter((r) => r.bestStatus === "review_season_scope_needed");
const mappingReview = reviews.filter((r) => r.bestStatus === "review_mapping_or_arithmetic_needed");

const summary = {
  status: "passed",
  runner: "bulk_api_table_signal_standings_review",
  sourceTableSignalsPath: rel(tableSignalsPath),
  sourceLedgerRowsPath: rel(ledgerRowsPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: selected.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  rawTableSignalCount: rawSignals.length,
  eligiblePreviousCompletedSignalCount: eligible.length,
  uniqueEligibleTargetCount: unique.length,
  reviewedTargetCount: reviews.length,
  acceptedPreviousCompletedTableSignalCandidateCount: accepted.length,
  seasonScopeReviewCount: seasonReview.length,
  mappingOrArithmeticReviewCount: mappingReview.length,
  acceptedCompetitionSlugs: accepted.map((r) => r.competitionSlug),
  reviewCompetitionSlugs: [...new Set([...seasonReview, ...mappingReview].map((r) => r.competitionSlug))].sort(),
  recommendedNextLane:
    accepted.length > 0 ? "build_adapter_proofs_for_api_table_signal_accepted_candidates" :
    seasonReview.length > 0 ? "adjudicate_season_scope_for_api_table_signal_candidates" :
    mappingReview.length > 0 ? "inspect_api_table_signal_mapping_review" :
    "expand_official_host_registry_with_new_standings_routes"
};

const outPath = path.join(OUT_DIR, `bulk-api-table-signal-standings-review-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-api-table-signal-standings-review-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `bulk-api-table-signal-standings-accepted-${DATE}.jsonl`);
const reviewPath = path.join(OUT_DIR, `bulk-api-table-signal-standings-review-needed-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, seasonReview, mappingReview, reviews }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviews.map((r) => JSON.stringify(r)).join("\n") + (reviews.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(reviewPath, [...seasonReview, ...mappingReview].map((r) => JSON.stringify(r)).join("\n") + ((seasonReview.length + mappingReview.length) ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), acceptedOutput: rel(acceptedPath), reviewOutput: rel(reviewPath), summary }, null, 2));
