import {
  rebuildIndexesForSeason,
  resolveSeasonFromDay,
} from "./rebuild-indexes-for-season.js";
import {
  validateHistoryIndexFoundationSync,
} from "../core/derived-history-foundation.js";

export async function ensureDetailsHistoryIndexFoundationDay(
  dayKey,
  {
    validate = validateHistoryIndexFoundationSync,
    rebuild = rebuildIndexesForSeason,
  } = {},
) {
  const season = resolveSeasonFromDay(dayKey);

  if (season === "unknown-season") {
    const error = new Error("details_history_index_foundation_invalid_day");
    error.details = { dayKey, season };
    throw error;
  }

  const before = validate(season);

  if (before?.ok === true) {
    return {
      ok: true,
      dayKey,
      season,
      rebuilt: false,
      previousReason: null,
      foundationFingerprint:
        before?.artifact?.foundationFingerprint || null,
    };
  }

  const rebuildResult = await rebuild(dayKey);

  if (rebuildResult?.ok !== true) {
    const error = new Error("details_history_index_foundation_rebuild_failed");
    error.details = {
      dayKey,
      season,
      previousReason: before?.reason || null,
      rebuild: rebuildResult || null,
    };
    throw error;
  }

  const after = validate(season);

  if (after?.ok !== true) {
    const error = new Error("details_history_index_foundation_not_ready_after_rebuild");
    error.details = {
      dayKey,
      season,
      previousReason: before?.reason || null,
      currentReason: after?.reason || null,
      rebuild: rebuildResult,
    };
    throw error;
  }

  return {
    ok: true,
    dayKey,
    season,
    rebuilt: true,
    previousReason: before?.reason || null,
    foundationFingerprint:
      after?.artifact?.foundationFingerprint || null,
  };
}

const { pathToFileURL } = await import("node:url");

const entryUrl = globalThis.process?.argv?.[1]
  ? pathToFileURL(globalThis.process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  const dayKey = String(globalThis.process?.argv?.[2] || "").trim();

  try {
    const result = await ensureDetailsHistoryIndexFoundationDay(dayKey);
    console.log("[details-history-index-foundation] ready", result);
  } catch (error) {
    console.error("[details-history-index-foundation] fatal", error);
    globalThis.process.exitCode = 1;
  }
}
