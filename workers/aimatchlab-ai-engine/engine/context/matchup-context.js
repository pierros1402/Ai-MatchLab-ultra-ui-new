// ============================================================
// MATCHUP CONTEXT ENGINE – Deterministic v2.1
// - Uses Team Context v2 metrics
// - Momentum Differential
// - Stability & Risk Index
// - Game Profile Classification
// ============================================================

import { buildTeamContext } from "./team-context.js";

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export async function buildMatchupContext(env, league, season, home, away) {
  const homeCtx = await buildTeamContext(env, league, season, home);
  const awayCtx = await buildTeamContext(env, league, season, away);

  if (!homeCtx?.matches || !awayCtx?.matches) {
    return {
      ok: true,
      league,
      season,
      home,
      away,
      dataReady: false,

      attackDelta: 0,
      defenseDelta: 0,
      momentumDelta: 0,
      stabilityDelta: 0,
      volatilityDelta: 0,

      paceIndex: 0,
      riskIndex: 1,

      overLean: "NEUTRAL",
      bttsLean: "NEUTRAL",
      gameProfile: "INSUFFICIENT_DATA"
    };
  }

  // ------------------------------------------------------------
  // Core Differentials
  // ------------------------------------------------------------

  const attackDelta = +(
    n(homeCtx.goalsForRate) - n(awayCtx.goalsAgainstRate)
  ).toFixed(2);

  const defenseDelta = +(
    n(awayCtx.goalsForRate) - n(homeCtx.goalsAgainstRate)
  ).toFixed(2);

  const momentumDelta = +(
    n(homeCtx.momentumIndex) - n(awayCtx.momentumIndex)
  ).toFixed(2);

  const stabilityDelta = +(
    n(homeCtx.consistencyScore) - n(awayCtx.consistencyScore)
  ).toFixed(2);

  const volatilityDelta = +(
    n(homeCtx.volatilityIndex) - n(awayCtx.volatilityIndex)
  ).toFixed(2);

  // ------------------------------------------------------------
  // Risk Index (pace + volatility)
  // ------------------------------------------------------------

  const paceIndex = +(
    (
      (
        (n(homeCtx.goalsForRate) + n(awayCtx.goalsAgainstRate)) +
        (n(awayCtx.goalsForRate) + n(homeCtx.goalsAgainstRate))
      ) / 2
    )
  ).toFixed(2);

  const riskIndex = +(
    (
      ((n(homeCtx.volatilityIndex) + n(awayCtx.volatilityIndex)) / 2) *
      (paceIndex / 2.4)
    )
  ).toFixed(2);

  // ------------------------------------------------------------
  // Deterministic Leaning Logic
  // ------------------------------------------------------------

  let overLean = "NEUTRAL";

  if (paceIndex > 2.8 && riskIndex > 1.25) {
    overLean = "STRONG_OVER_PROFILE";
  } else if (paceIndex > 2.55 && riskIndex > 1.05) {
    overLean = "OVER_PROFILE";
  } else if (paceIndex < 2.05 && riskIndex < 0.95) {
    overLean = "UNDER_PROFILE";
  }

  let bttsLean = "NEUTRAL";

  if (n(homeCtx.bttsRate) > 0.6 && n(awayCtx.bttsRate) > 0.6) {
    bttsLean = "BTTS_HIGH_PROB_PROFILE";
  } else if (n(homeCtx.cleanSheetRate) > 0.5 || n(awayCtx.cleanSheetRate) > 0.5) {
    bttsLean = "BTTS_RISKY_PROFILE";
  }

  // ------------------------------------------------------------
  // Game Type Classification
  // ------------------------------------------------------------

  let gameProfile = "BALANCED";

  if (momentumDelta > 0.3 && attackDelta > 0.5) {
    gameProfile = "HOME_DOMINANT_TREND";
  } else if (momentumDelta < -0.3 && defenseDelta > 0.5) {
    gameProfile = "AWAY_UPSWING";
  } else if (riskIndex > 1.4) {
    gameProfile = "HIGH_VARIANCE_GAME";
  } else if (stabilityDelta > 0.3) {
    gameProfile = "CONTROLLED_EDGE_HOME";
  }

  return {
    ok: true,
    league,
    season,
    home,
    away,
    dataReady: true,

    attackDelta,
    defenseDelta,
    momentumDelta,
    stabilityDelta,
    volatilityDelta,

    paceIndex,
    riskIndex,

    overLean,
    bttsLean,
    gameProfile
  };
}