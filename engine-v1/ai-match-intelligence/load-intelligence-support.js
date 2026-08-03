import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";
import {
  overlayProductionEvidenceDocumentReadView,
} from "../core/production-evidence-identity-overlay.js";

// P0-C P5 READ BOUNDARY: model-prior and value-pick evidence views.

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return overlayProductionEvidenceDocumentReadView(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
  } catch (error) {
    if (
      String(error?.code || "").startsWith(
        "production_evidence_read_",
      )
    ) {
      throw error;
    }
    return fallback;
  }
}

export function loadIntelligenceSupport(dayKey, matchId, valuePicks = []) {
  const priors = readJsonSafe(
    resolveDataPath("model-priors", `${currentSeason()}.json`),
    {}
  );

  const hasPriors =
    !!priors &&
    (
      Object.keys(priors?.teamPriors || {}).length > 0 ||
      Object.keys(priors?.leaguePriors || {}).length > 0 ||
      Object.keys(priors?.matchupPriors || {}).length > 0
    );

  const normalizedValue = overlayProductionEvidenceDocumentReadView(
    Array.isArray(valuePicks) ? valuePicks : [],
  );

  const sortedValue = normalizedValue
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));

  const topValue = sortedValue[0] || null;

  const valueSummary = {
    count: sortedValue.length,
    topMarket: topValue?.market || topValue?.marketName || null,
    topPick: topValue?.pick || null,
    topScore: Number.isFinite(Number(topValue?.score)) ? Number(topValue.score) : null,
    avgConfidence: sortedValue.length
      ? (
          sortedValue.reduce((sum, p) => sum + Number(p?.confidence || 0), 0) /
          sortedValue.length
        )
      : 0
  };

  return {
    priors,
    hasPriors,
    value: sortedValue,
    hasValue: sortedValue.length > 0,
    topValue,
    valueSummary
  };
}