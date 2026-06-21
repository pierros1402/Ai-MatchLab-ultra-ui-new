/**
 * ai-odds-model.js
 *
 * The autonomous "AI oddsmaker". No odds feed, no API: the engine prices a match
 * itself — exactly the way a specialised model would reason about it — from the
 * statistics it already owns (league standings: goals for/against per game, plus
 * home advantage). Expected goals → bivariate Poisson → outcome probabilities →
 * fair odds → opening line with a realistic bookmaker margin.
 *
 * Pure functions only. No fetch, no fs, no writes.
 */

const MAX_GOALS = 10;          // score grid cap (P beyond this is negligible)
const HOME_ADVANTAGE = 1.12;   // ~12% scoring lift at home (league-agnostic prior)
const DEFAULT_MARGIN = 0.06;   // 6% overround on the opening line

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/**
 * Expected goals for each side from standings rates.
 * @param {{goalsFor,goalsAgainst,played}} home
 * @param {{goalsFor,goalsAgainst,played}} away
 * @param {number} leagueAvgGoalsPerTeam fallback when a side has no games yet
 */
export function lambdasFromStandings(home, away, leagueAvgGoalsPerTeam = 1.35) {
  const rate = (row, key) => {
    const played = Number(row?.played) || 0;
    const val = Number(row?.[key]);
    if (!played || !Number.isFinite(val)) return leagueAvgGoalsPerTeam;
    return val / played;
  };

  const homeAtt = rate(home, "goalsFor");      // home scoring rate
  const homeDef = rate(home, "goalsAgainst");  // home conceding rate
  const awayAtt = rate(away, "goalsFor");
  const awayDef = rate(away, "goalsAgainst");

  // A team's expected goals = blend of its attack and the opponent's defence.
  const lambdaHome = ((homeAtt + awayDef) / 2) * HOME_ADVANTAGE;
  const lambdaAway = (awayAtt + homeDef) / 2;

  return {
    lambdaHome: clamp(lambdaHome, 0.15, 5),
    lambdaAway: clamp(lambdaAway, 0.15, 5)
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Full market probabilities from expected goals, via an independent-Poisson
 * score grid. Returns 1X2, Over/Under 2.5 and BTTS probabilities.
 */
export function marketProbabilities(lambdaHome, lambdaAway) {
  const homePmf = [];
  const awayPmf = [];
  for (let k = 0; k <= MAX_GOALS; k++) {
    homePmf[k] = poissonPmf(k, lambdaHome);
    awayPmf[k] = poissonPmf(k, lambdaAway);
  }

  let pHome = 0, pDraw = 0, pAway = 0;
  let pOver15 = 0, pOver25 = 0, pOver35 = 0;
  let pBttsYes = 0;

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = homePmf[h] * awayPmf[a];
      if (p <= 0) continue;

      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;

      const tot = h + a;
      if (tot > 1.5) pOver15 += p;
      if (tot > 2.5) pOver25 += p;
      if (tot > 3.5) pOver35 += p;
      if (h > 0 && a > 0) pBttsYes += p;
    }
  }

  // Normalise the 1X2 mass (negligible tail beyond the grid).
  const total = pHome + pDraw + pAway || 1;
  const home = pHome / total, draw = pDraw / total, away = pAway / total;

  return {
    // UI market keys: 1X2, DC, OU15, OU25, OU35, BTTS
    "1X2":  { home, draw, away },
    "DC":   { "1X": home + draw, "12": home + away, "X2": draw + away },
    "OU15": { over: pOver15, under: 1 - pOver15 },
    "OU25": { over: pOver25, under: 1 - pOver25 },
    "OU35": { over: pOver35, under: 1 - pOver35 },
    "BTTS": { yes: pBttsYes, no: 1 - pBttsYes }
  };
}

/**
 * Convert a probability map into fair decimal odds with a bookmaker margin.
 * booksum becomes 1 + margin (margin distributed proportionally to probability).
 */
export function probsToOdds(probs, margin = DEFAULT_MARGIN) {
  const out = {};
  for (const [sel, p] of Object.entries(probs)) {
    const prob = clamp(p, 0.001, 0.999);
    out[sel] = round2(1 / (prob * (1 + margin)));
  }
  return out;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Top-level: price a match end-to-end from standings rows.
 * Returns opening odds for every supported market plus the underlying model.
 */
export function priceMatchFromStandings(home, away, options = {}) {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const leagueAvg = options.leagueAvgGoalsPerTeam ?? 1.35;

  const { lambdaHome, lambdaAway } = lambdasFromStandings(home, away, leagueAvg);
  const probs = marketProbabilities(lambdaHome, lambdaAway);

  const markets = {};
  for (const [market, sel] of Object.entries(probs)) {
    markets[market] = {
      odds:  probsToOdds(sel, margin),
      probs: Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, round3(v)]))
    };
  }

  return {
    model: {
      lambdaHome: round3(lambdaHome),
      lambdaAway: round3(lambdaAway),
      margin,
      source: "ai_poisson_from_standings"
    },
    markets
  };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
