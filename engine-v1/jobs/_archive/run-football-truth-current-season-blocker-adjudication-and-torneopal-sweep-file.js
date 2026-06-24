import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);

const REMEDIATION = `data/football-truth/_diagnostics/current-or-new-blocker-remediation-probe-${DATE}/current-or-new-blocker-remediation-probe-${DATE}.json`;
const OUT_DIR = `data/football-truth/_diagnostics/current-season-blocker-adjudication-and-torneopal-sweep-${DATE}`;
const OUT = `${OUT_DIR}/current-season-blocker-adjudication-and-torneopal-sweep-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/current-season-blocker-adjudication-and-torneopal-sweep-candidate-rows-${DATE}.jsonl`;

if (!process.argv.includes("--allow-browser")) throw new Error("Missing --allow-browser");

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { if (!fs.existsSync(abs(p))) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function n(v) { const x = Number(String(v ?? "").replace(",", ".").trim()); return Number.isFinite(x) ? x : null; }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }

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
  if (!chrome) return { ok: false, error: "chrome_not_found", html: "" };
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=10000", "--dump-dom", url];
  const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 22000 });
  return { ok: r.status === 0 && !!r.stdout, status: r.status, error: r.error?.message ?? (r.stderr || null), html: r.stdout ?? "" };
}

function parseTables(html) {
  const tables = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const rows = [];
    const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[0]))) {
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[0]))) {
        const text = stripTags(cm[1]);
        if (text) cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }
    tables.push({ tableIndex: tables.length, rowCount: rows.length, maxCells: rows.reduce((m, r) => Math.max(m, r.length), 0), rows });
  }
  return tables;
}

