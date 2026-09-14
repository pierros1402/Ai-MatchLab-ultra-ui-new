import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyCrossDayProviderRescheduleGroup } from "../core/cross-day-provider-reschedule.js";
import { assertCanonicalStatusCoherence } from "../core/canonical-status-coherence.js";
import { resolveDataPath } from "../storage/data-root.js";

const ACCEPTED_FINAL_VERDICTS = new Set([
  "verified_final_result",
  "verified_final_result_truth",
  "manual_two_source_final_score_validated",
  "manual_official_url_validated"
]);

const POLICY_VERSION = "cross-day-provider-verified-final-v1";
const CORRECTION_REASON = "verified_cross_day_provider_reschedule";
const DECISION_BASIS = "exact_provider_identity_cross_day_supersession_with_verified_final";

function clean(value) {
  return String(value ?? "").trim();
}

function validDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

function shiftDay(dayKey, offset) {
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

function normalizeTeam(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "");
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

function rowsOfPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function sourceName(row) {
  return clean(row?.source || row?.provider || row?.adapterId).toLowerCase();
}

function providerId(row) {
  const source = sourceName(row);
  return clean(
    row?.sourceMatchId ||
    row?.sourceId ||
    row?.providerMatchId ||
    row?.providerIds?.[source]
  );
}

function canonicalId(row) {
  return clean(row?.canonicalId || row?.matchId);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function exactPickIds(payload) {
  const picks = Array.isArray(payload?.picks) ? payload.picks : [];
  return new Set(
    picks
      .map(row => clean(row?.canonicalId || row?.matchId))
      .filter(Boolean)
  );
}

function officialValueContains(dayKey, matchId) {
  const files = [
    resolveDataPath("value", `${dayKey}.json`),
    resolveDataPath("deploy-snapshots", dayKey, "value.json")
  ];

  return files.some(file => {
    if (!fs.existsSync(file)) return false;
    const payload = readJson(file, null);
    return payload ? exactPickIds(payload).has(matchId) : false;
  });
}

function historyContains(matchId) {
  const dir = resolveDataPath("history");
  if (!fs.existsSync(dir)) return false;

  return fs.readdirSync(dir)
    .filter(name => /^\d{4}-\d{4}\.json$/u.test(name))
    .some(name => {
      try {
        return fs.readFileSync(path.join(dir, name), "utf8").includes(matchId);
      } catch {
        return false;
      }
    });
}

function activeFinalExists(dayKey, matchId) {
  return fs.existsSync(resolveDataPath("final-results", dayKey, `${matchId}.json`));
}

function finalVerdict(row) {
  return clean(
    row?.finalTruthVerdict ||
    row?.verdict ||
    row?.verification?.finalTruthVerdict ||
    row?.verification?.verdict ||
    row?.verification?.state ||
    row?.settlement?.finalTruthVerdict ||
    row?.settlement?.state
  ).toLowerCase();
}

function verifiedFinalEvidence(evidence) {
  const evidenceId = clean(evidence?.canonicalId);
  const evidenceDayKey = clean(evidence?.dayKey);
  const pid = clean(evidence?.providerMatchId);

  if (!evidenceId || !validDayKey(evidenceDayKey) || !pid) {
    return { ok: false, reason: "verified_final_evidence_identity_incomplete" };
  }

  const file = resolveDataPath("final-results", evidenceDayKey, `${evidenceId}.json`);
  if (!fs.existsSync(file)) {
    return { ok: false, reason: "verified_final_artifact_missing", file };
  }

  const row = readJson(file, null);
  if (!row) {
    return { ok: false, reason: "verified_final_artifact_unreadable", file };
  }

  if (row?.verifiedFinalTruth !== true) {
    return { ok: false, reason: "verified_final_truth_required", file };
  }

  const verdict = finalVerdict(row);
  if (!ACCEPTED_FINAL_VERDICTS.has(verdict)) {
    return { ok: false, reason: "verified_final_verdict_not_accepted", verdict, file };
  }

  if (clean(row?.matchId) !== evidenceId || clean(row?.dayKey || row?.date) !== evidenceDayKey) {
    return { ok: false, reason: "verified_final_identity_or_day_mismatch", file };
  }

  const home = strictScore(row?.scoreHome ?? row?.homeScore ?? row?.finalScore?.home);
  const away = strictScore(row?.scoreAway ?? row?.awayScore ?? row?.finalScore?.away);
  const evidenceHome = strictScore(evidence?.scoreHome);
  const evidenceAway = strictScore(evidence?.scoreAway);
  if (home === null || away === null || evidenceHome === null || evidenceAway === null) {
    return { ok: false, reason: "verified_final_numeric_score_required", file };
  }
  if (home !== evidenceHome || away !== evidenceAway) {
    return { ok: false, reason: "verified_final_score_mismatch", file };
  }

  if (
    normalizeTeam(row?.homeTeam || row?.teams?.homeTeam) !== normalizeTeam(evidence?.homeTeam) ||
    normalizeTeam(row?.awayTeam || row?.teams?.awayTeam) !== normalizeTeam(evidence?.awayTeam)
  ) {
    return { ok: false, reason: "verified_final_team_pair_mismatch", file };
  }

  const sources = Array.isArray(row?.sources) ? row.sources : [];
  const exactFlashscoreSource = sources.find(source =>
    clean(source?.provider).toLowerCase() === "flashscore" &&
    clean(source?.providerMatchId) === pid
  );
  if (!exactFlashscoreSource) {
    return { ok: false, reason: "verified_final_exact_flashscore_source_required", file };
  }

  return {
    ok: true,
    file,
    fileRelative: path.relative(process.cwd(), file).replaceAll("\\", "/"),
    row,
    verdict,
    scoreHome: home,
    scoreAway: away,
    providerMatchId: pid,
    source: exactFlashscoreSource
  };
}

function collectCanonicalWindow(baseDayKey, daysBack) {
  const fromDayKey = shiftDay(baseDayKey, -daysBack);
  const refs = [];

  for (let offset = -daysBack; offset <= 0; offset += 1) {
    const dayKey = shiftDay(baseDayKey, offset);
    const dir = resolveDataPath("canonical-fixtures", dayKey);
    if (!fs.existsSync(dir)) continue;

    for (const name of fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
      const file = path.join(dir, name);
      const payload = readJson(file, null);
      if (!payload) continue;
      const rows = rowsOfPayload(payload);
      rows.forEach((row, index) => {
        refs.push({ dayKey, file, payload, rows, row, index });
      });
    }
  }

  return { fromDayKey, toDayKey: baseDayKey, refs };
}

function correctionFor(row, decision, evidenceFinal, correctedAt) {
  const id = canonicalId(row);
  const pid = providerId(row);
  const status = "STATUS_POSTPONED";

  return {
    ...row,
    status,
    statusType: status,
    rawStatus: status,
    minute: null,
    scoreHome: null,
    scoreAway: null,
    penalties: null,
    decidedBy: null,
    statusCorrection: {
      schema: "ai-matchlab.cross-day-verified-final-supersession.v1",
      correctedAt,
      decisionId: `cross-day-verified-final-${pid}-${id}-v1`,
      policyVersion: POLICY_VERSION,
      correctedFrom: {
        status: row?.status ?? null,
        statusType: row?.statusType ?? null,
        rawStatus: row?.rawStatus ?? null,
        minute: row?.minute ?? null,
        scoreHome: row?.scoreHome ?? null,
        scoreAway: row?.scoreAway ?? null
      },
      correctedTo: {
        status,
        statusType: status,
        rawStatus: status,
        minute: null,
        scoreHome: null,
        scoreAway: null
      },
      reason: CORRECTION_REASON,
      decisionBasis: DECISION_BASIS,
      providerEvidence: {
        provider: "flashscore",
        providerMatchId: pid,
        supersededCanonicalId: id,
        supersededDayKey: clean(row?.dayKey),
        supersededKickoffUtc: clean(row?.kickoffUtc),
        evidenceCanonicalId: decision?.evidence?.canonicalId ?? null,
        evidenceDayKey: decision?.evidence?.dayKey ?? null,
        evidenceKickoffUtc: decision?.evidence?.kickoffUtc ?? null,
        evidenceHomeTeam: decision?.evidence?.homeTeam ?? null,
        evidenceAwayTeam: decision?.evidence?.awayTeam ?? null,
        verifiedFinalArtifact: evidenceFinal.fileRelative,
        verifiedFinalVerdict: evidenceFinal.verdict,
        verifiedFinalTruth: true,
        verifiedFinalScoreHome: evidenceFinal.scoreHome,
        verifiedFinalScoreAway: evidenceFinal.scoreAway
      },
      guarantees: {
        ...(decision?.guarantees || {}),
        exactVerifiedFinalArtifact: true,
        exactVerifiedFinalFlashscoreProviderIdentity: true,
        verifiedFinalScoreParity: true,
        verifiedFinalTeamPairParity: true,
        oldOccurrenceHasNoActiveFinalResult: true,
        oldOccurrenceAbsentFromHistory: true,
        oldOccurrenceHasNoOfficialValuePick: true,
        oldOccurrenceScoreRemainsNull: true,
        scoreNeverCopiedBackward: true
      }
    }
  };
}

export function buildCrossDayVerifiedFinalSupersessionPlan(
  baseDayKey,
  { daysBack = 7, now = new Date() } = {}
) {
  const safeBaseDayKey = clean(baseDayKey);
  if (!validDayKey(safeBaseDayKey)) {
    return { ok: false, reason: "invalid_base_day_key", baseDayKey };
  }

  const safeDaysBack = Math.max(1, Math.min(14, Math.floor(Number(daysBack) || 7)));
  const asOfMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(asOfMs)) {
    return { ok: false, reason: "invalid_reference_time", baseDayKey: safeBaseDayKey };
  }

  const window = collectCanonicalWindow(safeBaseDayKey, safeDaysBack);
  const groups = new Map();
  const refsById = new Map();

  for (const ref of window.refs) {
    const id = canonicalId(ref.row);
    if (id) {
      if (!refsById.has(id)) refsById.set(id, []);
      refsById.get(id).push(ref);
    }

    if (sourceName(ref.row) !== "flashscore") continue;
    const pid = providerId(ref.row);
    if (!pid) continue;
    const key = `flashscore:${pid}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ref.row);
  }

  const eligible = [];
  const rejected = [];

  for (const [providerIdentity, rows] of groups) {
    if (rows.length < 2 || new Set(rows.map(row => clean(row?.dayKey))).size < 2) continue;

    const decision = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs });
    if (!decision?.ok) {
      rejected.push({ providerIdentity, reason: decision?.reason || "classifier_rejected" });
      continue;
    }

    const evidenceFinal = verifiedFinalEvidence(decision.evidence);
    if (!evidenceFinal.ok) {
      rejected.push({
        providerIdentity,
        reason: evidenceFinal.reason,
        evidenceCanonicalId: decision?.evidence?.canonicalId ?? null,
        evidenceDayKey: decision?.evidence?.dayKey ?? null
      });
      continue;
    }

    for (const superseded of decision.superseded || []) {
      const id = clean(superseded?.canonicalId);
      const refs = refsById.get(id) || [];
      if (refs.length !== 1) {
        rejected.push({ providerIdentity, canonicalId: id, reason: "superseded_canonical_reference_not_unique" });
        continue;
      }

      const ref = refs[0];
      if (activeFinalExists(ref.dayKey, id)) {
        rejected.push({ providerIdentity, canonicalId: id, dayKey: ref.dayKey, reason: "superseded_occurrence_has_active_final_result" });
        continue;
      }
      if (historyContains(id)) {
        rejected.push({ providerIdentity, canonicalId: id, dayKey: ref.dayKey, reason: "superseded_occurrence_already_in_history" });
        continue;
      }
      if (officialValueContains(ref.dayKey, id)) {
        rejected.push({ providerIdentity, canonicalId: id, dayKey: ref.dayKey, reason: "superseded_occurrence_has_official_value_pick" });
        continue;
      }

      eligible.push({
        providerIdentity,
        canonicalId: id,
        dayKey: ref.dayKey,
        leagueSlug: clean(ref.row?.leagueSlug),
        file: ref.file,
        index: ref.index,
        decision,
        evidenceFinal,
        ref
      });
    }
  }

  eligible.sort((a, b) =>
    a.dayKey.localeCompare(b.dayKey) ||
    a.canonicalId.localeCompare(b.canonicalId)
  );

  return {
    ok: true,
    reason: null,
    baseDayKey: safeBaseDayKey,
    window: {
      fromDayKey: window.fromDayKey,
      toDayKey: window.toDayKey,
      daysBack: safeDaysBack
    },
    groupsScanned: groups.size,
    eligibleCount: eligible.length,
    eligible,
    rejectedCount: rejected.length,
    rejected
  };
}

export function applyCrossDayVerifiedFinalSupersessionWindow(
  baseDayKey,
  { daysBack = 7, now = new Date(), write = false } = {}
) {
  const plan = buildCrossDayVerifiedFinalSupersessionPlan(baseDayKey, { daysBack, now });
  if (!plan.ok) return plan;

  const correctedAt = now instanceof Date
    ? now.toISOString()
    : new Date(now).toISOString();

  const files = new Map();
  const mutations = [];

  for (const item of plan.eligible) {
    const ref = item.ref;
    const previous = ref.rows[ref.index];
    const corrected = correctionFor(previous, item.decision, item.evidenceFinal, correctedAt);

    if (!files.has(ref.file)) {
      files.set(ref.file, {
        file: ref.file,
        payload: ref.payload,
        rows: ref.rows,
        mutationCount: 0
      });
    }

    ref.rows[ref.index] = corrected;
    files.get(ref.file).mutationCount += 1;
    mutations.push({
      canonicalId: item.canonicalId,
      dayKey: item.dayKey,
      leagueSlug: item.leagueSlug,
      providerIdentity: item.providerIdentity,
      evidenceCanonicalId: item.decision?.evidence?.canonicalId ?? null,
      evidenceDayKey: item.decision?.evidence?.dayKey ?? null,
      evidenceVerifiedFinalArtifact: item.evidenceFinal.fileRelative,
      fromStatus: previous?.status ?? null,
      toStatus: "STATUS_POSTPONED"
    });
  }

  const writtenFiles = [];
  if (write) {
    for (const entry of files.values()) {
      entry.payload.updatedAt = correctedAt;
      entry.payload.count = entry.rows.length;
      entry.payload.sourceMeta = {
        ...(entry.payload.sourceMeta || {}),
        crossDayVerifiedFinalSupersessionAt: correctedAt,
        crossDayVerifiedFinalSupersessionRows: entry.mutationCount,
        crossDayVerifiedFinalSupersessionPolicy: POLICY_VERSION
      };
      assertCanonicalStatusCoherence(entry.payload, { path: entry.file });
      writeJson(entry.file, entry.payload);
      writtenFiles.push(path.relative(process.cwd(), entry.file).replaceAll("\\", "/"));
    }
  }

  return {
    ok: true,
    baseDayKey: plan.baseDayKey,
    window: plan.window,
    write: Boolean(write),
    groupsScanned: plan.groupsScanned,
    eligibleCount: plan.eligibleCount,
    mutationCount: mutations.length,
    mutations,
    rejectedCount: plan.rejectedCount,
    rejected: plan.rejected,
    filesChanged: write ? writtenFiles.length : 0,
    writtenFiles,
    guarantees: {
      canonicalOnly: true,
      flashscoreExactProviderIdentityOnly: true,
      verifiedFinalEvidenceRequired: true,
      oldOccurrenceScorelessScheduledOnly: true,
      oldOccurrenceBecomesPostponed: true,
      scoreNeverCopiedBackward: true,
      noHistoryMutation: true,
      noFinalResultMutation: true,
      noValueMutation: true,
      noDeploySnapshotMutation: true
    }
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const baseDayKey = clean(process.argv[2]);
  const daysBackArg = process.argv.find(arg => String(arg).startsWith("--days-back="));
  const daysBack = daysBackArg ? Number(daysBackArg.slice("--days-back=".length)) : 7;
  const write = process.argv.includes("--write");

  const result = applyCrossDayVerifiedFinalSupersessionWindow(baseDayKey, {
    daysBack,
    write
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
