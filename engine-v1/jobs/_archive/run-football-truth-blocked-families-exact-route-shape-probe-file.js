import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DISCOVERY = `data/football-truth/_diagnostics/blocked-families-controlled-official-source-discovery-${DATE}/blocked-families-controlled-official-source-discovery-${DATE}.json`;
const OUT_DIR = `data/football-truth/_diagnostics/blocked-families-exact-route-shape-probe-${DATE}`;
const OUT = `${OUT_DIR}/blocked-families-exact-route-shape-probe-${DATE}.json`;

if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");

const FAMILY_EXPECTATIONS = {
  ksi: {
    competitionSlugs: ["isl.1", "isl.2"],
    expectedRowCounts: [12, 10],
    exactRouteSignals: {
      "isl.1": ["Besta deildin", "Besta deild karla", "Besta deild"],
      "isl.2": ["Lengjudeild karla", "Lengjudeildin", "1. deild karla"]
    },
    rejectSignals: ["kvenna", "u19", "u17", "development", "3. deild", "4. deild", "5. deild"]
  },
  cfa_cyprus_html: {
    competitionSlugs: ["cyp.1", "cyp.2"],
    expectedRowCounts: [14, 16],
    exactRouteSignals: {
      "cyp.1": ["Α΄Κατηγορίας", "A΄Κατηγορίας", "First Division", "1st Division", "Α' Κατηγορίας"],
      "cyp.2": ["Β΄ Κατηγορίας", "B΄ Κατηγορίας", "Second Division", "2nd Division", "Β' Κατηγορίας"]
    },
    rejectSignals: ["Youth", "Women", "U17", "U19", "Cup", "Κύπελλο", "ΣΤΟΚ", "Γ΄"]
  },
  torneopal: {
    competitionSlugs: ["fin.1", "fin.2"],
    expectedRowCounts: [12, 10],
    exactRouteSignals: {
      "fin.1": ["Veikkausliiga"],
      "fin.2": ["Ykkösliiga", "Ykkosliiga"]
    },
    rejectSignals: ["Kansallinen", "Naisten", "Cup", "youth", "junior"]
  }
};

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function textBetween(html, tag) { const m = String(html).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return m ? stripTags(m[1]) : ""; }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }

async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthShapeProbe/1.0",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      }
    });
    const text = await res.text();
    clearTimeout(timer);
    return { url, finalUrl: res.url, status: res.status, ok: res.ok, contentType: res.headers.get("content-type") ?? "", bytes: Buffer.byteLength(text), elapsedMs: Date.now() - started, text };
  } catch (error) {
    clearTimeout(timer);
    return { url, finalUrl: url, status: 0, ok: false, contentType: "", bytes: 0, elapsedMs: Date.now() - started, error: error.name === "AbortError" ? "timeout" : error.message, text: "" };
  }
}

function parseTables(html) {
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
        const cell = stripTags(cm[1]);
        if (cell !== "") cells.push(cell);
      }
      if (cells.length) rows.push(cells);
    }
    tables.push({
      rowCount: rows.length,
      maxCells: rows.reduce((m, r) => Math.max(m, r.length), 0),
      firstRows: rows.slice(0, 12)
    });
  }
  return tables;
}

function tableScore(table) {
  const flat = table.firstRows.flat().join(" ").toLowerCase();
  let score = 0;
  if (table.rowCount >= 8) score += 30;
  if (table.rowCount >= 10) score += 20;
  if (table.maxCells >= 6) score += 25;
  if (/\bpts\b|points|stig|βαθ|pts\./i.test(flat)) score += 30;
  if (/played|matches|leikir|pld|pl|αγώνες|αγ\./i.test(flat)) score += 20;
  if (/won|drawn|lost|w\b|d\b|l\b|νίκ|ισοπ|ήττ/i.test(flat)) score += 20;
  if (/goals|gf|ga|\+\/-|mark|τέρματα/i.test(flat)) score += 15;
  const numericFirstCells = table.firstRows.filter(r => /^\d{1,2}\.?$/.test(String(r[0] ?? "").trim())).length;
  if (numericFirstCells >= 5) score += 25;
  return score;
}

function routeSlugSignals(text, familyId) {
  const exp = FAMILY_EXPECTATIONS[familyId];
  const out = {};
  for (const slug of exp.competitionSlugs) {
    out[slug] = (exp.exactRouteSignals[slug] ?? []).filter(sig => text.toLowerCase().includes(sig.toLowerCase()));
  }
  return out;
}

function rejectSignals(text, familyId) {
  return FAMILY_EXPECTATIONS[familyId].rejectSignals.filter(sig => text.toLowerCase().includes(sig.toLowerCase()));
}

