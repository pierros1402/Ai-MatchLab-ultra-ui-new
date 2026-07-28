/**
 * Shared opponent-strength adjusted form engine for Plan A2 / Plan B2.
 * Pure calculations only: no writes, no plan-specific membership decisions.
 */
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const round3 = value => Math.round((Number(value) || 0) * 1000) / 1000;

export const OPPONENT_ADJUSTED_FORM_SCHEMA = "ai-matchlab.opponent-adjusted-form.v1";

export function standingsStrength(row, table = []) {
  const rows = Array.isArray(table) ? table.filter(Boolean) : [];
  const played = Number(row?.played || 0);
  const points = Number(row?.points || 0);
  const gf = Number(row?.goalsFor || 0);
  const ga = Number(row?.goalsAgainst || 0);
  const ppg = played > 0 ? points / played : 0;
  const gdpg = played > 0 ? (gf - ga) / played : 0;
  const position = Number(row?.position || row?.rank || 0);
  const field = Math.max(2, rows.length || 2);
  const positionScore = position > 0 ? 1 - ((position - 1) / (field - 1)) : 0.5;
  const ppgScore = clamp01(ppg / 3);
  const gdScore = clamp01((gdpg + 2) / 4);
  const sampleReliability = clamp01(played / 10);
  return round3((positionScore * 0.45 + ppgScore * 0.35 + gdScore * 0.20) * (0.55 + 0.45 * sampleReliability));
}

function recencyWeight(index) {
  return Math.pow(0.88, Math.max(0, Number(index) || 0));
}

function opponentWeight(strength) {
  return 0.55 + (0.8 * clamp01(strength));
}

function safeAverage(sum, weight, fallback = null) {
  return weight > 0 ? sum / weight : fallback;
}

export function buildAdjustedFormProfile({ results = [], standings = [], opponentRows = new Map(), peerStrength = 0.5 } = {}) {
  const rows = Array.isArray(results) ? results : [];
  let rawWeight = 0, adjustedWeight = 0;
  let rawGf = 0, rawGa = 0, rawPts = 0, rawOver25 = 0, rawBtts = 0;
  let adjGf = 0, adjGa = 0, adjPts = 0, adjOver25 = 0, adjBtts = 0;
  let strongSample = 0, peerSample = 0, oppositionStrengthSum = 0;

  rows.forEach((result, index) => {
    const recency = recencyWeight(index);
    const oppRow = opponentRows.get(String(result?.opp || "")) || null;
    const strength = standingsStrength(oppRow, standings);
    const weight = recency * opponentWeight(strength);
    const gf = Number(result?.gf || 0);
    const ga = Number(result?.ga || 0);
    const points = result?.res === "W" ? 3 : result?.res === "D" ? 1 : 0;
    const over25 = gf + ga >= 3 ? 1 : 0;
    const btts = gf > 0 && ga > 0 ? 1 : 0;

    rawWeight += recency;
    rawGf += gf * recency; rawGa += ga * recency; rawPts += points * recency;
    rawOver25 += over25 * recency; rawBtts += btts * recency;

    adjustedWeight += weight;
    adjGf += gf * weight; adjGa += ga * weight; adjPts += points * weight;
    adjOver25 += over25 * weight; adjBtts += btts * weight;
    oppositionStrengthSum += strength;
    if (strength >= 0.65) strongSample += 1;
    if (Math.abs(strength - peerStrength) <= 0.15) peerSample += 1;
  });

  const sample = rows.length;
  const reliability = clamp01(sample / 10) * clamp01((strongSample + peerSample + 1) / 6);
  const raw = {
    gfRate: round3(safeAverage(rawGf, rawWeight, 0)),
    gaRate: round3(safeAverage(rawGa, rawWeight, 0)),
    ppg: round3(safeAverage(rawPts, rawWeight, 0)),
    over25Rate: round3(safeAverage(rawOver25, rawWeight, 0)),
    bttsRate: round3(safeAverage(rawBtts, rawWeight, 0))
  };
  const adjusted = {
    gfRate: round3(safeAverage(adjGf, adjustedWeight, raw.gfRate)),
    gaRate: round3(safeAverage(adjGa, adjustedWeight, raw.gaRate)),
    ppg: round3(safeAverage(adjPts, adjustedWeight, raw.ppg)),
    over25Rate: round3(safeAverage(adjOver25, adjustedWeight, raw.over25Rate)),
    bttsRate: round3(safeAverage(adjBtts, adjustedWeight, raw.bttsRate))
  };

  return {
    schema: OPPONENT_ADJUSTED_FORM_SCHEMA,
    sample,
    strongOpponentSample: strongSample,
    peerStrengthSample: peerSample,
    oppositionStrengthMean: round3(sample ? oppositionStrengthSum / sample : 0),
    sampleReliability: round3(reliability),
    raw,
    adjusted,
    impact: {
      gfRate: round3(adjusted.gfRate - raw.gfRate),
      gaRate: round3(adjusted.gaRate - raw.gaRate),
      ppg: round3(adjusted.ppg - raw.ppg),
      over25Rate: round3(adjusted.over25Rate - raw.over25Rate),
      bttsRate: round3(adjusted.bttsRate - raw.bttsRate)
    },
    reasonCodes: [
      sample < 3 ? "insufficient_opponent_strength_coverage" : null,
      strongSample === 0 ? "no_strong_opposition_sample" : null,
      peerSample === 0 ? "no_peer_strength_sample" : null,
      adjusted.over25Rate + 0.08 < raw.over25Rate ? "raw_form_inflated_by_weak_opposition" : null,
      adjusted.over25Rate > raw.over25Rate + 0.08 ? "strong_opposition_form_supports_market" : null
    ].filter(Boolean)
  };
}

