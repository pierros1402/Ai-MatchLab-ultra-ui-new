import { currentSeason, seasonBefore } from "../core/season.js";
import { validateHistoryIndexFoundationSync } from "../core/derived-history-foundation.js";

export async function preparePrematchHistoryForm(nowMs) {
  const season = seasonBefore(currentSeason(new Date(nowMs)));
  if (validateHistoryIndexFoundationSync(season).ok) return { season, changed: false };
  const { buildCurrentSeasonIndexes } = await import("./build-current-season-indexes.js");
  const dayKey = `${season.slice(5)}-07-31`;
  const built = await buildCurrentSeasonIndexes({ season, dayKey });
  if (!built.ok || !validateHistoryIndexFoundationSync(season).ok) throw new Error("previous_season_form_foundation_invalid");
  return { season, changed: true, matchCount: built.matchCount };
}
