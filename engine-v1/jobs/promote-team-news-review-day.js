import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeTeamKey } from "../storage/team-news-db.js";
import { validateTeamNewsSeedRecord } from "./validate-team-news-seeds-day.js";

const __filename = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(MODULE_DIR, "..", "..");

function clean(value) {
  return String(value || "").trim();
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

function writeJson(file, payload, { force = false } = {}) {
  if (fs.existsSync(file) && !force) {
    throw new Error(`Output already exists. Use --force only if intentional: ${file}`);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function resolveDataPath(...parts) {
  return path.join(ROOT_DIR, "data", ...parts);
}

function reviewPath(dayKey) {
  return resolveDataPath("team-news", "_research-review", `${dayKey}.json`);
}

function researchResultsPath(dayKey) {
  return resolveDataPath("team-news", "_research-results", `${dayKey}.json`);
}

function manualResultsDir(dayKey) {
  return path.join(ROOT_DIR, "engine-v1", "seeds", "team-news", "manual-results", dayKey);
}

function seedPath(dayKey, key) {
  return path.join(manualResultsDir(dayKey), `${key}.json`);
}

function normalizeKey(value) {
  return normalizeTeamKey(clean(value));
}

function rowKey(row) {
  return normalizeKey(
    row?.key ||
    row?.team ||
    row?.targetTeam ||
    row?.task?.target?.team ||
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
  ).toLowerCase();
}

function rowLeague(row) {
  return clean(
    row?.leagueSlug ||
    row?.task?.match?.leagueSlug ||
    row?.candidate?.leagueSlug ||
    row?.candidateOutput?.leagueSlug
  );
}

function arrayFrom(...values) {
  return values.flatMap(value => Array.isArray(value) ? value : []).filter(Boolean);
}

function candidateAbsences(row) {
  return arrayFrom(
    row?.absences,
    row?.candidate?.absences,
    row?.candidateOutput?.absences,
    row?.finalCandidate?.absences
  ).map(absence => ({
    player: clean(absence?.player || absence?.name),
    reason: clean(absence?.reason || absence?.type) || "unknown",
    importance: clean(absence?.importance || absence?.confidence || "medium") || "medium",
    side: clean(absence?.side || rowSide(row)).toLowerCase()
  })).filter(absence => absence.player);
}

function candidateNotes(row) {
  return arrayFrom(
    row?.notes,
    row?.candidate?.notes,
    row?.candidateOutput?.notes,
    row?.finalCandidate?.notes
  ).map(note => {
    if (typeof note === "string") return clean(note);
    return clean(note?.text || note?.note || note?.label);
  }).filter(Boolean);
}

function candidateEvidence(row) {
  return arrayFrom(
    row?.evidence,
    row?.candidate?.evidence,
    row?.candidateOutput?.evidence,
    row?.finalCandidate?.evidence
  ).map(item => ({
    label: clean(item?.label || item?.title || item?.source || "Evidence"),
    url: clean(item?.url),
    publisher: clean(item?.publisher || item?.source || item?.site),
    publishedAt: clean(item?.publishedAt || item?.date || item?.checkedAt)
  })).filter(item => item.label && item.url);
}

function sourceRowsByIdentity(researchResults) {
  const map = new Map();

  for (const row of researchResults) {
    const key = rowKey(row);
    const matchId = rowMatchId(row);
    if (!key) continue;

    map.set(`${key}::${matchId}`, row);

    if (!map.has(`${key}::`)) {
      map.set(`${key}::`, row);
    }
  }

  return map;
}

function isApprovedReviewRow(row) {
  return row?.status === "approved_ready_for_promotion" &&
    row?.promotable === true &&
    row?.reviewed === true &&
    row?.productionGrade === true &&
    Number(row?.evidenceCount || 0) > 0 &&
    (Number(row?.absenceCount || 0) > 0 || Number(row?.noteCount || 0) > 0);
}

function buildSeedFromRows({ dayKey, reviewRow, sourceRow }) {
  const team = rowTeam(sourceRow) || clean(reviewRow?.team);
  const key = rowKey(sourceRow) || rowKey(reviewRow);
  const side = rowSide(sourceRow) || clean(reviewRow?.side).toLowerCase() || null;
  const matchId = rowMatchId(sourceRow) || clean(reviewRow?.matchId);
  const leagueSlug = rowLeague(sourceRow) || clean(reviewRow?.leagueSlug) || null;

  const absences = candidateAbsences(sourceRow);
  const notes = candidateNotes(sourceRow);
  const evidence = candidateEvidence(sourceRow);

  const now = new Date().toISOString();

  return {
    team,
    key,
    leagueSlug,
    side,
    matchIds: matchId ? [matchId] : [],
    aliases: [],
    sourceInputType: "manual_result",
    source: "tracked_team_news_manual_result",
    reviewed: true,
    productionGrade: true,
    absences,
    notes,
    evidence,
    sourceMeta: {
      writer: "promote-team-news-review-day",
      promotedFrom: "team_news_research_review",
      dayKey,
      reviewStatus: reviewRow?.status || null,
      sourceStatus: reviewRow?.sourceStatus || null,
      writtenAt: now
    },
    meta: {
      sourceInputType: "manual_result",
      reviewed: true,
      productionGrade: true,
      promotedFrom: "team_news_research_review",
      writtenAt: now
    }
  };
}

function parseArgs(argv) {
  const args = {
    dayKey: argv[2] || "",
    writeReviewedSeeds: false,
    force: false
  };

  for (const arg of argv.slice(3)) {
    if (arg === "--write-reviewed-seeds") {
      args.writeReviewedSeeds = true;
      continue;
    }

    if (arg === "--force") {
      args.force = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

export async function promoteTeamNewsReviewDay(dayKey, {
  writeReviewedSeeds = false,
  force = false
} = {}) {
  const safeDayKey = clean(dayKey);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDayKey)) {
    throw new Error("promoteTeamNewsReviewDay: invalid or missing dayKey");
  }

  const review = readJson(reviewPath(safeDayKey), null);
  if (!review || review.__readError || !Array.isArray(review.results)) {
    throw new Error(`Review queue not found or invalid: ${reviewPath(safeDayKey)}`);
  }

  const research = readJson(researchResultsPath(safeDayKey), null);
  if (!research || research.__readError || !Array.isArray(research.results)) {
    throw new Error(`Research results not found or invalid: ${researchResultsPath(safeDayKey)}`);
  }

  const sourceByIdentity = sourceRowsByIdentity(research.results);
  const promoted = [];
  const skipped = [];

  for (const reviewRow of review.results) {
    const key = normalizeKey(reviewRow?.key);
    const matchId = clean(reviewRow?.matchId);
    const sourceRow = sourceByIdentity.get(`${key}::${matchId}`) || sourceByIdentity.get(`${key}::`);

    if (!isApprovedReviewRow(reviewRow)) {
      skipped.push({
        key,
        matchId,
        status: reviewRow?.status || null,
        reason: "not_approved_ready_for_promotion"
      });
      continue;
    }

    if (!sourceRow) {
      skipped.push({
        key,
        matchId,
        status: reviewRow?.status || null,
        reason: "source_research_row_not_found"
      });
      continue;
    }

    const seed = buildSeedFromRows({
      dayKey: safeDayKey,
      reviewRow,
      sourceRow
    });

    const validation = validateTeamNewsSeedRecord(seed, {
      dayKey: safeDayKey,
      file: null
    });

    const outPath = seedPath(safeDayKey, seed.key);

    const row = {
      key: seed.key,
      team: seed.team,
      matchIds: seed.matchIds,
      side: seed.side,
      leagueSlug: seed.leagueSlug,
      absenceCount: seed.absences.length,
      noteCount: seed.notes.length,
      evidenceCount: seed.evidence.length,
      validationOk: validation.ok,
      validationStatus: validation.status,
      validationIssues: validation.issues || [],
      file: outPath,
      written: false
    };

    if (!validation.ok) {
      skipped.push({
        ...row,
        reason: "validation_failed"
      });
      continue;
    }

    if (writeReviewedSeeds) {
      writeJson(outPath, seed, { force });
      row.written = true;
    }

    promoted.push(row);
  }

  return {
    ok: true,
    dayKey: safeDayKey,
    dryRun: !writeReviewedSeeds,
    writeReviewedSeeds,
    force,
    reviewFile: reviewPath(safeDayKey),
    researchResultsFile: researchResultsPath(safeDayKey),
    reviewRowCount: review.results.length,
    approvedReviewRowCount: review.results.filter(isApprovedReviewRow).length,
    promotedCount: promoted.length,
    writtenCount: promoted.filter(row => row.written).length,
    skippedCount: skipped.length,
    promoted,
    skipped
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = parseArgs(process.argv);

  console.log("[promote-team-news-review-day] cli:start", {
    dayKey: args.dayKey,
    writeReviewedSeeds: args.writeReviewedSeeds,
    force: args.force
  });

  promoteTeamNewsReviewDay(args.dayKey, {
    writeReviewedSeeds: args.writeReviewedSeeds,
    force: args.force
  })
    .then(result => {
      console.log(JSON.stringify({
        ok: result.ok,
        dayKey: result.dayKey,
        dryRun: result.dryRun,
        writeReviewedSeeds: result.writeReviewedSeeds,
        reviewRowCount: result.reviewRowCount,
        approvedReviewRowCount: result.approvedReviewRowCount,
        promotedCount: result.promotedCount,
        writtenCount: result.writtenCount,
        skippedCount: result.skippedCount,
        promoted: result.promoted,
        skipped: result.skipped.slice(0, 20)
      }, null, 2));
    })
    .catch(err => {
      console.error("[promote-team-news-review-day] cli:fatal", err);
      process.exit(1);
    });
}
