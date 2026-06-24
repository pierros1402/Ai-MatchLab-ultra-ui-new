import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `table-season-scope-adjudication-${DATE}`);

const EXPECTED_COMPLETED_PLAYED = {
  "ita.2": { minPlayed: 38, maxPlayed: 38, seasonKind: "european", expectedSeasonSignals: ["2025", "2025-2026", "2025/26", "2025/2026"] },
  "jpn.1": { minPlayed: 38, maxPlayed: 38, seasonKind: "calendar", expectedSeasonSignals: ["/2025/", "2025"] },
  "jpn.2": { minPlayed: 38, maxPlayed: 38, seasonKind: "calendar", expectedSeasonSignals: ["/2025/", "2025"] },
  "nor.1": { minPlayed: 30, maxPlayed: 30, seasonKind: "calendar", expectedSeasonSignals: ["/2025", "2025"] }
};

const BLOCKED_CURRENT_OR_DUPLICATE = new Set(["geo.1", "geo.2"]);

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

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function rowsSignature(rows) {
  return sha(rows.map((r) => `${norm(r.team)}:${r.played}:${r.won}:${r.drawn}:${r.lost}:${r.points}`).sort().join("|"));
}

function playedStats(rows) {
  const played = rows.map((r) => Number(r.played)).filter(Number.isFinite);
  return {
    minPlayed: played.length ? Math.min(...played) : null,
    maxPlayed: played.length ? Math.max(...played) : null,
    totalPlayed: played.reduce((a, b) => a + b, 0)
  };
}

function routeSeasonSignals(row) {
  const text = `${row.finalUrl || ""} ${row.sourceUrl || ""} ${JSON.stringify(row.tableReviews?.[0]?.previewRows || [])}`;
  const lower = norm(text);
  return {
    has2025: lower.includes("2025"),
    has2026: lower.includes("2026"),
    hasEuropean2025_2026: lower.includes("2025-2026") || lower.includes("2025/26") || lower.includes("2025/2026"),
    hasCalendar2025Route: /\/2025(\/|\?|$)/.test(row.finalUrl || "") || /\/2025(\/|\?|$)/.test(row.sourceUrl || "")
  };
}

function decide(row) {
  const best = row.tableReviews?.[0] || null;
  const parsedRows = best?.parsedRowsPreview || [];
  const stats = playedStats(parsedRows);
  const cfg = EXPECTED_COMPLETED_PLAYED[row.competitionSlug] || null;
  const sig = rowsSignature(parsedRows);
  const signals = routeSeasonSignals(row);

  const base = {
    competitionSlug: row.competitionSlug,
    taskType: row.taskType,
    officialHost: row.officialHost,
    finalUrl: row.finalUrl,
    sourceUrl: row.sourceUrl,
    bestParsedRowCount: row.bestParsedRowCount,
    bestExpectedRowsPassed: row.bestExpectedRowsPassed,
    bestArithmeticGatePassed: row.bestArithmeticGatePassed,
    bestNonTrivialGatePassed: row.bestNonTrivialGatePassed,
    bestSeasonScope: row.bestSeasonScope,
    tableIndex: best?.tableIndex ?? null,
    header: best?.header || [],
    parsedRowsPreview: parsedRows.slice(0, 24),
    rowSignature: sig,
    ...stats,
    routeSeasonSignals: signals
  };

  if (BLOCKED_CURRENT_OR_DUPLICATE.has(row.competitionSlug)) {
    return {
      ...base,
      adjudicationStatus: "blocked_current_or_duplicate_shared_table_risk",
      reason: "Georgia candidate is current_or_new or ambiguous shared table; not previous_completed."
    };
  }

  if (row.taskType !== "acquire_previous_completed_standings") {
    return {
      ...base,
      adjudicationStatus: "blocked_not_previous_completed_task",
      reason: "Candidate came from a start-date task, not standings expansion task."
    };
  }

  if (!cfg) {
    return {
      ...base,
      adjudicationStatus: "review_no_completed_played_contract",
      reason: "No full-season played-count contract configured for this slug."
    };
  }

  const fullPlayedGatePassed = stats.minPlayed === cfg.minPlayed && stats.maxPlayed === cfg.maxPlayed;
  const arithmeticGatePassed = Boolean(row.bestArithmeticGatePassed && row.bestExpectedRowsPassed && row.bestNonTrivialGatePassed);

  const seasonEvidencePassed =
    cfg.seasonKind === "calendar"
      ? signals.hasCalendar2025Route || (signals.has2025 && !signals.has2026)
      : signals.hasEuropean2025_2026 || signals.has2025;

  const accept =
    arithmeticGatePassed &&
    fullPlayedGatePassed &&
    seasonEvidencePassed;

  return {
    ...base,
    expectedCompletedPlayedContract: cfg,
    fullPlayedGatePassed,
    seasonEvidencePassed,
    arithmeticGatePassed,
    adjudicationStatus: accept ? "accepted_previous_completed_scope_candidate" : "review_or_reject_scope_not_proven",
    reason: accept
      ? "Full played-count, arithmetic, non-trivial and season evidence gates passed."
      : "One or more strict scope gates failed; do not promote."
  };
}

ensureDir(OUT_DIR);

const sourcePath = latestFile(/concurrent-table-schema-review-needed-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!sourcePath) throw new Error("Missing concurrent table schema review-needed file");

const sourceRows = readJsonl(sourcePath);
const decisions = sourceRows.map(decide);

const seenSignatures = new Map();
for (const d of decisions) {
  if (!d.rowSignature || d.adjudicationStatus !== "accepted_previous_completed_scope_candidate") continue;
  if (seenSignatures.has(d.rowSignature)) {
    d.adjudicationStatus = "blocked_duplicate_table_signature_after_scope_acceptance";
    d.duplicateOf = seenSignatures.get(d.rowSignature);
    d.reason = "Same parsed table signature as another accepted scope candidate.";
  } else {
    seenSignatures.set(d.rowSignature, d.competitionSlug);
  }
}

const accepted = decisions.filter((d) => d.adjudicationStatus === "accepted_previous_completed_scope_candidate");
const review = decisions.filter((d) => d.adjudicationStatus !== "accepted_previous_completed_scope_candidate");

const summary = {
  status: "passed",
  runner: "table_season_scope_adjudication",
  sourceReviewNeededPath: rel(sourcePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputReviewCandidateCount: sourceRows.length,
  acceptedPreviousCompletedScopeCandidateCount: accepted.length,
  reviewOrBlockedCandidateCount: review.length,
  acceptedCompetitionSlugs: accepted.map((d) => d.competitionSlug),
  reviewOrBlockedCompetitionSlugs: review.map((d) => d.competitionSlug),
  recommendedNextLane:
    accepted.length > 0
      ? "build_source_specific_adapter_proofs_for_scope_accepted_candidates_before_central_integration"
      : "continue_api_hint_fetch_wave_for_more_volume"
};

const outPath = path.join(OUT_DIR, `table-season-scope-adjudication-${DATE}.json`);
const acceptedPath = path.join(OUT_DIR, `table-season-scope-accepted-${DATE}.jsonl`);
const reviewPath = path.join(OUT_DIR, `table-season-scope-review-or-blocked-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, accepted, review, decisions }, null, 2) + "\n", "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(reviewPath, review.map((r) => JSON.stringify(r)).join("\n") + (review.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), acceptedOutput: rel(acceptedPath), reviewOutput: rel(reviewPath), summary }, null, 2));