function normalized1X2(home, draw, away) {
  const sum = home + draw + away || 1;
  return { home: round3(home / sum), draw: round3(draw / sum), away: round3(away / sum) };
}

function probabilityAdjustmentComponents(homeProfile = null, awayProfile = null) {
  const homeImpact = homeProfile?.impact || {};
  const awayImpact = awayProfile?.impact || {};
  const reliability = Math.min(
    Number(homeProfile?.sampleReliability || 0),
    Number(awayProfile?.sampleReliability || 0)
  );
  const adjustmentScale = 0.18 * clamp01(reliability);

  const resultDelta = (
    (
      Number(homeImpact.ppg || 0) -
      Number(awayImpact.ppg || 0)
    ) /
    3
  ) * adjustmentScale;

  const drawDelta =
    -Math.abs(resultDelta) * 0.35;

  const goalDelta = (
    (
      Number(homeImpact.over25Rate || 0) +
      Number(awayImpact.over25Rate || 0)
    ) /
    2
  ) * adjustmentScale;

  const bttsDelta = (
    (
      Number(homeImpact.bttsRate || 0) +
      Number(awayImpact.bttsRate || 0)
    ) /
    2
  ) * adjustmentScale;

  return {
    reliability,
    adjustmentScale,
    resultDelta,
    drawDelta,
    goalDelta,
    bttsDelta
  };
}

/**
 * Plan-independent description of the exact opponent-strength deltas used by
 * the common probability layer.
 */
export function describeProbabilityAdjustment(homeProfile = null, awayProfile = null) {
  const components = probabilityAdjustmentComponents(
    homeProfile,
    awayProfile
  );

  return {
    reliability: round3(components.reliability),
    adjustmentScale: round3(components.adjustmentScale),
    "1X2": {
      home: round3(components.resultDelta),
      draw: round3(components.drawDelta),
      away: round3(-components.resultDelta)
    },
    OU15: {
      over: round3(components.goalDelta * 0.55),
      under: round3(-components.goalDelta * 0.55)
    },
    OU25: {
      over: round3(components.goalDelta),
      under: round3(-components.goalDelta)
    },
    OU35: {
      over: round3(components.goalDelta * 0.70),
      under: round3(-components.goalDelta * 0.70)
    },
    BTTS: {
      yes: round3(components.bttsDelta),
      no: round3(-components.bttsDelta)
    }
  };
}

export function adjustMarketProbabilities(markets = {}, homeProfile = null, awayProfile = null) {
  const components = probabilityAdjustmentComponents(
    homeProfile,
    awayProfile
  );
  const copy = JSON.parse(JSON.stringify(markets || {}));

  const p1 = copy?.["1X2"]?.probs;
  if (p1) {
    copy["1X2"].probs = normalized1X2(
      clamp01(
        Number(p1.home || 0) +
        components.resultDelta
      ),
      clamp01(
        Number(p1.draw || 0) +
        components.drawDelta
      ),
      clamp01(
        Number(p1.away || 0) -
        components.resultDelta
      )
    );
  }

  for (const key of ["OU15", "OU25", "OU35"]) {
    const probs = copy?.[key]?.probs;
    if (!probs) continue;

    const multiplier =
      key === "OU15"
        ? 0.55
        : key === "OU35"
          ? 0.70
          : 1;

    const over = clamp01(
      Number(probs.over || 0) +
      components.goalDelta * multiplier
    );

    copy[key].probs = {
      over: round3(over),
      under: round3(1 - over)
    };
  }

  const btts = copy?.BTTS?.probs;
  if (btts) {
    const yes = clamp01(
      Number(btts.yes || 0) +
      components.bttsDelta
    );

    copy.BTTS.probs = {
      yes: round3(yes),
      no: round3(1 - yes)
    };
  }

  return {
    markets: copy,
    reliability: round3(components.reliability),
    adjustmentScale: round3(
      components.adjustmentScale
    )
  };
}

export function adjustPlanAValue(value = {}, homeProfile = null, awayProfile = null) {
  const adjusted = { ...value };
  const reliability = Math.min(Number(homeProfile?.sampleReliability || 0), Number(awayProfile?.sampleReliability || 0));
  const scale = 0.18 * clamp01(reliability);
  const homePpg = Number(homeProfile?.impact?.ppg || 0);
  const awayPpg = Number(awayProfile?.impact?.ppg || 0);
  const resultDelta = ((homePpg - awayPpg) / 3) * scale;
  adjusted.homeWinScore = clamp01(Number(value?.homeWinScore || 0) + resultDelta);
  adjusted.awayWinScore = clamp01(Number(value?.awayWinScore || 0) - resultDelta);
  adjusted.drawScore = clamp01(Number(value?.drawScore || 0) - Math.abs(resultDelta) * 0.35);
  const goalDelta = ((Number(homeProfile?.impact?.over25Rate || 0) + Number(awayProfile?.impact?.over25Rate || 0)) / 2) * scale;
  adjusted.over15Score = clamp01(Number(value?.over15Score || 0) + goalDelta * 0.55);
  adjusted.over25Score = clamp01(Number(value?.over25Score || 0) + goalDelta);
  adjusted.over35Score = clamp01(Number(value?.over35Score || 0) + goalDelta * 0.70);
  const bttsDelta = ((Number(homeProfile?.impact?.bttsRate || 0) + Number(awayProfile?.impact?.bttsRate || 0)) / 2) * scale;
  adjusted.bttsScore = clamp01(Number(value?.bttsScore || 0) + bttsDelta);
  adjusted.opponentAdjustedForm = { home: homeProfile, away: awayProfile, sampleReliability: round3(reliability) };
  return adjusted;
}
