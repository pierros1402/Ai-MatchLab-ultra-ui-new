#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-official-rendered-expansion-board-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function readJsonlSafe(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && /\.(json|jsonl)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function slugRank(slug) {
  const [cc, tierRaw] = String(slug || "").split(".");
  const tier = Number(tierRaw || 99);
  const top = new Set(["eng","esp","ger","ita","fra","ned","por","bel","aut","sui","tur","gre","den","swe","nor","fin","pol","cze","cro","sco"]);
  const global = new Set(["arg","bra","mex","usa","jpn","kor","chn","aus","can","ksa","qat"]);
  let score = 0;
  if (top.has(cc)) score += 100000;
  else if (global.has(cc)) score += 80000;
  else score += 30000;
  score += Math.max(0, 1000 - tier * 100);
  return score;
}

function addCandidate(map, c) {
  if (!c || !c.competitionSlug || !c.sourceUrl) return;
  const key = `${c.competitionSlug}|${c.sourceUrl}`;
  const prev = map.get(key);
  const next = {
    competitionSlug: c.competitionSlug,
    competitionName: c.competitionName || c.name || null,
    familyId: c.familyId || c.sourceFamily || c.family || "unknown_official_rendered",
    sourceFamily: c.sourceFamily || c.familyId || c.family || "unknown_official_rendered",
    sourceHost: c.sourceHost || null,
    sourceUrl: c.sourceUrl,
    routeType: c.routeType || "official_browser_rendered_table",
    adapter: c.adapter || null,
    expectedRows: Number(c.expectedRows || c.expectedRowCount || 0) || null,
    expectedTeamSignals: Array.isArray(c.expectedTeamSignals) ? c.expectedTeamSignals : [],
    blockedUntilInspected: Boolean(c.blockedUntilInspected),
    sourceEvidence: c.sourceEvidence || [],
    priorityScore: Number(c.priorityScore || 0) + slugRank(c.competitionSlug)
  };
  if (!prev || next.priorityScore > prev.priorityScore) map.set(key, next);
}

const centralConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");
const centralConfig = readJsonSafe(centralConfigPath);
const configuredSlugs = new Set();
if (centralConfig) {
  const families = Array.isArray(centralConfig) ? centralConfig : (centralConfig.families || centralConfig.routeFamilies || centralConfig.sourceFamilies || []);
  for (const family of families) {
    const routes = family.competitions || family.routes || family.targets || [];
    for (const r of routes) {
      if (r.competitionSlug || r.slug) configuredSlugs.add(r.competitionSlug || r.slug);
    }
  }
}

const boardPath = path.join(ROOT, "data", "football-truth", "_diagnostics", `prioritized-lifecycle-execution-board-${DATE}`, `source-family-expansion-board-${DATE}.jsonl`);
const sourceFamilyRows = readJsonlSafe(boardPath);

const candidates = new Map();

for (const row of sourceFamilyRows) {
  const targets = row.targets || row.competitions || row.targetSlugs || [];
  const slugs = targets.map((x) => typeof x === "string" ? x : (x.competitionSlug || x.slug)).filter(Boolean);
  for (const slug of slugs) {
    addCandidate(candidates, {
      competitionSlug: slug,
      familyId: row.familyId,
      sourceFamily: row.familyId,
      blockedUntilInspected: row.blockedUntilInspected,
      sourceUrl: row.sourceUrl || row.url || null,
      sourceHost: row.sourceHost || null,
      priorityScore: row.blockedUntilInspected ? 10000 : 50000,
      sourceEvidence: ["prioritized_lifecycle_source_family_expansion_board"]
    });
  }
}

