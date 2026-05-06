import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../storage/player-usage-db.js";
import { validatePlayerUsageResearchResult } from "../ai-match-intelligence/player-usage/player-usage-validator.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function clean(value) {
  return String(value || "").trim();
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    return {
      __readError: err.message
    };
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function detailsDir(dayKey) {
  return resolveDataPath("details", dayKey);
}

function candidateDir(dayKey) {
  return resolveDataPath("player-usage", "_ai-candidates", dayKey);
}

function auditPath(dayKey) {
  return resolveDataPath("player-usage", "_deterministic-candidate-audit", `${dayKey}.json`);
}

function manualResultsDir(dayKey) {
  return path.resolve(MODULE_DIR, "..", "seeds", "player-usage", "manual-results", dayKey);
}

function existingManualSeedKeys(dayKey) {
  const dir = manualResultsDir(dayKey);
  if (!fs.existsSync(dir)) return new Set();

  return new Set(
    fs.readdirSync(dir)
      .filter(file => file.endsWith(".json"))
      .map(file => normalizePlayerUsageTeamKey(path.basename(file, ".json")))
      .filter(Boolean)
  );
}

function sideOpponent(basic, side) {
  return side === "home" ? clean(basic?.awayTeam) : clean(basic?.homeTeam);
}

function sideTeam(basic, side, usageSide) {
  return clean(usageSide?.team) || (side === "home" ? clean(basic?.homeTeam) : clean(basic?.awayTeam));
}

function toDateOnly(value, fallbackDayKey) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return fallbackDayKey;
}

function normalizeExpectedStarterPlayer(name, index) {
  const playerName = clean(name);
  if (!playerName) return null;

  return {
    name: playerName,
    starter: true,
    minutes: null,
    position: null
  };
}

function buildCandidateFromDetailSide(detail, side, dayKey) {
  const basic = detail?.basic || {};
  const usage = detail?.playerUsageIntel?.[side] || detail?.researchedFacts?.playerUsageIntel?.[side] || null;

  if (!usage || typeof usage !== "object") {
    return {
      status: "skipped_no_usage_side",
      reason: "detail side has no playerUsageIntel"
    };
  }

  const team = sideTeam(basic, side, usage);
  const key = normalizePlayerUsageTeamKey(team);
  const opponent = sideOpponent(basic, side);
  const expectedStarters = Array.isArray(usage.expectedStarters) ? usage.expectedStarters : [];
  const players = expectedStarters
    .map((name, index) => normalizeExpectedStarterPlayer(name, index))
    .filter(Boolean);

  if (!team || !key) {
    return {
      status: "skipped_missing_team",
      reason: "team/key missing"
    };
  }

  if (players.length < 3) {
    return {
      status: "skipped_insufficient_players",
      key,
      team,
      reason: "expectedStarters has fewer than 3 usable players",
      playerCount: players.length
    };
  }

  const confidence = Number.isFinite(Number(usage.confidence)) ? Number(usage.confidence) : 0;

  const candidate = {
    key,
    team,
    aliases: [team],
    leagueSlug: clean(usage.leagueSlug || basic.leagueSlug) || null,
    source: "local_deterministic_player_usage_candidate",
    candidateOnly: true,
    reviewed: false,
    productionGrade: false,
    requiresManualReview: true,
    canonicalEligible: false,
    confidence,
    matches: [
      {
        matchId: clean(detail.matchId || basic.matchId) || null,
        date: toDateOnly(basic.kickoffUtc || detail.dayKey, dayKey),
        opponent,
        side,
        players
      }
    ],
    meta: {
      candidateOnly: true,
      reviewed: false,
      productionGrade: false,
      requiresManualReview: true,
      canonicalEligible: false,
      sourceInputType: "deterministic_candidate",
      evidenceLevel: "expected_lineup_from_local_details",
      usageType: "expected_starting_xi",
      matchId: clean(detail.matchId || basic.matchId) || null,
      opponent,
      side,
      detailDayKey: dayKey,
      detailSource: "data/details",
      originalUsageStatus: clean(usage.status) || null,
      originalUsageSource: clean(usage.source) || null,
      note: "Dependency-free candidate built from existing local details playerUsageIntel.expectedStarters. Requires manual review before promotion."
    }
  };

  const validation = validatePlayerUsageResearchResult(candidate, {
    key,
    team,
    leagueSlug: candidate.leagueSlug
  });

  return {
    status: validation.ok ? "candidate_ready_for_review" : "candidate_failed_validation",
    key,
    team,
    candidate,
    validation
  };
}