function parseFinnishTable(table, slug, url, routeLabel) {
  const header = table.rows[0] ?? [];
  const joined = header.join("|");
  if (!/#\|Joukkue\|O\|V\|T\|H\|M\|P/i.test(joined)) return [];
  const rows = [];
  for (const c of table.rows.slice(1)) {
    if (c.length < 8) continue;
    const position = n(c[0]);
    const teamName = String(c[1]).trim();
    const played = n(c[2]);
    const won = n(c[3]);
    const drawn = n(c[4]);
    const lost = n(c[5]);
    const gm = String(c[6]).match(/^(\d+)\s*[–-]\s*(\d+)$/);
    const goalsFor = gm ? n(gm[1]) : null;
    const goalsAgainst = gm ? n(gm[2]) : null;
    const points = n(c[7]);
    if (!teamName || position === null || played === null || points === null || goalsFor === null || goalsAgainst === null) continue;
    rows.push({
      competitionSlug: slug,
      seasonScope: "current_or_new",
      seasonLabel: "2026",
      sourceFamily: "torneopal",
      sourceKind: "official_torneopal_browser_rendered_table_standings",
      sourceUrl: url,
      sourceHost: hostOf(url),
      routeLabel,
      position,
      teamName,
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points
    });
  }
  return rows;
}

function validateRows(rows, expectedCounts) {
  const blocks = [];
  if (!expectedCounts.includes(rows.length)) blocks.push(`row_count_${rows.length}_not_in_${expectedCounts.join("_")}`);
  const positions = rows.map(r => r.position).sort((a, b) => a - b);
  for (let i = 0; i < rows.length; i++) {
    if (positions[i] !== i + 1) {
      blocks.push("positions_not_1_to_n");
      break;
    }
  }
  if (new Set(rows.map(r => r.teamName)).size !== rows.length) blocks.push("duplicate_team_names");
  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;
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
  return {
    passed: blocks.length === 0,
    blocks: [...new Set(blocks)].slice(0, 80),
    rowCount: rows.length,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    teamSignals: rows.slice(0, 8).map(r => r.teamName),
    duplicateGuardHash: sha256Text(rows.map(r => `${r.competitionSlug}|${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24)
  };
}

function adjudicateCyp2(remediation) {
  const accepted = remediation.cfa?.acceptedCandidates ?? [];
  const blocked = remediation.cfa?.topBlockedCandidates ?? [];
  const youthRe = /(?:Κ-\d+|K-\d+|Νέων|Παίδων|Youth|U-?\d+)/i;
  const adultBRe = /(?:Πρωτάθλημα\s+Β[΄'’]?\s*Κατηγορίας|Second\s+Division|2nd\s+Division)/i;

  const rejectedYouthAccepted = accepted.filter(c => youthRe.test(c.anchorText ?? "")).map(c => ({
    url: c.url,
    anchorText: c.anchorText,
    parsedRowCount: c.parsedRowCount,
    validation: c.validation,
    decision: "rejected_youth_competition_false_positive"
  }));

  const adultBlocked = blocked.filter(c => adultBRe.test(c.anchorText ?? "")).map(c => ({
    url: c.url,
    anchorText: c.anchorText,
    parsedRowCount: c.parsedRowCount,
    validation: c.validation,
    rowsPreview: c.rowsPreview,
    decision: "blocked_adult_second_division_points_carryover_or_phase_table_requires_governed_evidence"
  }));

  return {
    familyId: "cfa_cyprus_html",
    competitionSlug: "cyp.2",
    previousAcceptedCandidateCount: accepted.length,
    rejectedYouthAcceptedCount: rejectedYouthAccepted.length,
    rejectedYouthAccepted,
    adultSecondDivisionBlockedCount: adultBlocked.length,
    adultSecondDivisionBlocked: adultBlocked,
    acceptedForMaterializationCount: 0,
    decision: "do_not_materialize_cyp2_from_remediation_probe",
    reason: "remediation accepted candidates are youth competitions; exact adult B category route has official points that fail standard 3W+D arithmetic and likely needs phase/carryover handling or governed evidence"
  };
}

function runTorneopalSweep() {
  const candidates = [
    { slug: "fin.1", expectedRows: [12], requiredLabel: "Veikkausliiga", url: "https://tulospalvelu.palloliitto.fi/category/VL!spljp26/tables" },
    { slug: "fin.1", expectedRows: [12], requiredLabel: "Veikkausliiga", url: "https://tulospalvelu.palloliitto.fi/category/VL!spljp25/tables" },
    { slug: "fin.1", expectedRows: [12], requiredLabel: "Veikkausliiga", url: "https://tulospalvelu.palloliitto.fi/category/M1!spljp26/tables" },
    { slug: "fin.1", expectedRows: [12], requiredLabel: "Veikkausliiga", url: "https://tulospalvelu.palloliitto.fi/category/M1!spljp25/tables" },
    { slug: "fin.2", expectedRows: [10], requiredLabel: "Ykkösliiga", url: "https://tulospalvelu.palloliitto.fi/category/M1L!spljp26/tables" },
    { slug: "fin.2", expectedRows: [10], requiredLabel: "Ykkösliiga", url: "https://tulospalvelu.palloliitto.fi/category/M1L!spljp25/tables" },
    { slug: "fin.2", expectedRows: [10], requiredLabel: "Ykkösliiga", url: "https://tulospalvelu.palloliitto.fi/category/M1L!spljp24/tables" }
  ];

  const probes = [];
  const acceptedRows = [];

  for (const candidate of candidates) {
    const rendered = chromeDump(candidate.url);
    const html = rendered.html ?? "";
    const text = stripTags(html);
    const tables = parseTables(html);
    const labelMatch = text.toLowerCase().includes(candidate.requiredLabel.toLowerCase());
    const seasonCodeMatch = /spljp26/.test(candidate.url);
    const parsedTables = tables.map(table => {
      const rows = parseFinnishTable(table, candidate.slug, candidate.url, candidate.requiredLabel);
      const validation = validateRows(rows, candidate.expectedRows);
      return {
        tableIndex: table.tableIndex,
        rowCount: table.rowCount,
        maxCells: table.maxCells,
        parsedRowCount: rows.length,
        validation,
        rowsPreview: rows.slice(0, 5),
        rows
      };
    });

    const best = parsedTables
      .filter(t => t.parsedRowCount > 0)
      .sort((a, b) => Number(b.validation.passed) - Number(a.validation.passed) || b.parsedRowCount - a.parsedRowCount)[0] ?? null;

    const blocks = [];
    if (!rendered.ok) blocks.push("browser_render_failed");
    if (!labelMatch) blocks.push(`required_label_not_found_${candidate.requiredLabel}`);
    if (!seasonCodeMatch) blocks.push("not_2026_category_code");
    if (!best) blocks.push("no_parseable_finnish_standings_table");
    if (best && !best.validation.passed) blocks.push(...best.validation.blocks);

    const passed = blocks.length === 0;

    if (passed && best) {
      for (const row of best.rows) {
        acceptedRows.push({
          ...row,
          qualityGateStatus: "verified",
          validationStatus: "passed",
          proofStatus: "torneopal_2026_browser_sweep_schema_passed_diagnostic_only"
        });
      }
    }

    probes.push({
      familyId: "torneopal",
      competitionSlug: candidate.slug,
      url: candidate.url,
      requiredLabel: candidate.requiredLabel,
      expectedRows: candidate.expectedRows,
      browserOk: rendered.ok,
      browserStatus: rendered.status ?? null,
      browserError: rendered.error ?? null,
      browserBytes: Buffer.byteLength(html),
      labelMatch,
      seasonCodeMatch,
      tableCount: tables.length,
      topTables: parsedTables.map(t => ({
        tableIndex: t.tableIndex,
        rowCount: t.rowCount,
        maxCells: t.maxCells,
        parsedRowCount: t.parsedRowCount,
        validation: t.validation,
        rowsPreview: t.rowsPreview
      })).slice(0, 5),
      status: passed ? "schema_candidate_passed_diagnostic_only" : "schema_candidate_blocked",
      blocks: [...new Set(blocks)].slice(0, 40),
      textPreview: text.slice(0, 500),
      rawPayloadCommitted: false
    });
  }

  return {
    familyId: "torneopal",
    browserExecutedNowCount: candidates.length,
    probeCount: probes.length,
    schemaPassedGroupCount: probes.filter(p => p.status === "schema_candidate_passed_diagnostic_only").length,
    schemaBlockedGroupCount: probes.filter(p => p.status === "schema_candidate_blocked").length,
    acceptedRowCount: acceptedRows.length,
    acceptedRowsByCompetition: acceptedRows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}),
    probes,
    acceptedRows,
    rawPayloadCommitted: false
  };
}

const remediation = readJson(REMEDIATION);
const cyp2Adjudication = adjudicateCyp2(remediation);
const torneopal = runTorneopalSweep();
const acceptedRows = torneopal.acceptedRows;

writeJsonl(ROWS_OUT, acceptedRows);

const output = {
  status: "passed",
  runner: "current_season_blocker_adjudication_and_torneopal_sweep",
  generatedAtUtc: new Date().toISOString(),
  purpose: "adjudicate unsafe cyp.2 remediation false positives and run focused 2026 Torneopal browser-rendered route sweep; diagnostic only",
  inputRemediation: REMEDIATION,
  cyp2Adjudication,
  torneopal,
  acceptedRowCount: acceptedRows.length,
  acceptedRowsByCompetition: acceptedRows.reduce((a, r) => { a[r.competitionSlug] = (a[r.competitionSlug] ?? 0) + 1; return a; }, {}),
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: acceptedRows.length
    ? {
        lane: "build_approval_gate_for_torneopal_2026_schema_passed_rows",
        readyCompetitionSlugs: [...new Set(acceptedRows.map(r => r.competitionSlug))].sort(),
        rule: "diagnostic-only approval gate required before state materialization"
      }
    : {
        lane: "torneopal_route_contract_mining_and_cyp2_phase_points_evidence",
        readyCompetitionSlugs: [],
        rule: "do not materialize cyp.2 youth rows; do not accept adult cyp.2 phase/carryover points without governed evidence"
      },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: torneopal.browserExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: torneopal.browserExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  cyp2Adjudication,
  torneopal: {
    browserExecutedNowCount: torneopal.browserExecutedNowCount,
    schemaPassedGroupCount: torneopal.schemaPassedGroupCount,
    schemaBlockedGroupCount: torneopal.schemaBlockedGroupCount,
    acceptedRowCount: torneopal.acceptedRowCount,
    acceptedRowsByCompetition: torneopal.acceptedRowsByCompetition,
    topProbes: torneopal.probes.map(p => ({
      competitionSlug: p.competitionSlug,
      url: p.url,
      requiredLabel: p.requiredLabel,
      labelMatch: p.labelMatch,
      seasonCodeMatch: p.seasonCodeMatch,
      tableCount: p.tableCount,
      status: p.status,
      blocks: p.blocks,
      topTables: p.topTables.slice(0, 2),
      textPreview: p.textPreview
    }))
  },
  acceptedRowCount: output.acceptedRowCount,
  acceptedRowsByCompetition: output.acceptedRowsByCompetition,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