function classifyRoute(row, html, tables) {
  const familyId = row.familyId;
  const text = `${row.url}\n${row.finalUrl}\n${textBetween(html, "title")}\n${textBetween(html, "h1")}\n${stripTags(html).slice(0, 2500)}`;
  const slugSignals = routeSlugSignals(text, familyId);
  const rejects = rejectSignals(text, familyId);
  const bestTable = tables.slice().sort((a, b) => tableScore(b) - tableScore(a))[0] ?? null;
  const bestTableScore = bestTable ? tableScore(bestTable) : 0;
  const matchedSlugs = Object.entries(slugSignals).filter(([, hits]) => hits.length).map(([slug]) => slug);

  let status = "review_route_shape";
  const blocks = [];
  if (!row.ok) {
    status = "blocked_fetch_failed";
    blocks.push("fetch_failed");
  } else if (!matchedSlugs.length) {
    status = "review_missing_exact_competition_signal";
    blocks.push("missing_exact_competition_signal");
  } else if (rejects.length) {
    status = "review_reject_signal_present";
    blocks.push(`reject_signals_${rejects.join("|")}`);
  } else if (!bestTable || bestTableScore < 70) {
    status = "review_no_parseable_standings_table";
    blocks.push("no_parseable_standings_table");
  } else {
    status = "route_shape_candidate_ready_for_schema_probe";
  }

  return {
    status,
    matchedSlugs,
    slugSignals,
    rejectSignals: rejects,
    bestTableScore,
    blocks
  };
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const discovery = readJson(DISCOVERY);
const planned = [];
for (const fam of discovery.familyResults ?? []) {
  const seen = new Set();
  for (const candidate of (fam.topStrongCandidates ?? []).slice(0, 12)) {
    if (seen.has(candidate.finalUrl || candidate.url)) continue;
    seen.add(candidate.finalUrl || candidate.url);
    planned.push({ familyId: fam.familyId, competitionSlugs: fam.competitionSlugs, url: candidate.finalUrl || candidate.url, discoveryScore: candidate.score, discoverySignals: { standingSignals: candidate.standingSignals, statSignals: candidate.statSignals, tableTagCount: candidate.tableTagCount, trTagCount: candidate.trTagCount, routeWordHits: candidate.routeWordHits } });
  }
}

const fetched = await pool(planned, 16, async p => {
  const res = await fetchText(p.url);
  const html = res.text ?? "";
  const title = textBetween(html, "title");
  const h1 = textBetween(html, "h1");
  const h2 = textBetween(html, "h2");
  const tables = parseTables(html).map((t, idx) => ({ tableIndex: idx, ...t, score: tableScore(t) })).sort((a, b) => b.score - a.score);
  const route = classifyRoute({ ...p, ...res }, html, tables);
  return {
    ...p,
    finalUrl: res.finalUrl,
    host: hostOf(res.finalUrl || p.url),
    status: res.status,
    ok: res.ok,
    contentType: res.contentType,
    bytes: res.bytes,
    elapsedMs: res.elapsedMs,
    error: res.error ?? null,
    sha256Prefix: html ? sha256Text(html).slice(0, 16) : null,
    title,
    h1,
    h2,
    tableCount: tables.length,
    topTables: tables.slice(0, 4).map(t => ({ tableIndex: t.tableIndex, rowCount: t.rowCount, maxCells: t.maxCells, score: t.score, firstRows: t.firstRows.slice(0, 8) })),
    routeClassification: route,
    rawPayloadCommitted: false
  };
});

const familySummaries = Object.keys(FAMILY_EXPECTATIONS).map(familyId => {
  const rows = fetched.filter(r => r.familyId === familyId);
  const ready = rows.filter(r => r.routeClassification.status === "route_shape_candidate_ready_for_schema_probe");
  return {
    familyId,
    plannedUrlCount: planned.filter(p => p.familyId === familyId).length,
    fetchedUrlCount: rows.length,
    fetched2xxCount: rows.filter(r => r.ok).length,
    parseableRouteShapeCandidateCount: ready.length,
    reviewRouteCount: rows.filter(r => r.routeClassification.status.startsWith("review_")).length,
    blockedRouteCount: rows.filter(r => r.routeClassification.status.startsWith("blocked_")).length,
    topReadyCandidates: ready.slice(0, 8).map(r => ({
      url: r.url,
      finalUrl: r.finalUrl,
      title: r.title,
      h1: r.h1,
      matchedSlugs: r.routeClassification.matchedSlugs,
      bestTableScore: r.routeClassification.bestTableScore,
      topTables: r.topTables.slice(0, 2)
    })),
    topReviewCandidates: rows.filter(r => r.routeClassification.status !== "route_shape_candidate_ready_for_schema_probe").slice(0, 8).map(r => ({
      url: r.url,
      finalUrl: r.finalUrl,
      title: r.title,
      h1: r.h1,
      status: r.routeClassification.status,
      blocks: r.routeClassification.blocks,
      matchedSlugs: r.routeClassification.matchedSlugs,
      bestTableScore: r.routeClassification.bestTableScore,
      topTables: r.topTables.slice(0, 1)
    }))
  };
});

const output = {
  status: "passed",
  runner: "blocked_families_exact_route_shape_probe",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  inputDiscovery: DISCOVERY,
  plannedUrlCount: planned.length,
  fetchExecutedNowCount: fetched.length,
  fetched2xxCount: fetched.filter(r => r.ok).length,
  parseableRouteShapeCandidateCount: fetched.filter(r => r.routeClassification.status === "route_shape_candidate_ready_for_schema_probe").length,
  familySummaries,
  routeShapeRows: fetched,
  nextRecommendedLane: {
    lane: "schema_probe_for_parseable_route_shape_candidates",
    orderedFamilies: familySummaries.slice().sort((a, b) => b.parseableRouteShapeCandidateCount - a.parseableRouteShapeCandidateCount).map(f => f.familyId),
    rule: "only build a proof runner after a schema probe maps team/position/played/won/drawn/lost/goals/points and passes arithmetic/non-trivial/duplicate gates"
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

console.log(JSON.stringify({
  status: output.status,
  plannedUrlCount: output.plannedUrlCount,
  fetchExecutedNowCount: output.fetchExecutedNowCount,
  fetched2xxCount: output.fetched2xxCount,
  parseableRouteShapeCandidateCount: output.parseableRouteShapeCandidateCount,
  familySummaries,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rawPayloadCommitted: false,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
