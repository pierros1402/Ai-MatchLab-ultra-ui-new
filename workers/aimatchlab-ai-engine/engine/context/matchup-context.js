// ============================================================
// MATCHUP CONTEXT ENGINE – Deterministic v2.0
// - Uses Team Context v2 metrics
// - Momentum Differential
// - Stability & Risk Index
// - Game Profile Classification
// ============================================================

import { buildTeamContext } from "./team-context.js";

export async function buildMatchupContext(env, league, season, home, away) {

  const homeCtx = await buildTeamContext(env, league, season, home);
  const awayCtx = await buildTeamContext(env, league, season, away);

  if (!homeCtx.matches || !awayCtx.matches) {

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

  const attackDelta =
    +(homeCtx.goalsForRate - awayCtx.goalsAgainstRate).toFixed(2);

  const defenseDelta =
    +(awayCtx.goalsForRate - homeCtx.goalsAgainstRate).toFixed(2);

  const momentumDelta =
    +(homeCtx.momentumIndex - awayCtx.momentumIndex).toFixed(2);

  const stabilityDelta =
    +(homeCtx.consistencyScore - awayCtx.consistencyScore).toFixed(2);

  const volatilityDelta =
    +(homeCtx.volatilityIndex - awayCtx.volatilityIndex).toFixed(2);

  // ------------------------------------------------------------
  // Risk Index (pace + volatility)
  // ------------------------------------------------------------

  const paceIndex =
    +(
      (
        (homeCtx.goalsForRate + awayCtx.goalsAgainstRate) +
        (awayCtx.goalsForRate + homeCtx.goalsAgainstRate)
      ) / 2
    ).toFixed(2);

  const riskIndex =
    +(
      (
        (homeCtx.volatilityIndex + awayCtx.volatilityIndex) / 2
      ) * (paceIndex / 2.4)
    ).toFixed(2);

  // ------------------------------------------------------------
  // Deterministic Leaning Logic
  // ------------------------------------------------------------

  let overLean = "NEUTRAL";
  if (paceIndex > 2.8 && riskIndex > 1.25)
    overLean = "STRONG_OVER_PROFILE";
  else if (paceIndex > 2.55 && riskIndex > 1.05)
    overLean = "OVER_PROFILE";
  else if (paceIndex < 2.05 && riskIndex < 0.95)
    overLean = "UNDER_PROFILE";

  let bttsLean = "NEUTRAL";
  if (homeCtx.bttsRate > 0.6 && awayCtx.bttsRate > 0.6)
    bttsLean = "BTTS_HIGH_PROB_PROFILE";
  else if (homeCtx.cleanSheetRate > 0.5 || awayCtx.cleanSheetRate > 0.5)
    bttsLean = "BTTS_RISKY_PROFILE";

  // ------------------------------------------------------------
  // Game Type Classification
  // ------------------------------------------------------------

  let gameProfile = "BALANCED";

  if (momentumDelta > 0.3 && attackDelta > 0.5)
    gameProfile = "HOME_DOMINANT_TREND";

  else if (momentumDelta < -0.3 && defenseDelta > 0.5)
    gameProfile = "AWAY_UPSWING";

  else if (riskIndex > 1.4)
    gameProfile = "HIGH_VARIANCE_GAME";

  else if (stabilityDelta > 0.3)
    gameProfile = "CONTROLLED_EDGE_HOME";

  return {
    ok: true,
    league,
    season,
    home,
    away,

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