const knownBulkSeeds = [
  {
    competitionSlug: "ned.1",
    competitionName: "Eredivisie",
    familyId: "eredivisie_official_rendered",
    sourceHost: "eredivisie.nl",
    sourceUrl: "https://eredivisie.nl/competitie/stand/",
    expectedRows: 18,
    blockedUntilInspected: true,
    sourceEvidence: ["source_family_board_blocked_until_rendered_cell_inspection"]
  },
  {
    competitionSlug: "ita.1",
    competitionName: "Serie A",
    familyId: "serie_a_official_rendered",
    sourceHost: "legaseriea.it",
    sourceUrl: "https://www.legaseriea.it/en/serie-a/league-table",
    expectedRows: 20,
    blockedUntilInspected: true,
    sourceEvidence: ["source_family_board_blocked_until_currentness_zero_table_inspection"]
  },
  {
    competitionSlug: "eng.1",
    competitionName: "Premier League",
    familyId: "premierleague_official_rendered",
    sourceHost: "premierleague.com",
    sourceUrl: "https://www.premierleague.com/tables",
    expectedRows: 20,
    blockedUntilInspected: true,
    sourceEvidence: ["source_family_board_blocked_until_currentness_zero_table_inspection"]
  },
  {
    competitionSlug: "aut.1",
    competitionName: "Austrian Bundesliga",
    familyId: "official_rendered_candidate",
    sourceHost: "bundesliga.at",
    sourceUrl: "https://www.bundesliga.at/de/tabelle/",
    expectedRows: 12,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  },
  {
    competitionSlug: "bel.1",
    competitionName: "Belgian Pro League",
    familyId: "official_rendered_candidate",
    sourceHost: "proleague.be",
    sourceUrl: "https://www.proleague.be/standings",
    expectedRows: 16,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  },
  {
    competitionSlug: "fra.1",
    competitionName: "Ligue 1",
    familyId: "official_rendered_candidate",
    sourceHost: "ligue1.com",
    sourceUrl: "https://www.ligue1.com/ranking",
    expectedRows: 18,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  },
  {
    competitionSlug: "por.1",
    competitionName: "Liga Portugal",
    familyId: "official_rendered_candidate",
    sourceHost: "ligaportugal.pt",
    sourceUrl: "https://www.ligaportugal.pt/en/liga/classificacao/20252026/ligaportugalbetclic",
    expectedRows: 18,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  },
  {
    competitionSlug: "den.1",
    competitionName: "Danish Superliga",
    familyId: "official_rendered_candidate",
    sourceHost: "superliga.dk",
    sourceUrl: "https://superliga.dk/stilling",
    expectedRows: 12,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  },
  {
    competitionSlug: "pol.1",
    competitionName: "Ekstraklasa",
    familyId: "official_rendered_candidate",
    sourceHost: "ekstraklasa.org",
    sourceUrl: "https://www.ekstraklasa.org/tabela",
    expectedRows: 18,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  },
  {
    competitionSlug: "cze.1",
    competitionName: "Czech First League",
    familyId: "official_rendered_candidate",
    sourceHost: "chanceliga.cz",
    sourceUrl: "https://www.chanceliga.cz/tabulka",
    expectedRows: 16,
    blockedUntilInspected: true,
    sourceEvidence: ["high_value_lifecycle_due_task_official_rendered_candidate"]
  }
];

for (const seed of knownBulkSeeds) addCandidate(candidates, seed);

