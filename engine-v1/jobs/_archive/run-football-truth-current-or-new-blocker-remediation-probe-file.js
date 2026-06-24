import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/current-or-new-blocker-remediation-probe-${DATE}`;
const OUT = `${OUT_DIR}/current-or-new-blocker-remediation-probe-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/current-or-new-blocker-remediation-probe-candidate-rows-${DATE}.jsonl`;

if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");
const ALLOW_BROWSER = process.argv.includes("--allow-browser");

function abs(p) { return path.join(ROOT, p); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }
function normUrl(u, base) { try { const x = new URL(u, base); x.hash = ""; return x.toString(); } catch { return null; } }
function n(v) { const x = Number(String(v ?? "").replace(",", ".").trim()); return Number.isFinite(x) ? x : null; }

async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 FootballTruthBlockerRemediation/1.0", "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" } });
    const text = await res.text();
    clearTimeout(timer);
    return { url, finalUrl: res.url, status: res.status, ok: res.ok, contentType: res.headers.get("content-type") ?? "", bytes: Buffer.byteLength(text), elapsedMs: Date.now() - started, text };
  } catch (error) {
    clearTimeout(timer);
    return { url, finalUrl: url, status: 0, ok: false, contentType: "", bytes: 0, elapsedMs: Date.now() - started, error: error.name === "AbortError" ? "timeout" : error.message, text: "" };
  }
}

function parseAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const hrefMatch = m[1].match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const url = normUrl(hrefMatch[1], baseUrl);
    if (!url) continue;
    out.push({ url, text: stripTags(m[2]) });
  }
  return out;
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
      while ((cm = cellRe.exec(rowHtml))) cells.push(stripTags(cm[1]));
      const simple = cells.filter(x => x !== "");
      if (simple.length) rows.push(simple);
    }
    tables.push({ tableIndex: tables.length, rowCount: rows.length, maxCells: rows.reduce((m, r) => Math.max(m, r.length), 0), rows });
  }
  return tables;
}

function parseCfaStanding(html, url, slug, label) {
  const tables = parseTables(html, url);
  for (const table of tables) {
    const header = (table.rows[0] ?? []).join(" ").toLowerCase();
    if (!(header.includes("club name") && header.includes("games played") && header.includes("points"))) continue;
    const rows = [];
    for (const c of table.rows.slice(1)) {
      if (c.length < 9) continue;
      const position = n(c[0]);
      const teamName = String(c[1]).trim();
      const played = n(c[2]);
      const won = n(c[3]);
      const drawn = n(c[4]);
      const lost = n(c[5]);
      const goalsFor = n(c[6]);
      const goalsAgainst = n(c[7]);
      const points = n(c[8]);
      if (!teamName || position === null || played === null || points === null) continue;
      rows.push({ competitionSlug: slug, seasonScope: "current_or_new", seasonLabel: "2025-2026", sourceFamily: "cfa_cyprus_html", sourceKind: "official_cfa_html_table_standings_remediation_probe", sourceUrl: url, sourceHost: hostOf(url), routeLabel: label, position, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst, points });
    }
    if (rows.length) return { table, rows };
  }
  return { table: null, rows: [] };
}

function validateRows(rows, expectedCounts) {
  const blocks = [];
  if (!expectedCounts.includes(rows.length)) blocks.push(`row_count_${rows.length}_not_in_${expectedCounts.join("_")}`);
  const positions = rows.map(r => r.position).sort((a, b) => a - b);
  for (let i = 0; i < rows.length; i++) if (positions[i] !== i + 1) { blocks.push("positions_not_1_to_n"); break; }
  if (new Set(rows.map(r => r.teamName)).size !== rows.length) blocks.push("duplicate_team_names");
  let totalPlayed = 0, totalPoints = 0, maxPlayed = 0, maxPoints = 0;
  for (const r of rows) {
    totalPlayed += r.played ?? 0;
    totalPoints += r.points ?? 0;
    maxPlayed = Math.max(maxPlayed, r.played ?? 0);
    maxPoints = Math.max(maxPoints, r.points ?? 0);
    if (r.played !== r.won + r.drawn + r.lost) blocks.push(`${r.teamName}_wdl_failed`);
    if (r.points !== r.won * 3 + r.drawn) blocks.push(`${r.teamName}_points_failed`);
    if (r.goalDifference !== r.goalsFor - r.goalsAgainst) blocks.push(`${r.teamName}_gd_failed`);
  }
  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push("non_triviality_failed");
  return { passed: blocks.length === 0, blocks: [...new Set(blocks)].slice(0, 80), rowCount: rows.length, totalPlayed, totalPoints, maxPlayed, maxPoints, teamSignals: rows.slice(0, 8).map(r => r.teamName), duplicateGuardHash: sha256Text(rows.map(r => `${r.competitionSlug}|${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24) };
}

