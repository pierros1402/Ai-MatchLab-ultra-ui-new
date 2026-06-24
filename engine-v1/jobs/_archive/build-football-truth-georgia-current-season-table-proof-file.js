import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `georgia-current-season-table-proof-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-fetch")) throw new Error("Refusing Georgia table proof fetch without --allow-fetch");

const TARGETS = [
  {
    competitionSlug: "geo.1",
    competitionName: "Erovnuli Liga",
    sourceUrl: "https://erovnuliliga.ge/en/tables",
    sourceHost: "erovnuliliga.ge",
    expectedRowCount: 10,
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    expectedTeamSignals: ["Rustavi", "Iberia 1999", "Dinamo BT", "Torpedo", "Dila"]
  },
  {
    competitionSlug: "geo.2",
    competitionName: "Erovnuli Liga 2",
    sourceUrl: "https://erovnuliliga.ge/en/tables",
    sourceHost: "erovnuliliga.ge",
    expectedRowCount: 10,
    seasonScope: "current_or_new",
    seasonLabel: "2026",
    expectedTeamSignals: []
  }
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }

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
      const cells = [];
      const cellRe = /<(?:th|td)\b[\s\S]*?<\/(?:th|td)>/gi;
      for (const cm of rm[0].matchAll(cellRe)) cells.push(cellText(cm[0]));
      if (cells.some(Boolean)) rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function n(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function toInt(value) {
  const raw = String(value ?? "").replace(/[^\d-]/g, "");
  if (!raw || raw === "-") return null;
  return Number(raw);
}

function headerIndex(header, patterns) {
  const normalized = header.map(n);
  for (const p of patterns) {
    const idx = normalized.findIndex((h) => p.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseTableRows(table, target, tableIndex) {
  const header = table[0] || [];
  const idx = {
    position: headerIndex(header, [/^pos$/, /^#$/, /^rank$/, /^position$/]),
    team: headerIndex(header, [/^club$/, /^team$/, /^name$/]),
    played: headerIndex(header, [/^plays$/, /^played$/, /^pl$/, /^p$/, /^mp$/, /^matches$/]),
    won: headerIndex(header, [/^wins$/, /^won$/, /^w$/]),
    drawn: headerIndex(header, [/^draws$/, /^drawn$/, /^d$/]),
    lost: headerIndex(header, [/^loses$/, /^lost$/, /^losses$/, /^l$/]),
    goalsFor: headerIndex(header, [/^gf$/, /^goals for$/, /^for$/]),
    goalsAgainst: headerIndex(header, [/^ga$/, /^goals against$/, /^against$/]),
    goalDifference: headerIndex(header, [/^gd$/, /^goal difference$/, /^diff$/]),
    points: headerIndex(header, [/^points$/, /^pts$/, /^pt$/])
  };

  const mappingComplete = Object.values(idx).every((x) => x >= 0);
  if (!mappingComplete) {
    return { mappingComplete, idx, rows: [], rejectedReason: "header_mapping_incomplete" };
  }

  const parsedRows = [];
  for (const r of table.slice(1)) {
    const team = String(r[idx.team] || "").trim();
    const played = toInt(r[idx.played]);
    const won = toInt(r[idx.won]);
    const drawn = toInt(r[idx.drawn]);
    const lost = toInt(r[idx.lost]);
    const goalsFor = toInt(r[idx.goalsFor]);
    const goalsAgainst = toInt(r[idx.goalsAgainst]);
    const goalDifference = toInt(r[idx.goalDifference]);
    const points = toInt(r[idx.points]);
    const position = toInt(r[idx.position]);

    if (!team || [played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points, position].some((x) => x === null)) continue;

    parsedRows.push({
      competitionSlug: target.competitionSlug,
      competitionName: target.competitionName,
      sourceHost: target.sourceHost,
      sourceUrl: target.sourceUrl,
      tableIndex,
      seasonScope: target.seasonScope,
      seasonLabel: target.seasonLabel,
      qualityGateStatus: "verified",
      validationStatus: "passed",
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

  return { mappingComplete, idx, rows: parsedRows, rejectedReason: null };
}

function validateRows(rows, target) {
  const expectedRowCountPassed = rows.length === target.expectedRowCount;
  const arithmeticRows = rows.map((r) => ({
    team: r.team,
    wdlOk: r.played === r.won + r.drawn + r.lost,
    pointsOk: r.points === r.won * 3 + r.drawn,
    gdOk: r.goalDifference === r.goalsFor - r.goalsAgainst
  }));
  const arithmeticGatePassed = arithmeticRows.length === rows.length && arithmeticRows.every((r) => r.wdlOk && r.pointsOk && r.gdOk);
  const nonTrivialGatePassed =
    rows.reduce((a, r) => a + r.played, 0) > 0 &&
    rows.reduce((a, r) => a + r.points, 0) > 0 &&
    rows.some((r) => r.played > 0) &&
    Math.max(...rows.map((r) => r.points)) > 0;

  const teamText = rows.map((r) => r.team).join(" | ").toLowerCase();
  const teamSignalHits = target.expectedTeamSignals.filter((team) => teamText.includes(team.toLowerCase()));
  const teamSignalsPassed = target.expectedTeamSignals.length === 0 ? true : teamSignalHits.length >= Math.min(3, target.expectedTeamSignals.length);

  return {
    expectedRowCountPassed,
    arithmeticGatePassed,
    nonTrivialGatePassed,
    teamSignalsPassed,
    teamSignalHits,
    totalPlayed: rows.reduce((a, r) => a + r.played, 0),
    totalPoints: rows.reduce((a, r) => a + r.points, 0),
    maxPoints: Math.max(...rows.map((r) => r.points)),
    arithmeticRows
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 football-truth-georgia-proof/1.0", "accept": "text/html,*/*" }
  });
  const text = await res.text();
  return { status: res.status, finalUrl: res.url || url, contentType: res.headers.get("content-type") || "", text };
}

ensureDir(OUT_DIR);

const fetched = await fetchHtml(TARGETS[0].sourceUrl);
const tables = extractTables(fetched.text);

const competitions = [];
const acceptedRows = [];
const reviewRows = [];

for (const target of TARGETS) {
  const tableProofs = [];
  for (let i = 0; i < tables.length; i += 1) {
    const parsed = parseTableRows(tables[i], target, i);
    const validation = validateRows(parsed.rows, target);
    const accepted =
      parsed.mappingComplete &&
      validation.expectedRowCountPassed &&
      validation.arithmeticGatePassed &&
      validation.nonTrivialGatePassed &&
      validation.teamSignalsPassed;

    tableProofs.push({
      tableIndex: i,
      physicalRowCount: tables[i].length,
      header: tables[i][0] || [],
      parsedRowCount: parsed.rows.length,
      mappingComplete: parsed.mappingComplete,
      mapping: parsed.idx,
      accepted,
      validation,
      previewRows: tables[i].slice(0, 5),
      parsedRows: parsed.rows
    });
  }

  tableProofs.sort((a, b) =>
    Number(b.accepted) - Number(a.accepted) ||
    Number(b.validation.expectedRowCountPassed) - Number(a.validation.expectedRowCountPassed) ||
    Number(b.validation.arithmeticGatePassed) - Number(a.validation.arithmeticGatePassed) ||
    b.parsedRowCount - a.parsedRowCount
  );

  const best = tableProofs[0] || null;
  const competitionStatus = best?.accepted ? "verified_current_or_new_table_candidate" : "review_or_rejected";
  const comp = {
    competitionSlug: target.competitionSlug,
    competitionName: target.competitionName,
    seasonScope: target.seasonScope,
    seasonLabel: target.seasonLabel,
    sourceUrl: target.sourceUrl,
    sourceHost: target.sourceHost,
    fetchStatus: fetched.status,
    tableCount: tables.length,
    status: competitionStatus,
    bestTableIndex: best?.tableIndex ?? null,
    parsedRowCount: best?.parsedRowCount || 0,
    validation: best?.validation || null,
    note: target.seasonScope === "current_or_new" ? "Do not promote as previous_completed; table contains 2026 in-progress fixtures/results." : null
  };
  competitions.push(comp);

  if (best?.accepted) {
    acceptedRows.push(...best.parsedRows);
  } else if (best) {
    reviewRows.push({ ...comp, bestPreviewRows: best.previewRows });
  }
}

const summary = {
  status: "passed",
  runner: "georgia_current_season_table_proof",
  sourceUrl: TARGETS[0].sourceUrl,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 1,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  targetCount: TARGETS.length,
  verifiedCurrentOrNewCompetitionCount: competitions.filter((c) => c.status === "verified_current_or_new_table_candidate").length,
  verifiedCurrentOrNewCompetitionSlugs: competitions.filter((c) => c.status === "verified_current_or_new_table_candidate").map((c) => c.competitionSlug),
  acceptedRowsCount: acceptedRows.length,
  reviewCompetitionCount: competitions.filter((c) => c.status !== "verified_current_or_new_table_candidate").length,
  seasonScope: "current_or_new",
  previousCompletedPromotionBlocked: true,
  recommendedNextLane:
    acceptedRows.length > 0
      ? "integrate_current_or_new_season_table_lane_after_adapter_contract_review"
      : "inspect_georgia_table_tabs_or_route_parameters"
};

const outPath = path.join(OUT_DIR, `georgia-current-season-table-proof-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `georgia-current-season-table-proof-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, competitions, reviewRows, acceptedRowsPreview: acceptedRows.slice(0, 30) }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, acceptedRows.map((r) => JSON.stringify(r)).join("\n") + (acceptedRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
