/**
 * standings-validator.js
 *
 * Deterministic validation of a parsed standings table.
 * No AI, no guessing — pure arithmetic and structural checks.
 *
 * This is the TRUTH GATE. A standings table is only accepted if the
 * numbers are internally consistent. The AI never decides correctness;
 * mathematics does.
 */

function isInt(n) {
  return typeof n === "number" && Number.isInteger(n);
}

// ─── National-team detection ────────────────────────────────────────────────────
// A structural standings table from a NATIONAL-team competition (World Cup, the
// 2026 WC dominates "2026 <country> football" searches; also continental cups and
// qualifiers) is arithmetically valid but is NOT a domestic club league. We reject
// any table whose rows are mostly nation names.

const NATION_NAMES = new Set([
  "afghanistan","albania","algeria","andorra","angola","antigua and barbuda","argentina","armenia",
  "australia","austria","azerbaijan","bahamas","bahrain","bangladesh","barbados","belarus","belgium",
  "belize","benin","bermuda","bhutan","bolivia","bosnia and herzegovina","botswana","brazil","brunei",
  "bulgaria","burkina faso","burundi","cambodia","cameroon","canada","cape verde","central african republic",
  "chad","chile","china","china pr","chinese taipei","taiwan","colombia","comoros","congo","dr congo",
  "costa rica","croatia","cuba","curacao","curaçao","cyprus","czech republic","czechia","denmark","djibouti",
  "dominica","dominican republic","ecuador","egypt","el salvador","england","equatorial guinea","eritrea",
  "estonia","eswatini","swaziland","ethiopia","faroe islands","fiji","finland","france","gabon","gambia",
  "georgia","germany","ghana","gibraltar","greece","grenada","guatemala","guinea","guinea-bissau","guyana",
  "haiti","honduras","hong kong","hungary","iceland","india","indonesia","iran","ir iran","iraq","ireland",
  "republic of ireland","israel","italy","ivory coast","cote d'ivoire","côte d'ivoire","jamaica","japan",
  "jordan","kazakhstan","kenya","kosovo","kuwait","kyrgyzstan","laos","latvia","lebanon","lesotho","liberia",
  "libya","liechtenstein","lithuania","luxembourg","macau","madagascar","malawi","malaysia","maldives","mali",
  "malta","mauritania","mauritius","mexico","moldova","mongolia","montenegro","montserrat","morocco",
  "mozambique","myanmar","namibia","nepal","netherlands","new caledonia","new zealand","nicaragua","niger",
  "nigeria","north korea","korea dpr","north macedonia","northern ireland","norway","oman","pakistan",
  "palestine","panama","papua new guinea","paraguay","peru","philippines","poland","portugal","puerto rico",
  "qatar","romania","russia","rwanda","saint kitts and nevis","saint lucia","saint vincent and the grenadines",
  "samoa","san marino","sao tome and principe","saudi arabia","scotland","senegal","serbia","seychelles",
  "sierra leone","singapore","slovakia","slovenia","solomon islands","somalia","south africa","south korea",
  "korea republic","south sudan","spain","sri lanka","sudan","suriname","sweden","switzerland","syria",
  "tahiti","tajikistan","tanzania","thailand","timor-leste","togo","tonga","trinidad and tobago","tunisia",
  "turkey","türkiye","turkmenistan","turks and caicos islands","uganda","ukraine",
  "united arab emirates","uae","united states","usa","uruguay","uzbekistan","vanuatu","venezuela","vietnam",
  "wales","yemen","zambia","zimbabwe"
]);

function nationNameRatio(rows) {
  const names = rows
    .map(r => String(r.teamName || "").toLowerCase().trim())
    .filter(Boolean);
  if (names.length === 0) return 0;
  const nationHits = names.filter(n => NATION_NAMES.has(n)).length;
  return nationHits / names.length;
}

// ─── Per-row arithmetic ───────────────────────────────────────────────────────

export function validateRow(row) {
  const checks = {
    hasTeam:        typeof row.teamName === "string" && row.teamName.trim().length > 0,
    playedConsistent: null,
    pointsConsistent: null,
    gdConsistent:     null
  };

  const { played, wins, draws, losses, points, goalsFor, goalsAgainst, goalDifference } = row;

  // Played = Wins + Draws + Losses
  if (isInt(played) && isInt(wins) && isInt(draws) && isInt(losses)) {
    checks.playedConsistent = played === wins + draws + losses;
  }

  // Points = Wins×3 + Draws  (standard scoring).
  // Points can be REDUCED by disciplinary deductions (common in many leagues —
  // e.g. Chinese Super League, Serie A), so points < expected is NOT an error.
  // Only points > expected is structurally impossible (→ a parse/column error).
  if (isInt(points) && isInt(wins) && isInt(draws)) {
    const expected = wins * 3 + draws;
    if (points === expected)      checks.pointsConsistent = true;   // exact match
    else if (points < expected)   checks.pointsConsistent = null;   // likely deduction
    else                          checks.pointsConsistent = false;  // impossible
  }

  // GD = GF - GA
  if (isInt(goalDifference) && isInt(goalsFor) && isInt(goalsAgainst)) {
    checks.gdConsistent = goalDifference === goalsFor - goalsAgainst;
  }

  // A row passes if no check explicitly fails AND at least one passes
  const failed = Object.values(checks).some(v => v === false);
  const passedAny = Object.values(checks).some(v => v === true);

  return {
    ...checks,
    valid: !failed && passedAny && checks.hasTeam
  };
}

