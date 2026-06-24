import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `jleague-official-html-standings-proof-${DATE}`);

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
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

ensureDir(OUT_DIR);

const acceptedPath = latestFile(/table-season-scope-accepted-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!acceptedPath) throw new Error("Missing season-scope accepted candidates");

const accepted = readJsonl(acceptedPath);
const jpn1 = accepted.find((r) => r.competitionSlug === "jpn.1" && r.adjudicationStatus === "accepted_previous_completed_scope_candidate");
if (!jpn1) throw new Error("Missing accepted jpn.1 season-scope candidate");

const parsed = (jpn1.parsedRowsPreview || []).map((r, i) => ({
  competitionSlug: "jpn.1",
  competitionName: "J1 League",
  sourceHost: jpn1.officialHost || "jleague.co",
  sourceUrl: jpn1.finalUrl || jpn1.sourceUrl,
  sourceLane: "official_html_table_proof",
  adapter: "jleague_official_html_table",
  seasonScope: "previous_completed",
  seasonLabel: "2025",
  qualityGateStatus: "verified",
  validationStatus: "passed",
  tableIndex: jpn1.tableIndex ?? 0,
  position: Number(r.position || i + 1),
  team: String(r.team || "").trim(),
  played: Number(r.played),
  won: Number(r.won),
  drawn: Number(r.drawn),
  lost: Number(r.lost),
  goalsFor: r.goalsFor === null || r.goalsFor === undefined ? null : Number(r.goalsFor),
  goalsAgainst: r.goalsAgainst === null || r.goalsAgainst === undefined ? null : Number(r.goalsAgainst),
  goalDifference: r.goalDifference === null || r.goalDifference === undefined ? null : Number(r.goalDifference),
  points: Number(r.points)
}));

const expectedTeamSignals = ["Kashima Antlers", "Kashiwa Reysol", "Kyoto Sanga", "Sanfrecce Hiroshima", "Vissel Kobe", "Urawa Reds"];
const teamSet = new Set(parsed.map((r) => norm(r.team)));
const teamSignalsPassed = expectedTeamSignals.filter((t) => [...teamSet].some((x) => x.includes(norm(t)))).length >= 5;
const expectedRowsPassed = parsed.length === 20;
const arithmeticGatePassed = parsed.every((r) => r.played === r.won + r.drawn + r.lost && r.points === r.won * 3 + r.drawn);
const nonTrivialGatePassed = parsed.reduce((a, r) => a + r.played, 0) > 0 && parsed.reduce((a, r) => a + r.points, 0) > 0 && Math.max(...parsed.map((r) => r.points)) > 0;
const fullPlayedGatePassed = parsed.every((r) => r.played === 38);
const duplicateSignature = sha(parsed.map((r) => `${norm(r.team)}:${r.played}:${r.won}:${r.drawn}:${r.lost}:${r.points}`).sort().join("|"));

const status = expectedRowsPassed && teamSignalsPassed && arithmeticGatePassed && nonTrivialGatePassed && fullPlayedGatePassed ? "verified" : "review";
if (status !== "verified") {
  throw new Error(`JPN1 proof failed gates: ${JSON.stringify({ expectedRowsPassed, teamSignalsPassed, arithmeticGatePassed, nonTrivialGatePassed, fullPlayedGatePassed })}`);
}

const summary = {
  status: "passed",
  runner: "jleague_official_html_standings_proof",
  sourceAcceptedScopePath: rel(acceptedPath),
  sourceUrl: jpn1.finalUrl || jpn1.sourceUrl,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  verifiedCompetitionCount: 1,
  verifiedCompetitionSlugs: ["jpn.1"],
  acceptedRowsCount: parsed.length,
  seasonScope: "previous_completed",
  seasonLabel: "2025",
  officialHtmlRowsContractVersion: 1,
  duplicateSignature,
  validation: {
    expectedRowsPassed,
    teamSignalsPassed,
    arithmeticGatePassed,
    nonTrivialGatePassed,
    fullPlayedGatePassed,
    expectedTeamSignals
  },
  recommendedNextLane: "integrate_official_html_rows_into_season_lane_ledger"
};

const outPath = path.join(OUT_DIR, `jleague-official-html-standings-proof-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `jleague-official-html-standings-proof-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, rowsPreview: parsed.slice(0, 20) }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, parsed.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), summary }, null, 2));
