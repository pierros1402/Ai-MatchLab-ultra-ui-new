import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureHistoryIndexFoundationForDay, resolveSeasonFromDay } from "./rebuild-indexes-for-season.js";
import { rebuildH2HFoundationFromCurrentHistory } from "./rebuild-h2h-foundation-from-current-history.js";
import { buildModelPriors } from "./build-model-priors.js";
import { validateHistoryIndexFoundationSync, validateH2HFoundationSync, validateModelPriorsFoundationSync } from "../core/derived-history-foundation.js";

export async function ensureDerivedPublicationFoundations(day, {
  resolveSeason = resolveSeasonFromDay,
  ensureIndex = ensureHistoryIndexFoundationForDay,
  validateIndex = validateHistoryIndexFoundationSync,
  validateH2H = validateH2HFoundationSync,
  rebuildH2H = rebuildH2HFoundationFromCurrentHistory,
  validatePriors = validateModelPriorsFoundationSync,
  rebuildPriors = buildModelPriors
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) ||
      !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day)
    throw new Error("invalid_foundation_recovery_day");
  const season = resolveSeason(day);
  if (!season || season === "unknown-season") throw new Error("invalid_foundation_recovery_season");
  const index = await ensureIndex(day);
  if (index?.ok !== true || validateIndex(season)?.ok !== true)
    throw new Error("history_index_foundation_not_ready");
  const h2hStale = validateH2H()?.ok !== true;
  if (h2hStale && (await rebuildH2H())?.ok !== true)
    throw new Error("h2h_foundation_rebuild_failed");
  if (validateH2H()?.ok !== true) throw new Error("h2h_foundation_not_ready");
  const priorsStale = validatePriors(season)?.ok !== true;
  if (priorsStale && (await rebuildPriors({targetSeason: season}))?.ok !== true)
    throw new Error("model_priors_rebuild_failed");
  if (validateIndex(season)?.ok !== true || validateH2H()?.ok !== true || validatePriors(season)?.ok !== true)
    throw new Error("derived_foundation_final_validation_failed");
  return {ok:true, day, season, rebuilt:{index:index.rebuilt === true,h2h:h2hStale,priors:priorsStale}};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await ensureDerivedPublicationFoundations(process.argv[2])));
}