export async function buildPlayerUsageDeterministicCandidatesDay(dayKey, options = {}) {
  const safeDayKey = clean(dayKey);
  if (!safeDayKey) {
    throw new Error("buildPlayerUsageDeterministicCandidatesDay: missing dayKey");
  }

  const write = options.write === true;
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Math.floor(Number(options.limit))
    : Infinity;

  const dir = detailsDir(safeDayKey);
  const manualSeedKeys = existingManualSeedKeys(safeDayKey);

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(file => file.endsWith(".json")).sort()
    : [];

  const results = [];
  const seenKeys = new Set();

  for (const file of files) {
    if (results.filter(row => row.status === "candidate_written" || row.status === "candidate_ready_for_review").length >= limit) {
      break;
    }

    const full = path.join(dir, file);
    const detail = readJson(full, null);

    if (!detail || detail.__readError) {
      results.push({
        file: full,
        status: "skipped_invalid_detail_json",
        reason: detail?.__readError || "detail json missing"
      });
      continue;
    }

    for (const side of ["home", "away"]) {
      const built = buildCandidateFromDetailSide(detail, side, safeDayKey);
      const key = built.key || null;

      if (key && manualSeedKeys.has(key)) {
        results.push({
          file: full,
          side,
          key,
          team: built.team || null,
          status: "skipped_existing_manual_seed",
          reason: "manual seed already exists for day/team"
        });
        continue;
      }

      if (key && seenKeys.has(key)) {
        results.push({
          file: full,
          side,
          key,
          team: built.team || null,
          status: "skipped_duplicate_candidate_key",
          reason: "candidate key already produced in this run"
        });
        continue;
      }

      if (built.status !== "candidate_ready_for_review") {
        results.push({
          file: full,
          side,
          key,
          team: built.team || null,
          status: built.status,
          reason: built.reason || built.validation?.reason || null,
          validationStatus: built.validation?.status || null,
          confidence: built.validation?.confidence ?? null,
          playerCount: built.validation?.playerCount ?? built.playerCount ?? null
        });
        continue;
      }

      seenKeys.add(key);

      const outFile = path.join(candidateDir(safeDayKey), `${key}.json`);

      if (write) {
        writeJson(outFile, built.candidate);
      }

      results.push({
        file: full,
        side,
        key,
        team: built.team,
        status: write ? "candidate_written" : "candidate_ready_for_review",
        outputFile: outFile,
        validationStatus: built.validation.status,
        validationReason: built.validation.reason,
        confidence: built.validation.confidence,
        matchCount: built.validation.matchCount,
        playerCount: built.validation.playerCount
      });
    }
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    dryRun: !write,
    detailsDir: dir,
    detailsFileCount: files.length,
    manualSeedCount: manualSeedKeys.size,
    candidateReadyCount: results.filter(row => row.status === "candidate_ready_for_review").length,
    candidateWrittenCount: results.filter(row => row.status === "candidate_written").length,
    skippedExistingManualSeedCount: results.filter(row => row.status === "skipped_existing_manual_seed").length,
    failedValidationCount: results.filter(row => row.status === "candidate_failed_validation").length,
    skippedInsufficientPlayersCount: results.filter(row => row.status === "skipped_insufficient_players").length,
    results,
    updatedAt: new Date().toISOString()
  };

  const outPath = auditPath(safeDayKey);
  writeJson(outPath, out);

  return {
    ...out,
    file: outPath
  };
}

function parseArgs(argv) {
  const args = {
    dayKey: null,
    write: false,
    limit: null
  };

  for (const arg of argv) {
    if (arg === "--write") {
      args.write = true;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      args.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
      continue;
    }

    if (!args.dayKey) {
      args.dayKey = clean(arg);
    }
  }

  return args;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = parseArgs(process.argv.slice(2));

  console.log("[build-player-usage-deterministic-candidates-day] cli:start", {
    dayKey: args.dayKey,
    write: args.write,
    limit: args.limit
  });

  buildPlayerUsageDeterministicCandidatesDay(args.dayKey, args)
    .then(result => {
      console.log("[build-player-usage-deterministic-candidates-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        dryRun: result.dryRun,
        detailsFileCount: result.detailsFileCount,
        manualSeedCount: result.manualSeedCount,
        candidateReadyCount: result.candidateReadyCount,
        candidateWrittenCount: result.candidateWrittenCount,
        skippedExistingManualSeedCount: result.skippedExistingManualSeedCount,
        failedValidationCount: result.failedValidationCount,
        skippedInsufficientPlayersCount: result.skippedInsufficientPlayersCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[build-player-usage-deterministic-candidates-day] cli:fatal", err);
      process.exit(1);
    });
}
