import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(MODULE_DIR, "..", "..");

function clean(value) {
  return String(value || "").trim();
}

function resolveDataPath(...parts) {
  return path.join(ROOT_DIR, "data", ...parts);
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return {
      __readError: err?.message || String(err),
      file
    };
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function researchResultsPath(dayKey) {
  return resolveDataPath("team-news", "_research-results", `${dayKey}.json`);
}

function reviewPath(dayKey) {
  return resolveDataPath("team-news", "_research-review", `${dayKey}.json`);
}

function manualResultsDir(dayKey) {
  return path.resolve(
    ROOT_DIR,
    "engine-v1",
    "seeds",
    "team-news",
    "manual-results",
    dayKey
  );
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function manualSeedKeys(dayKey) {
  const dir = manualResultsDir(dayKey);
  const out = new Set();

  if (!fs.existsSync(dir)) {
    return out;
  }

  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json") && !name.endsWith(".draft.json"))) {
    out.add(file.replace(/\.json$/, ""));
  }

  return out;
}

function evidenceItems(candidate) {
  const direct = Array.isArray(candidate?.evidence) ? candidate.evidence : [];
  const nested = Array.isArray(candidate?.candidate?.evidence) ? candidate.candidate.evidence : [];
  const output = Array.isArray(candidate?.candidateOutput?.evidence) ? candidate.candidateOutput.evidence : [];
  return [...direct, ...nested, ...output].filter(Boolean);
}

function absences(candidate) {
  const direct = Array.isArray(candidate?.absences) ? candidate.absences : [];
  const nested = Array.isArray(candidate?.candidate?.absences) ? candidate.candidate.absences : [];
  const output = Array.isArray(candidate?.candidateOutput?.absences) ? candidate.candidateOutput.absences : [];
  return [...direct, ...nested, ...output].filter(Boolean);
}

function notes(candidate) {
  const direct = Array.isArray(candidate?.notes) ? candidate.notes : [];
  const nested = Array.isArray(candidate?.candidate?.notes) ? candidate.candidate.notes : [];
  const output = Array.isArray(candidate?.candidateOutput?.notes) ? candidate.candidateOutput.notes : [];
  return [...direct, ...nested, ...output].filter(Boolean);
}

function rowTeamKey(row) {
  return normalizeKey(
    row?.team ||
    row?.targetTeam ||
    row?.task?.target?.team ||
    row?.task?.team ||
    row?.candidate?.team ||
    row?.candidateOutput?.team
  );
}

function rowMatchId(row) {
  return clean(
    row?.matchId ||
    row?.task?.match?.matchId ||
    row?.candidate?.matchId ||
    row?.candidateOutput?.matchId
  );
}

function rowTeam(row) {
  return clean(
    row?.team ||
    row?.targetTeam ||
    row?.task?.target?.team ||
    row?.task?.team ||
    row?.candidate?.team ||
    row?.candidateOutput?.team
  );
}

function rowSide(row) {
  return clean(
    row?.side ||
    row?.task?.target?.side ||
    row?.candidate?.side ||
    row?.candidateOutput?.side
  );
}

function rowLeague(row) {
  return clean(
    row?.leagueSlug ||
    row?.task?.match?.leagueSlug ||
    row?.candidate?.leagueSlug ||
    row?.candidateOutput?.leagueSlug
  );
}

function flag(row, name) {
  return row?.[name] === true ||
    row?.candidate?.[name] === true ||
    row?.candidateOutput?.[name] === true ||
    row?.meta?.[name] === true ||
    row?.candidate?.meta?.[name] === true ||
    row?.candidateOutput?.meta?.[name] === true;
}

function buildReviewRow(row, context) {
  const key = rowTeamKey(row);
  const team = rowTeam(row);
  const matchId = rowMatchId(row);
  const side = rowSide(row);
  const leagueSlug = rowLeague(row);
  const status = clean(row?.status);
  const canonicalWrite = row?.canonicalWrite || null;

  const evidence = evidenceItems(row);
  const absenceRows = absences(row);
  const noteRows = notes(row);

  const reviewed = flag(row, "reviewed");
  const productionGrade = flag(row, "productionGrade");
  const candidateOnly = flag(row, "candidateOnly") || context.candidateOnly === true;
  const sourceStatusAccepted =
    status === "accepted_candidate" ||
    status === "accepted" ||
    row?.acceptance?.accepted === true;

  const hasNamedSignal = absenceRows.length > 0 || noteRows.length > 0;
  const hasEvidence = evidence.length > 0;
  const alreadyHasManualSeed = key ? context.manualSeedKeys.has(key) : false;

  if (!key || !team) {
    return {
      key,
      team,
      matchId,
      side,
      leagueSlug,
      sourceStatus: status || null,
      status: "missing_team_key",
      ok: false,
      promotable: false,
      reviewRequired: false,
      reason: "candidate has no usable team key"
    };
  }

  if (alreadyHasManualSeed) {
    return {
      key,
      team,
      matchId,
      side,
      leagueSlug,
      sourceStatus: status || null,
      status: "already_has_manual_seed",
      ok: true,
      promotable: false,
      reviewRequired: false,
      reason: "reviewed manual seed already exists for this team/day"
    };
  }

  if (!sourceStatusAccepted) {
    return {
      key,
      team,
      matchId,
      side,
      leagueSlug,
      sourceStatus: status || null,
      status: status || "unresolved_candidate",
      ok: true,
      promotable: false,
      reviewRequired: status !== "unresolved_candidate",
      candidateOnly,
      reviewed,
      productionGrade,
      evidenceCount: evidence.length,
      absenceCount: absenceRows.length,
      noteCount: noteRows.length,
      canonicalWrite,
      reason: "research result was not accepted as a candidate"
    };
  }

  if (!candidateOnly) {
    return {
      key,
      team,
      matchId,
      side,
      leagueSlug,
      sourceStatus: status || null,
      status: "not_candidate_only",
      ok: false,
      promotable: false,
      reviewRequired: true,
      candidateOnly,
      reviewed,
      productionGrade,
      evidenceCount: evidence.length,
      absenceCount: absenceRows.length,
      noteCount: noteRows.length,
      canonicalWrite,
      reason: "review queue accepts only candidateOnly records"
    };
  }

  if (!hasEvidence || !hasNamedSignal) {
    return {
      key,
      team,
      matchId,
      side,
      leagueSlug,
      sourceStatus: status || null,
      status: "invalid_candidate",
      ok: false,
      promotable: false,
      reviewRequired: true,
      candidateOnly,
      reviewed,
      productionGrade,
      evidenceCount: evidence.length,
      absenceCount: absenceRows.length,
      noteCount: noteRows.length,
      canonicalWrite,
      reason: "candidate needs evidence and named absence/note signal"
    };
  }

  if (reviewed && productionGrade) {
    return {
      key,
      team,
      matchId,
      side,
      leagueSlug,
      sourceStatus: status || null,
      status: "approved_ready_for_promotion",
      ok: true,
      promotable: true,
      reviewRequired: false,
      candidateOnly,
      reviewed,
      productionGrade,
      evidenceCount: evidence.length,
      absenceCount: absenceRows.length,
      noteCount: noteRows.length,
      canonicalWrite,
      reason: "candidate is reviewed, productionGrade, evidence-backed, and ready for promotion"
    };
  }

  return {
    key,
    team,
    matchId,
    side,
    leagueSlug,
    sourceStatus: status || null,
    status: "needs_review",
    ok: true,
    promotable: false,
    reviewRequired: true,
    candidateOnly,
    reviewed,
    productionGrade,
    evidenceCount: evidence.length,
    absenceCount: absenceRows.length,
    noteCount: noteRows.length,
    canonicalWrite,
    reason: "candidate passes basic checks but still requires reviewed:true and productionGrade:true"
  };
}

export async function buildTeamNewsResearchReviewDay(dayKey) {
  const safeDayKey = clean(dayKey);

  if (!safeDayKey) {
    throw new Error("buildTeamNewsResearchReviewDay: missing dayKey");
  }

  const input = readJson(researchResultsPath(safeDayKey), null);

  if (!input || input.__readError || !Array.isArray(input.results)) {
    throw new Error(`team-news research results not found or invalid: ${researchResultsPath(safeDayKey)}`);
  }

  const context = {
    manualSeedKeys: manualSeedKeys(safeDayKey),
    candidateOnly: input.candidateOnly === true
  };

  const results = input.results.map(row => buildReviewRow(row, context));

  const out = {
    ok: true,
    dayKey: safeDayKey,
    inputFile: researchResultsPath(safeDayKey),
    candidateOnly: input.candidateOnly === true,
    promoteCanonical: input.promoteCanonical === true,
    inputTaskCount: input.taskCount ?? null,
    inputAcceptedCandidateCount: input.acceptedCandidateCount ?? null,
    inputCanonicalWriteCount: input.canonicalWriteCount ?? null,
    manualSeedCount: context.manualSeedKeys.size,
    reviewRowCount: results.length,
    needsReviewCount: results.filter(row => row.status === "needs_review").length,
    approvedReadyForPromotionCount: results.filter(row => row.status === "approved_ready_for_promotion").length,
    alreadyHasManualSeedCount: results.filter(row => row.status === "already_has_manual_seed").length,
    invalidCandidateCount: results.filter(row => row.status === "invalid_candidate").length,
    unresolvedCandidateCount: results.filter(row => row.status === "unresolved_candidate").length,
    promotableCount: results.filter(row => row.promotable === true).length,
    reviewRequiredCount: results.filter(row => row.reviewRequired === true).length,
    results,
    updatedAt: new Date().toISOString()
  };

  const outPath = reviewPath(safeDayKey);
  writeJson(outPath, out);

  return {
    ...out,
    file: outPath
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  console.log("[build-team-news-research-review-day] cli:start", { dayKey });

  buildTeamNewsResearchReviewDay(dayKey)
    .then(result => {
      console.log("[build-team-news-research-review-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        reviewRowCount: result.reviewRowCount,
        needsReviewCount: result.needsReviewCount,
        approvedReadyForPromotionCount: result.approvedReadyForPromotionCount,
        invalidCandidateCount: result.invalidCandidateCount,
        unresolvedCandidateCount: result.unresolvedCandidateCount,
        promotableCount: result.promotableCount,
        reviewRequiredCount: result.reviewRequiredCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[build-team-news-research-review-day] cli:fatal", err);
      process.exit(1);
    });
}