function cfaAnchorScore(a) {
  const t = `${a.text} ${a.url}`.toLowerCase();
  let score = 0;
  if (/β[΄'’]?\s*κατηγορίας|b[΄'’]?\s*κατηγορίας|second division|2nd division/.test(t)) score += 120;
  if (/2025[\s/-]*2026|25[\s/-]*26/.test(t)) score += 60;
  if (/championship|πρωτάθλημα|competition/.test(t)) score += 20;
  if (/κύπελλο|cup|youth|women|u17|u19|στοκ|γ[΄'’]?\s*κατηγορίας/.test(t)) score -= 100;
  if (/\/en\/competitions\/\d+/.test(t)) score += 25;
  return score;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p.replace(/\//g, path.sep))) ?? null;
}

function chromeDump(url) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, error: "chrome_not_found", url, html: "" };
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=9000", "--dump-dom", url];
  const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 18000 });
  return { ok: r.status === 0 && !!r.stdout, status: r.status, error: r.error?.message ?? (r.stderr || null), url, html: r.stdout ?? "" };
}

async function runCfaRemediation() {
  const seedUrls = ["https://www.cfa.com.cy/En/competitions", "https://www.cfa.com.cy/En/competitions/1", "https://www.cfa.com.cy/En/competitions/2", "https://www.cfa.com.cy/Gr/competitions", "https://www.cfa.com.cy/Gr/competitions/1", "https://www.cfa.com.cy/Gr/competitions/2"];
  const seedFetches = [];
  for (const url of seedUrls) seedFetches.push(await fetchText(url));
  const anchors = [];
  for (const f of seedFetches) {
    if (!f.ok) continue;
    for (const a of parseAnchors(f.text, f.finalUrl || f.url)) {
      if (hostOf(a.url) === "www.cfa.com.cy" && /\/(?:En|Gr)\/competitions\/\d+/i.test(a.url)) anchors.push({ ...a, sourceSeed: f.finalUrl || f.url, score: cfaAnchorScore(a) });
    }
  }
  const ranked = [...new Map(anchors.map(a => [a.url, a])).values()]
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, 24);

  const candidateFetches = [];
  for (const a of ranked) {
    const f = await fetchText(a.url);
    const parsed = parseCfaStanding(f.text, f.finalUrl || a.url, "cyp.2", a.text);
    const validation = validateRows(parsed.rows, [14, 16]);
    candidateFetches.push({
      sourceSeed: a.sourceSeed,
      url: a.url,
      finalUrl: f.finalUrl,
      anchorText: a.text,
      anchorScore: a.score,
      status: f.status,
      ok: f.ok,
      bytes: f.bytes,
      tableRowCount: parsed.table?.rowCount ?? 0,
      parsedRowCount: parsed.rows.length,
      validation,
      rowsPreview: parsed.rows.slice(0, 5),
      rows: parsed.rows
    });
  }

  const accepted = candidateFetches.filter(c => c.validation.passed);
  return {
    familyId: "cfa_cyprus_html",
    competitionSlug: "cyp.2",
    seedFetchCount: seedFetches.length,
    candidateUrlCount: ranked.length,
    acceptedCandidateCount: accepted.length,
    blockedCandidateCount: candidateFetches.length - accepted.length,
    acceptedCandidates: accepted.slice(0, 5).map(c => ({ url: c.finalUrl, anchorText: c.anchorText, parsedRowCount: c.parsedRowCount, validation: c.validation, rowsPreview: c.rowsPreview })),
    topBlockedCandidates: candidateFetches.filter(c => !c.validation.passed).slice(0, 8).map(c => ({ url: c.finalUrl, anchorText: c.anchorText, parsedRowCount: c.parsedRowCount, validation: c.validation, rowsPreview: c.rowsPreview })),
    allRows: accepted.flatMap(c => c.rows.map(r => ({ ...r, qualityGateStatus: "verified", validationStatus: "passed", proofStatus: "remediation_schema_probe_passed_diagnostic_only" }))),
    rawPayloadCommitted: false
  };
}