const diagnosticFiles = walk(path.join(ROOT, "data", "football-truth", "_diagnostics"));
for (const p of diagnosticFiles) {
  const text = fs.readFileSync(p, "utf8");
  if (!/(official_rendered|sourceFamily|sourceUrl|standings|table|standing)/i.test(text)) continue;
  const urlMatches = [...text.matchAll(/https?:\/\/[^"'\s<>]+/g)].map((m) => m[0]);
  for (const url of urlMatches) {
    if (!/(stand|table|classement|tabelle|standing|ranking|classificacao|stilling|tabela)/i.test(url)) continue;
    const lower = url.toLowerCase();
    let slug = null, host = null;
    if (lower.includes("eredivisie.nl")) { slug = "ned.1"; host = "eredivisie.nl"; }
    else if (lower.includes("premierleague.com")) { slug = "eng.1"; host = "premierleague.com"; }
    else if (lower.includes("legaseriea.it")) { slug = "ita.1"; host = "legaseriea.it"; }
    else if (lower.includes("bundesliga.at")) { slug = "aut.1"; host = "bundesliga.at"; }
    else if (lower.includes("proleague.be")) { slug = "bel.1"; host = "proleague.be"; }
    else if (lower.includes("ligue1.com")) { slug = "fra.1"; host = "ligue1.com"; }
    else if (lower.includes("ligaportugal.pt")) { slug = "por.1"; host = "ligaportugal.pt"; }
    else if (lower.includes("superliga.dk")) { slug = "den.1"; host = "superliga.dk"; }
    else if (lower.includes("ekstraklasa.org")) { slug = "pol.1"; host = "ekstraklasa.org"; }
    else if (lower.includes("chanceliga.cz")) { slug = "cze.1"; host = "chanceliga.cz"; }
    if (slug) {
      addCandidate(candidates, {
        competitionSlug: slug,
        sourceUrl: url,
        sourceHost: host,
        familyId: "official_rendered_candidate",
        blockedUntilInspected: true,
        priorityScore: 5000,
        sourceEvidence: [`diagnostic_url_scan:${rel(p)}`]
      });
    }
  }
}

const rows = [...candidates.values()]
  .filter((r) => !configuredSlugs.has(r.competitionSlug))
  .sort((a, b) => b.priorityScore - a.priorityScore || a.competitionSlug.localeCompare(b.competitionSlug));

const grouped = Object.values(rows.reduce((acc, row) => {
  const key = row.familyId || row.sourceFamily || "unknown";
  acc[key] ||= {
    familyId: key,
    targetCount: 0,
    readyForRenderedInspectionCount: 0,
    blockedUntilInspectedCount: 0,
    targetSlugs: [],
    rows: []
  };
  acc[key].targetCount++;
  if (row.blockedUntilInspected) acc[key].blockedUntilInspectedCount++;
  else acc[key].readyForRenderedInspectionCount++;
  acc[key].targetSlugs.push(row.competitionSlug);
  acc[key].rows.push(row);
  return acc;
}, {})).sort((a, b) => b.targetCount - a.targetCount || a.familyId.localeCompare(b.familyId));

const bestBySlug = new Map();
for (const row of rows) {
  const slug = row.competitionSlug;
  if (!slug) continue;
  const url = String(row.sourceUrl || "");
  const urlPenalty =
    /archive|news|article|fixture|fixtures|match|matches|ticket|tickets|shop|video/i.test(url) ? 50000 : 0;
  const urlBoost =
    /(standing|standings|table|tabelle|classement|ranking|classificacao|stilling|tabela|stand\/|stand$)/i.test(url) ? 50000 : 0;
  const candidateScore = Number(row.priorityScore || 0) + urlBoost - urlPenalty;
  const candidate = { ...row, candidateScore };
  const prev = bestBySlug.get(slug);
  if (!prev || candidateScore > prev.candidateScore) bestBySlug.set(slug, candidate);
}

const countrySeen = new Map();
const uniqueRows = [...bestBySlug.values()].sort((a, b) => b.candidateScore - a.candidateScore || a.competitionSlug.localeCompare(b.competitionSlug));
const diversifiedRows = [];
for (const row of uniqueRows) {
  const country = String(row.competitionSlug || "").split(".")[0];
  const seen = countrySeen.get(country) || 0;
  if (seen >= 2) continue;
  countrySeen.set(country, seen + 1);
  diversifiedRows.push(row);
  if (diversifiedRows.length >= 24) break;
}

if (diversifiedRows.length < 24) {
  for (const row of uniqueRows) {
    if (diversifiedRows.some((x) => x.competitionSlug === row.competitionSlug)) continue;
    diversifiedRows.push(row);
    if (diversifiedRows.length >= 24) break;
  }
}

const inspectionPack = diversifiedRows.slice(0, 24).map((r, i) => ({
  rank: i + 1,
  ...r,
  recommendedAction: "render_and_capture_table_cell_shapes_before_parser_acceptance"
}));

const summary = {
  status: "passed",
  runner: "bulk_official_rendered_expansion_board",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  alreadyConfiguredSlugCount: configuredSlugs.size,
  candidateRowCount: rows.length,
  groupedFamilyCount: grouped.length,
  inspectionPackCount: inspectionPack.length,
  inspectionPackUniqueSlugCount: new Set(inspectionPack.map((r) => r.competitionSlug)).size,
  recommendedNextLane: "run_bulk_rendered_table_cell_shape_inspection_pack_then_accept_parser_families_in_batches"
};

const outPath = path.join(OUT_DIR, `bulk-official-rendered-expansion-board-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-official-rendered-expansion-candidates-${DATE}.jsonl`);
const groupedPath = path.join(OUT_DIR, `bulk-official-rendered-expansion-families-${DATE}.jsonl`);
const packPath = path.join(OUT_DIR, `bulk-rendered-cell-inspection-pack-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, grouped, inspectionPack }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
fs.writeFileSync(groupedPath, grouped.map((r) => JSON.stringify(r)).join("\n") + (grouped.length ? "\n" : ""), "utf8");
fs.writeFileSync(packPath, inspectionPack.map((r) => JSON.stringify(r)).join("\n") + (inspectionPack.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  candidatesOutput: rel(rowsPath),
  familiesOutput: rel(groupedPath),
  inspectionPackOutput: rel(packPath),
  summary
}, null, 2));
