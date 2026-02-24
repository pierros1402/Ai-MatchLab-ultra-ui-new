// ============================================================
// AIMATCHLAB — RANKING ENGINE v1 (SKELETON)
// Pure deterministic standings computation
// NO IO • NO ENV • NO FETCH
// ============================================================

/**
 * PUBLIC API (LOCKED)
 */
export function computeStandings({
  teams,
  h2hMatrix = {},
  leagueRules,
  phase = "regular",
  previousStandings = null
}) {
  if (!teams || !leagueRules) {
    throw new Error("ranking-engine: missing required inputs");
  }

  // ------------------------------------------------------------
  // 1. Resolve phase teams
  // ------------------------------------------------------------
  const eligibleTeams = resolvePhaseTeams(
    teams,
    leagueRules,
    phase,
    previousStandings
  );

  // ------------------------------------------------------------
  // 2. Base rows
  // ------------------------------------------------------------
  let rows = Object.entries(eligibleTeams).map(([team, stats]) =>
    buildRow(team, stats)
  );

  // ------------------------------------------------------------
  // 3. Primary sort (points)
  // ------------------------------------------------------------
  rows.sort(comparePoints);

  // ------------------------------------------------------------
  // 4. Resolve ties (pipeline)
  // ------------------------------------------------------------
  rows = resolveAllTies(rows, h2hMatrix, leagueRules.tieBreakOrder);

  // ------------------------------------------------------------
  // 5. Assign positions
  // ------------------------------------------------------------
  assignPositions(rows);

  // ------------------------------------------------------------
  // 6. Position delta
  // ------------------------------------------------------------
  applyPositionDelta(rows, previousStandings);

  // ------------------------------------------------------------
  // 7. Ranking hash (deterministic)
  // ------------------------------------------------------------
  const rankingHash = buildRankingHash(rows);

  // ------------------------------------------------------------
  // 8. Tie groups (for explainability)
  // ------------------------------------------------------------
  const tieGroups = extractTieGroups(rows);

  return {
    standings: rows,
    rankingHash,
    tieGroups
  };
}

//
// ============================================================
// INTERNAL HELPERS (SAFE TO EXTEND — NOT PUBLIC CONTRACT)
// ============================================================
//

function resolvePhaseTeams(teams, leagueRules, phase, previousStandings) {
  const phaseRules = leagueRules?.phases?.[phase];

  if (!phaseRules || phase === "regular") {
    return teams;
  }

  // Split phase placeholder logic
  // (real logic added later without breaking API)
  if (phaseRules.type === "split" && previousStandings) {
    const groupSize = phaseRules.groupSize ?? Object.keys(teams).length;

    const allowed = previousStandings
      .slice(0, groupSize)
      .map(r => r.team);

    return Object.fromEntries(
      Object.entries(teams).filter(([t]) => allowed.includes(t))
    );
  }

  return teams;
}

function buildRow(team, stats) {
  return {
    team,
    points: stats.points ?? 0,
    goalsFor: stats.goalsFor ?? 0,
    goalsAgainst: stats.goalsAgainst ?? 0,
    goalDifference:
      stats.goalDifference ??
      (stats.goalsFor ?? 0) - (stats.goalsAgainst ?? 0),

    position: null,
    positionDelta: 0,
    tieBreaker: null
  };
}

// ------------------------------------------------------------
// BASE COMPARATORS
// ------------------------------------------------------------

function comparePoints(a, b) {
  return b.points - a.points;
}

// ------------------------------------------------------------
// TIE RESOLUTION PIPELINE
// ------------------------------------------------------------

function resolveAllTies(rows, h2hMatrix, tieBreakOrder) {
  if (!tieBreakOrder || tieBreakOrder.length === 0) {
    return rows;
  }

  let result = [...rows];

  // Walk tie groups
  let i = 0;
  while (i < result.length) {
    let j = i + 1;

    while (j < result.length && result[j].points === result[i].points) {
      j++;
    }

    if (j - i > 1) {
      const slice = result.slice(i, j);

      const resolved = resolveTieGroup(
        slice,
        h2hMatrix,
        tieBreakOrder
      );

      result.splice(i, slice.length, ...resolved);
    }

    i = j;
  }

  return result;
}

function resolveTieGroup(group, h2hMatrix, tieBreakOrder) {
  // Skeleton: apply sequential comparators
  const sorted = [...group];

  sorted.sort((a, b) => {
    for (const rule of tieBreakOrder) {
      const diff = applyTieRule(rule, a, b, group, h2hMatrix);
      if (diff !== 0) return diff;
    }
    return a.team.localeCompare(b.team);
  });

  return sorted;
}

function applyTieRule(rule, a, b, group, h2hMatrix) {
  switch (rule) {
    case "points":
      return b.points - a.points;

    case "goalDifference":
      return b.goalDifference - a.goalDifference;

    case "goalsFor":
      return b.goalsFor - a.goalsFor;

    case "h2h":
      return compareH2H(a.team, b.team, h2hMatrix);

    default:
      return 0;
  }
}

// ------------------------------------------------------------
// H2H (placeholder deterministic logic)
// ------------------------------------------------------------

function compareH2H(teamA, teamB, h2hMatrix) {
  const key = buildPairKey(teamA, teamB);
  const record = h2hMatrix[key];

  if (!record) return 0;

  if (teamA < teamB) {
    return (record.pointsB ?? 0) - (record.pointsA ?? 0);
  } else {
    return (record.pointsA ?? 0) - (record.pointsB ?? 0);
  }
}

function buildPairKey(a, b) {
  return [a, b].sort().join("|");
}

// ------------------------------------------------------------
// POSITION ASSIGNMENT
// ------------------------------------------------------------

function assignPositions(rows) {
  rows.forEach((row, index) => {
    row.position = index + 1;
  });
}

// ------------------------------------------------------------
// POSITION DELTAS
// ------------------------------------------------------------

function applyPositionDelta(rows, previousStandings) {
  if (!previousStandings) return;

  const prevMap = new Map(
    previousStandings.map(r => [r.team, r.position])
  );

  rows.forEach(row => {
    const prev = prevMap.get(row.team);
    if (prev != null) {
      row.positionDelta = prev - row.position;
    }
  });
}

// ------------------------------------------------------------
// HASHING
// ------------------------------------------------------------

function buildRankingHash(rows) {
  const stable = rows.map(r => ({
    team: r.team,
    position: r.position,
    points: r.points,
    goalDifference: r.goalDifference
  }));

  return simpleHash(JSON.stringify(stable));
}

// Lightweight deterministic hash (Worker-safe)
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

// ------------------------------------------------------------
// TIE GROUP EXTRACTION
// ------------------------------------------------------------

function extractTieGroups(rows) {
  const groups = [];
  let current = [rows[0]?.team];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].points === rows[i - 1].points) {
      current.push(rows[i].team);
    } else {
      if (current.length > 1) groups.push(current);
      current = [rows[i].team];
    }
  }

  if (current.length > 1) groups.push(current);

  return groups;
}