async function runTorneopalRemediation() {
  const urls = [
    { competitionSlug: "fin.1", url: "https://tulospalvelu.palloliitto.fi/category/M1!spljp23/tables" },
    { competitionSlug: "fin.2", url: "https://tulospalvelu.palloliitto.fi/category/M1L!spljp24/tables" }
  ];

  const probes = [];
  for (const item of urls) {
    const staticFetch = await fetchText(item.url);
    const browser = ALLOW_BROWSER ? chromeDump(item.url) : { ok: false, error: "browser_not_allowed", html: "" };
    const staticTables = parseTables(staticFetch.text, item.url);
    const browserTables = parseTables(browser.html, item.url);
    const browserText = stripTags(browser.html).slice(0, 1200);
    const apiHints = [...new Set([...(staticFetch.text.match(/https?:\/\/[^"'\\\s]+|\/api\/[^"'\\\s]+|\/graphql[^"'\\\s]*/gi) ?? []), ...(browser.html.match(/https?:\/\/[^"'\\\s]+|\/api\/[^"'\\\s]+|\/graphql[^"'\\\s]*/gi) ?? [])])].slice(0, 50);
    probes.push({
      familyId: "torneopal",
      competitionSlug: item.competitionSlug,
      url: item.url,
      staticFetch: { status: staticFetch.status, ok: staticFetch.ok, bytes: staticFetch.bytes, title: stripTags(staticFetch.text.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? ""), tableCount: staticTables.length, firstTables: staticTables.slice(0, 2).map(t => ({ rowCount: t.rowCount, maxCells: t.maxCells, firstRows: t.rows.slice(0, 5) })) },
      browser: { allowed: ALLOW_BROWSER, ok: browser.ok, status: browser.status ?? null, error: browser.error ?? null, bytes: Buffer.byteLength(browser.html ?? ""), tableCount: browserTables.length, firstTables: browserTables.slice(0, 3).map(t => ({ rowCount: t.rowCount, maxCells: t.maxCells, firstRows: t.rows.slice(0, 5) })), textPreview: browserText },
      apiHintCount: apiHints.length,
      apiHints,
      decision: browserTables.length ? "browser_table_shape_review_needed" : "blocked_js_app_no_table_after_static_or_browser_dump",
      rawPayloadCommitted: false
    });
  }
  return {
    familyId: "torneopal",
    browserExecutedNowCount: ALLOW_BROWSER ? urls.length : 0,
    probeCount: probes.length,
    readyCandidateCount: probes.filter(p => p.decision === "browser_table_shape_review_needed").length,
    probes,
    rawPayloadCommitted: false
  };
}

const cfa = await runCfaRemediation();
const torneopal = await runTorneopalRemediation();
const acceptedRows = [...cfa.allRows];

writeJsonl(ROWS_OUT, acceptedRows);

const output = {
  status: "passed",
  runner: "current_or_new_blocker_remediation_probe",
  generatedAtUtc: new Date().toISOString(),
  purpose: "focused remediation for blocked cyp.2 and torneopal fin.1/fin.2 after current_or_new materialization; diagnostics only",
  cfa,
  torneopal,
  acceptedRowCount: acceptedRows.length,
  acceptedRowsByCompetition: acceptedRows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}),
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: acceptedRows.length
    ? {
        lane: "build_approval_gate_for_remediated_current_or_new_rows",
        readyCompetitionSlugs: [...new Set(acceptedRows.map(r => r.competitionSlug))].sort(),
        rule: "same diagnostic-only approval gate; no canonical/truth/production"
      }
    : {
        lane: "asset_api_mining_or_browser_adapter_for_torneopal_and_cfa_unresolved",
        readyCompetitionSlugs: [],
        rule: "do not accept point-deduction candidates without governed evidence; do not accept JS app shell without rendered rows/API contract"
      },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: cfa.seedFetchCount + cfa.candidateUrlCount + 2,
    browserExecutedNowCount: torneopal.browserExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: cfa.seedFetchCount + cfa.candidateUrlCount + 2,
  browserExecutedNowCount: torneopal.browserExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  cfa: {
    candidateUrlCount: cfa.candidateUrlCount,
    acceptedCandidateCount: cfa.acceptedCandidateCount,
    acceptedCandidates: cfa.acceptedCandidates,
    topBlockedCandidates: cfa.topBlockedCandidates.slice(0, 3)
  },
  torneopal: {
    browserExecutedNowCount: torneopal.browserExecutedNowCount,
    readyCandidateCount: torneopal.readyCandidateCount,
    probes: torneopal.probes.map(p => ({ competitionSlug: p.competitionSlug, decision: p.decision, staticFetch: p.staticFetch, browser: p.browser, apiHintCount: p.apiHintCount, apiHints: p.apiHints.slice(0, 10) }))
  },
  acceptedRowCount: output.acceptedRowCount,
  acceptedRowsByCompetition: output.acceptedRowsByCompetition,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  rawPayloadCommitted: false,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