// ─── Range sanity ─────────────────────────────────────────────────────────────

function rangeSane(row) {
  const { played, wins, draws, losses, points } = row;
  if (isInt(played) && (played < 0 || played > 60)) return false;
  if (isInt(wins)   && (wins   < 0 || wins   > 60)) return false;
  if (isInt(draws)  && (draws  < 0 || draws  > 60)) return false;
  if (isInt(losses) && (losses < 0 || losses > 60)) return false;
  if (isInt(points) && (points < 0 || points > 180)) return false;
  return true;
}

// ─── Whole-table validation ───────────────────────────────────────────────────

export function validateStandings(rows, options = {}) {
  const expectedTeamsMin = options.expectedTeamsMin || 6;
  const expectedTeamsMax = options.expectedTeamsMax || 30;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { valid: false, confidence: 0, reason: "empty_table", rowCount: 0 };
  }

  // Structural: team count
  const teamCountOk = rows.length >= expectedTeamsMin && rows.length <= expectedTeamsMax;

  // Duplicate team names
  const names = rows.map(r => String(r.teamName || "").toLowerCase().trim());
  const uniqueNames = new Set(names);
  const duplicateCount = rows.length - uniqueNames.size;

  // Per-row arithmetic
  const rowValidations = rows.map(validateRow);
  const validRows = rowValidations.filter(v => v.valid).length;
  const validRatio = rows.length > 0 ? validRows / rows.length : 0;

  // Range sanity
  const rangeFailures = rows.filter(r => !rangeSane(r)).length;

  // Played values — at least some non-zero (table not just "season start" zeros)
  const playedValues = rows.map(r => r.played).filter(isInt);
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : 0;
  const hasProgress = maxPlayed > 0;

  // National-team table? (World Cup / continental / qualifiers) → not a club league.
  const nationRatio = nationNameRatio(rows);
  const isNationalTeamTable = nationRatio >= 0.5;

  if (isNationalTeamTable) {
    return {
      valid: false,
      confidence: 0,
      rowCount: rows.length,
      reason: "national_team_table",
      nationRatio: Number(nationRatio.toFixed(3)),
      reasons: [`national_team_table_${nationRatio.toFixed(2)}`]
    };
  }

  // ── Confidence computation ──────────────────────────────────────────────────

  let confidence = 0;
  confidence += validRatio * 0.55;            // arithmetic correctness (most important)
  confidence += teamCountOk ? 0.15 : 0;       // right number of teams
  confidence += duplicateCount === 0 ? 0.15 : 0; // no duplicate teams
  confidence += rangeFailures === 0 ? 0.10 : 0;  // values in sane ranges
  confidence += hasProgress ? 0.05 : 0;       // table shows actual results

  confidence = Math.max(0, Math.min(1, confidence));

  // Hard failures override confidence
  const reasons = [];
  if (!teamCountOk)        reasons.push(`team_count_${rows.length}_outside_${expectedTeamsMin}_${expectedTeamsMax}`);
  if (duplicateCount > 0)  reasons.push(`duplicate_teams_${duplicateCount}`);
  if (rangeFailures > 0)   reasons.push(`range_failures_${rangeFailures}`);
  if (validRatio < 0.7)    reasons.push(`low_arithmetic_ratio_${validRatio.toFixed(2)}`);
  if (!hasProgress)        reasons.push("no_matches_played");

  const valid = confidence >= (options.confidenceThreshold || 0.80) &&
                duplicateCount === 0 &&
                validRatio >= 0.7;

  return {
    valid,
    confidence: Number(confidence.toFixed(3)),
    rowCount: rows.length,
    validRows,
    validRatio: Number(validRatio.toFixed(3)),
    teamCountOk,
    duplicateCount,
    rangeFailures,
    maxPlayed,
    hasProgress,
    reasons
  };
}

// ─── Cross-source comparison ──────────────────────────────────────────────────
// Compares two parsed tables for convergence (same positions/points)

export function compareStandings(tableA, tableB) {
  if (!Array.isArray(tableA) || !Array.isArray(tableB)) {
    return { converge: false, reason: "invalid_input", agreement: 0 };
  }

  const mapB = new Map();
  for (const row of tableB) {
    const key = String(row.teamName || "").toLowerCase().trim();
    if (key) mapB.set(key, row);
  }

  let matched = 0;
  let agreed = 0;
  const conflicts = [];

  for (const rowA of tableA) {
    const key = String(rowA.teamName || "").toLowerCase().trim();
    const rowB = mapB.get(key);
    if (!rowB) continue;

    matched++;

    const pointsAgree = isInt(rowA.points) && isInt(rowB.points) && rowA.points === rowB.points;
    const playedAgree = isInt(rowA.played) && isInt(rowB.played) && rowA.played === rowB.played;

    if (pointsAgree && playedAgree) {
      agreed++;
    } else {
      conflicts.push({
        team: rowA.teamName,
        a: { points: rowA.points, played: rowA.played },
        b: { points: rowB.points, played: rowB.played }
      });
    }
  }

  const agreement = matched > 0 ? agreed / matched : 0;

  return {
    converge: agreement >= 0.85 && matched >= Math.min(tableA.length, tableB.length) * 0.7,
    agreement: Number(agreement.toFixed(3)),
    matched,
    agreed,
    conflicts: conflicts.slice(0, 5)
  };
}
