import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DISCOVERY = `data/football-truth/_diagnostics/blocked-families-controlled-official-source-discovery-${DATE}/blocked-families-controlled-official-source-discovery-${DATE}.json`;
const SHAPE = `data/football-truth/_diagnostics/blocked-families-exact-route-shape-probe-${DATE}/blocked-families-exact-route-shape-probe-${DATE}.json`;
const OUT_DIR = `data/football-truth/_diagnostics/blocked-families-local-context-schema-probe-${DATE}`;
const OUT = `${OUT_DIR}/blocked-families-local-context-schema-probe-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/blocked-families-local-context-schema-probe-rows-${DATE}.jsonl`;

if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function textBetween(html, tag) { const m = String(html).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return m ? stripTags(m[1]) : ""; }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }
function normUrl(u, base) { try { const x = new URL(u, base); x.hash = ""; return x.toString(); } catch { return null; } }
function num(v) { const n = Number(String(v ?? "").replace(",", ".").trim()); return Number.isFinite(n) ? n : null; }

async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 FootballTruthSchemaProbe/1.0", "accept": "text/html,application/xhtml+xml,*/*;q=0.8" } });
    const text = await res.text();
    clearTimeout(timer);
    return { url, finalUrl: res.url, status: res.status, ok: res.ok, contentType: res.headers.get("content-type") ?? "", bytes: Buffer.byteLength(text), elapsedMs: Date.now() - started, text };
  } catch (error) {
    clearTimeout(timer);
    return { url, finalUrl: url, status: 0, ok: false, contentType: "", bytes: 0, elapsedMs: Date.now() - started, error: error.name === "AbortError" ? "timeout" : error.message, text: "" };
  }
}

function parseTables(html, baseUrl = "") {
  const tables = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const tableHtml = tm[0];
    const rows = [];
    const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tableHtml))) {
      const rowHtml = rm[0];
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cm;
      while ((cm = cellRe.exec(rowHtml))) {
        const cellHtml = cm[1];
        const hrefs = [];
        const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
        let hm;
        while ((hm = hrefRe.exec(cellHtml))) {
          const u = normUrl(hm[1], baseUrl);
          if (u) hrefs.push(u);
        }
        cells.push({ text: stripTags(cellHtml), hrefs });
      }
      const simple = cells.map(c => c.text).filter(x => x !== "");
      if (simple.length) rows.push({ cells, simple });
    }
    tables.push({ tableIndex: tables.length, rowCount: rows.length, maxCells: rows.reduce((m, r) => Math.max(m, r.simple.length), 0), rows });
  }
  return tables;
}

function extractKsiCompetitionLinks(html, baseUrl) {
  const out = [];
  for (const table of parseTables(html, baseUrl)) {
    for (const row of table.rows) {
      const text = row.simple.join(" | ");
      const href = row.cells.flatMap(c => c.hrefs)[0] ?? null;
      if (!href) continue;
      if (/^Besta deild karla\b/i.test(text)) out.push({ slug: "isl.1", label: "Besta deild karla", url: href, source: "ksi_competition_list" });
      if (/^Lengjudeild karla\b/i.test(text)) out.push({ slug: "isl.2", label: "Lengjudeild karla", url: href, source: "ksi_competition_list" });
    }
  }
  return out;
}

function parseKsiStanding(table, slug, url, title, h1) {
  const rows = [];
  const header = table.rows[0]?.simple ?? [];
  if (!(header[0] === "Lið" && header.includes("+/-"))) return { rows, blocks: ["ksi_header_not_matched"] };
  for (const r of table.rows.slice(1)) {
    const c = r.simple;
    if (c.length < 8) continue;
    const m = String(c[0]).match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const position = num(m[1]);
    const teamName = m[2].trim();
    const played = num(c[1]);
    const won = num(c[2]);
    const drawn = num(c[3]);
    const lost = num(c[4]);
    const gm = String(c[5]).match(/^(\d+)\s*-\s*(\d+)$/);
    const goalsFor = gm ? num(gm[1]) : null;
    const goalsAgainst = gm ? num(gm[2]) : null;
    const goalDifference = num(c[6]);
    const points = num(c[7]);
    rows.push({ competitionSlug: slug, seasonScope: "current_or_new", seasonLabel: "2026", sourceFamily: "ksi", sourceKind: "official_ksi_html_table_standings", sourceUrl: url, sourceHost: hostOf(url), routeTitle: title, routeHeading: h1, position, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points });
  }
  return { rows, blocks: [] };
}

function parseCfaStanding(table, slug, url, title) {
  const rows = [];
  const header = (table.rows[0]?.simple ?? []).join(" ").toLowerCase();
  if (!(header.includes("club name") && header.includes("games played") && header.includes("points"))) return { rows, blocks: ["cfa_header_not_matched"] };
  for (const r of table.rows.slice(1)) {
    const c = r.simple;
    if (c.length < 9) continue;
    const position = num(c[0]);
    const teamName = String(c[1]).trim();
    const played = num(c[2]);
    const won = num(c[3]);
    const drawn = num(c[4]);
    const lost = num(c[5]);
    const goalsFor = num(c[6]);
    const goalsAgainst = num(c[7]);
    const points = num(c[8]);
    if (!teamName || position === null || played === null || points === null) continue;
    rows.push({ competitionSlug: slug, seasonScope: "current_or_new", seasonLabel: "2025-2026", sourceFamily: "cfa_cyprus_html", sourceKind: "official_cfa_html_table_standings", sourceUrl: url, sourceHost: hostOf(url), routeTitle: title, routeHeading: "", position, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference: goalsFor !== null && goalsAgainst !== null ? goalsFor - goalsAgainst : null, points });
  }
  return { rows, blocks: [] };
}

function validateRows(rows, expectedCounts) {
  const blocks = [];
  if (!expectedCounts.includes(rows.length)) blocks.push(`row_count_${rows.length}_not_in_${expectedCounts.join("_")}`);
  const positions = rows.map(r => r.position).sort((a, b) => a - b);
  for (let i = 0; i < rows.length; i++) if (positions[i] !== i + 1) blocks.push("positions_not_1_to_n");
  const teams = new Set(rows.map(r => r.teamName));
  if (teams.size !== rows.length) blocks.push("duplicate_team_names");
  let totalPlayed = 0, totalPoints = 0, maxPlayed = 0, maxPoints = 0;
  for (const r of rows) {
    totalPlayed += r.played ?? 0;
    totalPoints += r.points ?? 0;
    maxPlayed = Math.max(maxPlayed, r.played ?? 0);
    maxPoints = Math.max(maxPoints, r.points ?? 0);
    if (r.played !== (r.won ?? 0) + (r.drawn ?? 0) + (r.lost ?? 0)) blocks.push(`${r.teamName}_wdl_failed`);
    if (r.points !== (r.won ?? 0) * 3 + (r.drawn ?? 0)) blocks.push(`${r.teamName}_points_failed`);
    if (r.goalDifference !== null && r.goalsFor !== null && r.goalsAgainst !== null && r.goalDifference !== r.goalsFor - r.goalsAgainst) blocks.push(`${r.teamName}_gd_failed`);
  }
  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push("non_triviality_failed");
  return { passed: blocks.length === 0, blocks: [...new Set(blocks)].slice(0, 80), totalPlayed, totalPoints, maxPlayed, maxPoints, teamSignals: rows.slice(0, 8).map(r => r.teamName), duplicateGuardHash: sha256Text(rows.map(r => `${r.competitionSlug}|${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24) };
}

const discovery = readJson(DISCOVERY);
const previousShape = readJson(SHAPE);

const plan = [];
const add = (familyId, slug, url, reason) => {
  if (!url) return;
  const key = `${familyId}|${slug}|${url}`;
  if (!plan.some(p => p.key === key)) plan.push({ key, familyId, slug, url, reason });
};

add("ksi", "isl.2", "https://www.ksi.is/oll-mot/mot?id=7025540", "previous_shape_lengjudeild_exact_route");
add("cfa_cyprus_html", "cyp.1", "https://www.cfa.com.cy/En/competitions/1", "official_seed_first_division");
add("cfa_cyprus_html", "cyp.2", "https://www.cfa.com.cy/En/competitions/2", "official_seed_second_division");
add("torneopal", "fin.1", "https://tulospalvelu.palloliitto.fi/category/M1!spljp23/tables", "js_required_torneopal_route_probe");
add("torneopal", "fin.2", "https://tulospalvelu.palloliitto.fi/category/M1L!spljp24/tables", "js_required_torneopal_route_probe");

const ksiListUrls = [
  "https://www.ksi.is/oll-mot/?name=%C3%ADslandsm%C3%B3t&season=2026&pageSize=100",
  "https://www.ksi.is/oll-mot/?name=besta&season=2026&pageSize=100",
  "https://www.ksi.is/oll-mot/?name=lengjudeild&season=2026&pageSize=100"
];

for (const url of ksiListUrls) {
  const f = await fetchText(url);
  for (const link of extractKsiCompetitionLinks(f.text, f.finalUrl || url)) add("ksi", link.slug, link.url, `extracted_${link.label}`);
}

for (const row of previousShape.routeShapeRows ?? []) {
  if (row.familyId === "cfa_cyprus_html" && row.topTables?.[0]?.score >= 180) {
    if (/\/competitions\/1$/i.test(row.finalUrl)) add("cfa_cyprus_html", "cyp.1", row.finalUrl, "previous_shape_exact_cyp1_seed");
    if (/\/competitions\/2$/i.test(row.finalUrl)) add("cfa_cyprus_html", "cyp.2", row.finalUrl, "previous_shape_exact_cyp2_seed");
  }
}

const fetched = [];
for (const p of plan) fetched.push({ ...p, ...(await fetchText(p.url)) });

const candidateGroups = [];
const acceptedRows = [];
const routeRows = [];

for (const f of fetched) {
  const title = textBetween(f.text, "title");
  const h1 = textBetween(f.text, "h1");
  const tables = parseTables(f.text, f.finalUrl || f.url);
  let parsed = { rows: [], blocks: ["unsupported_family"] };
  let expectedCounts = [];

  if (f.familyId === "ksi") {
    const localTitle = `${title} ${h1}`;
    if (f.slug === "isl.1" && !/Besta deild karla/i.test(localTitle)) parsed = { rows: [], blocks: ["ksi_isl1_title_mismatch"] };
    else if (f.slug === "isl.2" && !/Lengjudeild karla/i.test(localTitle)) parsed = { rows: [], blocks: ["ksi_isl2_title_mismatch"] };
    else parsed = tables.map(t => parseKsiStanding(t, f.slug, f.finalUrl || f.url, title, h1)).find(x => x.rows.length) ?? { rows: [], blocks: ["no_ksi_standings_table"] };
    expectedCounts = [12];
  }

  if (f.familyId === "cfa_cyprus_html") {
    parsed = tables.map(t => parseCfaStanding(t, f.slug, f.finalUrl || f.url, title)).find(x => x.rows.length) ?? { rows: [], blocks: ["no_cfa_standings_table"] };
    expectedCounts = f.slug === "cyp.1" ? [14] : [16, 14];
  }

  if (f.familyId === "torneopal") {
    parsed = { rows: [], blocks: ["torneopal_static_fetch_js_required_no_table_payload"] };
    expectedCounts = f.slug === "fin.1" ? [12] : [10];
  }

  const validation = parsed.rows.length ? validateRows(parsed.rows, expectedCounts) : { passed: false, blocks: parsed.blocks, totalPlayed: 0, totalPoints: 0, maxPlayed: 0, maxPoints: 0, teamSignals: [], duplicateGuardHash: null };
  const status = validation.passed ? "schema_candidate_passed_diagnostic_only" : "schema_candidate_blocked";
  const group = {
    familyId: f.familyId,
    competitionSlug: f.slug,
    url: f.url,
    finalUrl: f.finalUrl,
    status,
    fetchStatus: f.status,
    ok: f.ok,
    title,
    h1,
    tableCount: tables.length,
    parsedRowCount: parsed.rows.length,
    validation,
    reason: f.reason,
    rawPayloadCommitted: false
  };
  candidateGroups.push(group);
  routeRows.push({ ...group, rowsPreview: parsed.rows.slice(0, 5) });
  if (validation.passed) {
    for (const r of parsed.rows) acceptedRows.push({ ...r, qualityGateStatus: "verified", validationStatus: "passed", proofStatus: "schema_probe_passed_diagnostic_only" });
  }
}

const output = {
  status: "passed",
  runner: "blocked_families_local_context_schema_probe",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  inputs: { discovery: DISCOVERY, previousShape: SHAPE },
  plannedUrlCount: plan.length,
  fetchExecutedNowCount: fetched.length,
  fetched2xxCount: fetched.filter(x => x.ok).length,
  schemaPassedGroupCount: candidateGroups.filter(g => g.status === "schema_candidate_passed_diagnostic_only").length,
  schemaBlockedGroupCount: candidateGroups.filter(g => g.status === "schema_candidate_blocked").length,
  acceptedRowCount: acceptedRows.length,
  acceptedRowsByCompetition: acceptedRows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}),
  candidateGroups,
  routeRows,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: {
    lane: acceptedRows.length ? "build_modern_proof_or_approval_gate_from_schema_passed_groups" : "browser_or_api_probe_for_js_required_or_unresolved_routes",
    readyCompetitionSlugs: [...new Set(acceptedRows.map(r => r.competitionSlug))].sort(),
    rule: "schema-passed rows are still diagnostic only; proof/approval gate must preserve route identity, seasonScope/seasonLabel, expected rows, team signals, arithmetic, non-trivial and duplicate guard"
  },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetched.length,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);
writeJsonl(ROWS_OUT, acceptedRows);

console.log(JSON.stringify({
  status: output.status,
  plannedUrlCount: output.plannedUrlCount,
  fetchExecutedNowCount: output.fetchExecutedNowCount,
  fetched2xxCount: output.fetched2xxCount,
  schemaPassedGroupCount: output.schemaPassedGroupCount,
  schemaBlockedGroupCount: output.schemaBlockedGroupCount,
  acceptedRowCount: output.acceptedRowCount,
  acceptedRowsByCompetition: output.acceptedRowsByCompetition,
  candidateGroups: output.candidateGroups.map(g => ({ familyId: g.familyId, competitionSlug: g.competitionSlug, status: g.status, title: g.title, h1: g.h1, parsedRowCount: g.parsedRowCount, validation: g.validation, url: g.finalUrl })),
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  rawPayloadCommitted: false,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
