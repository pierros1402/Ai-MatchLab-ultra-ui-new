import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/blocked-family-source-contract-discovery-board-${DATE}`;
const OUT = `${OUT_DIR}/blocked-family-source-contract-discovery-board-${DATE}.json`;

const FAMILIES = {
  torneopal: {
    competitionSlugs: ["fin.1", "fin.2"],
    aliases: ["torneopal", "veikkaus", "fin.1", "fin.2", "veikkausliiga", "ykkosliiga", "finland"],
    blockedReason: "exact_runner_missing",
    requiredBeforeProof: ["exact_source_contract", "route_identity_contract", "modern_row_output_contract", "season_scope_contract"]
  },
  ksi: {
    competitionSlugs: ["isl.1", "isl.2"],
    aliases: ["ksi", "ksí", "isl.1", "isl.2", "iceland", "besta", "deild", "pepsideild", "knattspyrnusamband"],
    blockedReason: "exact_runner_missing",
    requiredBeforeProof: ["exact_source_contract", "route_identity_contract", "modern_row_output_contract", "season_scope_contract"]
  },
  cfa_cyprus_html: {
    competitionSlugs: ["cyp.1", "cyp.2"],
    aliases: ["cfa", "cyprus", "cypriot", "cyp.1", "cyp.2", "first division", "second division"],
    blockedReason: "exact_runner_missing",
    requiredBeforeProof: ["exact_source_contract", "route_identity_contract", "modern_row_output_contract", "season_scope_contract"]
  }
};

function abs(rel) {
  return path.join(ROOT, rel);
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

function writeJson(relPath, value) {
  fs.mkdirSync(path.dirname(abs(relPath)), { recursive: true });
  fs.writeFileSync(abs(relPath), JSON.stringify(value, null, 2) + "\n");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function walk(dir, out = []) {
  const p = abs(dir);
  if (!fs.existsSync(p)) return out;
  for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", "dist", "build", "coverage"].includes(ent.name)) continue;
    const child = path.join(p, ent.name);
    if (ent.isDirectory()) walk(rel(child), out);
    else out.push(rel(child));
  }
  return out;
}

function safeReadText(relPath, maxBytes = 2_000_000) {
  try {
    const p = abs(relPath);
    const stat = fs.statSync(p);
    if (stat.size > maxBytes) return { text: "", skipped: true, size: stat.size };
    return { text: fs.readFileSync(p, "utf8"), skipped: false, size: stat.size };
  } catch (error) {
    return { text: "", skipped: true, size: 0, error: error.message };
  }
}

function tokenizeAliases(aliases) {
  return aliases.map(a => a.toLowerCase());
}

function matchesFamily(relPath, text, family) {
  const hay = `${relPath}\n${text.slice(0, 250000)}`.toLowerCase();
  return tokenizeAliases(family.aliases).some(alias => hay.includes(alias.toLowerCase()));
}

function countSignals(text) {
  const lower = text.toLowerCase();
  const counts = {};
  for (const token of [
    "standing", "standings", "table", "position", "rank", "played", "won", "drawn", "lost",
    "points", "goalsfor", "goalsagainst", "goaldifference", "fixture", "result", "schedule",
    "canonicalwrite", "productionwrite", "truthassertion", "seasonscope", "seasonlabel"
  ]) {
    counts[token] = (lower.match(new RegExp(token, "g")) ?? []).length;
  }
  return counts;
}

function standingSignalScore(keys, text) {
  const k = keys.map(x => String(x).toLowerCase());
  let score = 0;
  for (const key of ["competitionslug", "leagueSlug", "competition", "teamname", "team", "position", "rank", "played", "won", "drawn", "lost", "goalsfor", "goalsagainst", "goaldifference", "points"]) {
    if (k.includes(key.toLowerCase())) score += 10;
  }
  const lower = text.toLowerCase();
  for (const token of ["standings", "standing", "table", "points", "played", "position"]) {
    if (lower.includes(token)) score += 5;
  }
  return score;
}

function flattenArrays(x, pointer = "root", out = [], depth = 0) {
  if (!x || typeof x !== "object" || depth > 8) return out;
  if (Array.isArray(x)) {
    if (x.length >= 8 && x[0] && typeof x[0] === "object") {
      out.push({
        pointer,
        length: x.length,
        keys: Object.keys(x[0]).slice(0, 60),
        sample: x[0]
      });
    }
    x.slice(0, 5).forEach((v, i) => flattenArrays(v, `${pointer}[${i}]`, out, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(x)) flattenArrays(v, `${pointer}.${k}`, out, depth + 1);
  return out;
}

const searchRoots = [
  "engine-v1/jobs",
  "engine-v1/config",
  "data/football-truth/_diagnostics",
  "data/football-truth/_state"
];

const allFiles = searchRoots.flatMap(root => walk(root));
const blocks = [];
const warnings = [];

const familyBoards = Object.entries(FAMILIES).map(([familyId, family]) => {
  const matchedFiles = [];
  const sourceFileCandidates = [];
  const jsonCandidates = [];
  const standingArrayCandidates = [];
  const fixtureResultOnlyCandidates = [];
  const skippedLargeJson = [];

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    if (![".js", ".json", ".jsonl", ".html", ".txt"].includes(ext)) continue;

    const read = safeReadText(file, ext === ".json" ? 5_000_000 : 1_000_000);
    if (!matchesFamily(file, read.text, family)) continue;

    const signals = countSignals(read.text);
    matchedFiles.push({
      file,
      bytes: read.size,
      skippedContent: read.skipped,
      signals
    });

    if (file.startsWith("engine-v1/jobs/") || file.startsWith("engine-v1/config/")) {
      sourceFileCandidates.push({
        file,
        bytes: read.size,
        signals,
        sha256Prefix: read.text ? sha256Text(read.text).slice(0, 16) : null
      });
    }

    if (ext === ".json") {
      if (read.skipped) {
        skippedLargeJson.push({ file, bytes: read.size });
        continue;
      }
      try {
        const json = JSON.parse(read.text);
        const arrays = flattenArrays(json)
          .map(a => ({
            pointer: a.pointer,
            length: a.length,
            keys: a.keys,
            standingSignalScore: standingSignalScore(a.keys, JSON.stringify(a.sample).slice(0, 4000)),
            sample: a.sample
          }))
          .sort((a, b) => b.standingSignalScore - a.standingSignalScore)
          .slice(0, 10);

        const highStandingArrays = arrays.filter(a => a.standingSignalScore >= 45);
        const fixtureArrays = arrays.filter(a => {
          const keys = a.keys.map(k => String(k).toLowerCase());
          return ["hometeam", "awayteam", "scorehome", "scoreaway", "kickoffutc", "status", "date"].filter(k => keys.includes(k)).length >= 3;
        });

        jsonCandidates.push({
          file,
          bytes: read.size,
          status: json.status ?? json.summary?.status ?? json.summary?.[`${familyId}Status`] ?? null,
          summaryKeys: json.summary ? Object.keys(json.summary).slice(0, 40) : [],
          arrayCandidateCount: arrays.length,
          topArrays: arrays.slice(0, 5).map(a => ({
            pointer: a.pointer,
            length: a.length,
            keys: a.keys,
            standingSignalScore: a.standingSignalScore,
            samplePrefix: JSON.stringify(a.sample).slice(0, 500)
          }))
        });

        for (const a of highStandingArrays) {
          standingArrayCandidates.push({
            file,
            pointer: a.pointer,
            length: a.length,
            keys: a.keys,
            standingSignalScore: a.standingSignalScore,
            samplePrefix: JSON.stringify(a.sample).slice(0, 700)
          });
        }

        for (const a of fixtureArrays) {
          fixtureResultOnlyCandidates.push({
            file,
            pointer: a.pointer,
            length: a.length,
            keys: a.keys,
            samplePrefix: JSON.stringify(a.sample).slice(0, 500)
          });
        }
      } catch (error) {
        jsonCandidates.push({
          file,
          bytes: read.size,
          parseError: error.message
        });
      }
    }
  }

  const exactRunnerCandidates = sourceFileCandidates.filter(x => {
    const file = x.file.toLowerCase();
    return file.includes(familyId.toLowerCase()) || family.aliases.some(alias => file.includes(alias.toLowerCase().replace(".", "-")));
  });

  const hasModernSafeRunner = exactRunnerCandidates.some(x => {
    const s = x.signals;
    return (s.seasonscope > 0 || s.seasonlabel > 0) &&
      s.productionwrite > 0 &&
      s.truthassertion > 0 &&
      (s.played > 0 || s.points > 0);
  });

  const hasStandingArrays = standingArrayCandidates.length > 0;

  let recommendedStatus = "blocked_exact_runner_missing";
  let recommendedNext = "build_exact_source_contract_discovery_before_any_modern_proof";
  if (hasStandingArrays && !hasModernSafeRunner) {
    recommendedStatus = "contract_discovery_candidate_from_existing_artifacts";
    recommendedNext = "inspect_top_standing_array_candidates_and_build_exact_modern_proof_contract";
  }
  if (!hasStandingArrays && fixtureResultOnlyCandidates.length > 0) {
    recommendedStatus = "no_standings_shape_found_fixture_result_or_route_artifacts_only";
    recommendedNext = "run_separate_official_standings_source_discovery_not_adapter_promotion";
  }

  return {
    familyId,
    competitionSlugs: family.competitionSlugs,
    blockedReason: family.blockedReason,
    requiredBeforeProof: family.requiredBeforeProof,
    matchedFileCount: matchedFiles.length,
    sourceFileCandidateCount: sourceFileCandidates.length,
    jsonCandidateCount: jsonCandidates.length,
    standingArrayCandidateCount: standingArrayCandidates.length,
    fixtureResultOnlyCandidateCount: fixtureResultOnlyCandidates.length,
    skippedLargeJsonCount: skippedLargeJson.length,
    exactRunnerCandidateCount: exactRunnerCandidates.length,
    hasModernSafeRunner,
    recommendedStatus,
    recommendedNext,
    topSourceFileCandidates: sourceFileCandidates
      .sort((a, b) => (b.signals.standings + b.signals.points + b.signals.played + b.signals.seasonscope + b.signals.seasonlabel) - (a.signals.standings + a.signals.points + a.signals.played + a.signals.seasonscope + a.signals.seasonlabel))
      .slice(0, 12),
    topJsonCandidates: jsonCandidates
      .sort((a, b) => (b.topArrays?.[0]?.standingSignalScore ?? 0) - (a.topArrays?.[0]?.standingSignalScore ?? 0))
      .slice(0, 12),
    topStandingArrayCandidates: standingArrayCandidates
      .sort((a, b) => b.standingSignalScore - a.standingSignalScore)
      .slice(0, 12),
    fixtureResultOnlyCandidates: fixtureResultOnlyCandidates.slice(0, 8),
    skippedLargeJson: skippedLargeJson.slice(0, 8)
  };
});

for (const board of familyBoards) {
  if (board.hasModernSafeRunner) {
    warnings.push(`${board.familyId}_may_have_safe_runner_candidate_but_still_needs_exact_contract_review`);
  }
  if (board.recommendedStatus === "blocked_exact_runner_missing" && board.matchedFileCount === 0) {
    warnings.push(`${board.familyId}_no_existing_artifacts_found`);
  }
}

const status = blocks.length ? "blocked" : "passed";

const output = {
  status,
  runner: "blocked_family_source_contract_discovery_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "inspect blocked exact-runner-missing families and identify whether existing artifacts contain standings-shaped source contracts; no fetch/search/browser/canonical/production/truth writes",
  targetFamilies: Object.keys(FAMILIES),
  familyBoards,
  aggregate: {
    familyCount: familyBoards.length,
    contractDiscoveryCandidateFamilyCount: familyBoards.filter(b => b.recommendedStatus === "contract_discovery_candidate_from_existing_artifacts").length,
    noStandingShapeFamilyCount: familyBoards.filter(b => b.recommendedStatus === "no_standings_shape_found_fixture_result_or_route_artifacts_only").length,
    stillExactRunnerMissingFamilyCount: familyBoards.filter(b => b.recommendedStatus === "blocked_exact_runner_missing").length,
    totalStandingArrayCandidateCount: familyBoards.reduce((sum, b) => sum + b.standingArrayCandidateCount, 0),
    totalSourceFileCandidateCount: familyBoards.reduce((sum, b) => sum + b.sourceFileCandidateCount, 0)
  },
  nextRecommendedLane: {
    lane: "family_specific_exact_contract_review",
    orderedFamilies: familyBoards
      .slice()
      .sort((a, b) => b.standingArrayCandidateCount - a.standingArrayCandidateCount || b.sourceFileCandidateCount - a.sourceFileCandidateCount)
      .map(b => b.familyId),
    rule: "only build a modern proof runner for a family after exact source route, season scope, row shape, arithmetic, non-triviality, duplicate signature and no-write contracts are present"
  },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0,
    proofOnly: true
  },
  blocks,
  warnings,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status,
  aggregate: output.aggregate,
  familySummary: familyBoards.map(b => ({
    familyId: b.familyId,
    competitionSlugs: b.competitionSlugs,
    matchedFileCount: b.matchedFileCount,
    sourceFileCandidateCount: b.sourceFileCandidateCount,
    jsonCandidateCount: b.jsonCandidateCount,
    standingArrayCandidateCount: b.standingArrayCandidateCount,
    fixtureResultOnlyCandidateCount: b.fixtureResultOnlyCandidateCount,
    exactRunnerCandidateCount: b.exactRunnerCandidateCount,
    hasModernSafeRunner: b.hasModernSafeRunner,
    recommendedStatus: b.recommendedStatus,
    recommendedNext: b.recommendedNext,
    topStandingArrayCandidateFiles: b.topStandingArrayCandidates.slice(0, 5).map(x => ({ file: x.file, pointer: x.pointer, length: x.length, score: x.standingSignalScore }))
  })),
  nextRecommendedLane: output.nextRecommendedLane,
  blocks,
  warnings,
  output: OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (status !== "passed") {
  process.exit(1);
}
