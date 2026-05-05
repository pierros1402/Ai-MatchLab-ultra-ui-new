function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTeamKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value)) || /^www\./i.test(normalizeText(value));
}

function looksLikePlaceholderText(value) {
  const text = normalizeText(value);
  const lower = text.toLowerCase();

  if (!text) return true;

  if (
    lower === "yyyy-mm-dd" ||
    lower === "opponent name" ||
    lower === "home_or_away" ||
    lower === "team name here" ||
    lower === "team_key_here" ||
    lower.includes("verified player") ||
    lower.includes("player one") ||
    lower.includes("player two") ||
    lower.includes("player three") ||
    lower.includes("player four") ||
    lower.includes("replace placeholders")
  ) {
    return true;
  }

  return false;
}

function looksLikeFakePlayerName(value) {
  const text = normalizeText(value);
  if (!text) return true;
  if (looksLikeUrl(text)) return true;
  if (looksLikePlaceholderText(text)) return true;

  const lower = text.toLowerCase();
  const bannedExact = new Set([
    "evidence",
    "url",
    "source",
    "sources",
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
    "player",
    "players",
    "lineup",
    "starting xi",
    "starting 11",
    "match report"
  ]);

  if (bannedExact.has(lower)) return true;
  if (lower.includes("http")) return true;
  if (lower.includes("evidence")) return true;
  if (lower.includes("source:")) return true;
  if (lower.includes("url:")) return true;
  if (/^\d+$/.test(lower)) return true;

  return false;
}

function normalizeStarter(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const lower = normalizeText(value).toLowerCase();
  if (["true", "yes", "y", "starter", "started", "start", "xi", "starting"].includes(lower)) return true;
  if (["false", "no", "n", "sub", "substitute", "bench", "unused", "not_started"].includes(lower)) return false;

  return null;
}

function normalizeMinutes(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 130) return null;
  return Math.round(n);
}

function addIssue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

function isManualPlayerUsageInput(raw = {}) {
  const source = normalizeText(raw?.source).toLowerCase();
  const sourceInputType = normalizeText(raw?.sourceInputType).toLowerCase();
  const metaSourceInputType = normalizeText(raw?.meta?.sourceInputType).toLowerCase();

  return (
    source === "tracked_player_usage_manual_result" ||
    source === "manual_player_usage_result" ||
    sourceInputType === "manual_result" ||
    metaSourceInputType === "manual_result"
  );
}

function hasStrictManualApproval(raw = {}) {
  return raw?.reviewed === true &&
    raw?.productionGrade === true &&
    raw?.meta?.reviewed === true &&
    raw?.meta?.productionGrade === true;
}

function normalizePlayer(row, ctx, issues) {
  if (!isPlainObject(row)) {
    addIssue(issues, "invalid_player_row", "player row is not an object", ctx);
    return null;
  }

  const name = normalizeText(row.name || row.player || row.displayName);
  if (looksLikeFakePlayerName(name)) {
    addIssue(issues, "invalid_player_name", "player name is empty, fake, evidence text, or URL", {
      ...ctx,
      value: name || null
    });
    return null;
  }

  const starter = normalizeStarter(row.starter);
  if (starter === null) {
    addIssue(issues, "invalid_starter", "starter must be boolean or a normalizable starter value", {
      ...ctx,
      player: name,
      value: row.starter ?? null
    });
    return null;
  }

  return {
    name,
    starter,
    minutes: normalizeMinutes(row.minutes),
    position: normalizeText(row.position) || null
  };
}

function normalizeMatch(row, matchIndex, issues) {
  if (!isPlainObject(row)) {
    addIssue(issues, "invalid_match_row", "match row is not an object", { matchIndex });
    return null;
  }

  const date = normalizeText(row.date || row.kickoffUtc);
  const opponent = normalizeText(row.opponent);
  const side = normalizeText(row.side).toLowerCase();

  if (!date || looksLikePlaceholderText(date)) {
    addIssue(issues, "invalid_match_date", "match date is missing or placeholder", {
      matchIndex,
      value: date || null
    });
    return null;
  }

  if (!opponent || looksLikePlaceholderText(opponent)) {
    addIssue(issues, "invalid_match_opponent", "match opponent is missing or placeholder", {
      matchIndex,
      value: opponent || null
    });
    return null;
  }

  if (!["home", "away"].includes(side)) {
    addIssue(issues, "invalid_match_side", "match side must be home or away", {
      matchIndex,
      value: row.side ?? null
    });
    return null;
  }

  if (!Array.isArray(row.players)) {
    addIssue(issues, "missing_players_array", "match is missing players array", { matchIndex });
    return null;
  }

  const players = row.players
    .map((player, playerIndex) => normalizePlayer(player, { matchIndex, playerIndex }, issues))
    .filter(Boolean);

  if (players.length <= 0) {
    addIssue(issues, "empty_valid_players", "match has no valid player rows", { matchIndex });
    return null;
  }

  return {
    matchId: normalizeText(row.matchId) || null,
    date,
    opponent,
    side,
    players
  };
}

export function validatePlayerUsageResearchResult(raw = {}, fallback = {}) {
  const issues = [];

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      status: "invalid_rejected",
      reason: "research_result_not_object",
      confidence: 0,
      issues: [{ code: "invalid_root", message: "research result is not an object" }],
      record: null
    };
  }

  const team = normalizeText(raw.team || fallback.team);
  const key = normalizeTeamKey(raw.key || fallback.key || team);
  const leagueSlug = normalizeText(raw.leagueSlug || fallback.leagueSlug) || null;
  const confidence = Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0;

  if (!team) {
    addIssue(issues, "missing_team", "required team is missing");
  }

  if (!key) {
    addIssue(issues, "missing_key", "team key could not be normalized");
  }

  if (!Array.isArray(raw.matches)) {
    addIssue(issues, "missing_matches_array", "required matches array is missing");
  }

  const matches = Array.isArray(raw.matches)
    ? raw.matches.map((match, index) => normalizeMatch(match, index, issues)).filter(Boolean)
    : [];

  const reviewed = raw.reviewed === true || raw?.meta?.reviewed === true || raw.status === "empty_reviewed";
  const hasNoInput = raw.status === "unresolved_no_input" || raw.status === "no_input";
  const manualInput = isManualPlayerUsageInput(raw);
  const strictManualApproval = hasStrictManualApproval(raw);

  if (manualInput && !strictManualApproval) {
    addIssue(issues, "manual_result_not_strictly_approved", "manual player-usage result must have reviewed:true and productionGrade:true at root and meta levels before import", {
      reviewed: raw.reviewed ?? null,
      productionGrade: raw.productionGrade ?? null,
      metaReviewed: raw?.meta?.reviewed ?? null,
      metaProductionGrade: raw?.meta?.productionGrade ?? null
    });
  }

  let status = "invalid_rejected";
  let reason = "validation_failed";
  let ok = false;

  if (hasNoInput) {
    status = "unresolved_no_input";
    reason = "research_result_marked_no_input";
  } else if (manualInput && !strictManualApproval) {
    status = "invalid_rejected";
    reason = "manual_result_not_strictly_approved";
  } else if (manualInput && issues.length > 0) {
    status = "invalid_rejected";
    reason = "manual_result_has_validation_issues";
  } else if (matches.length <= 0 && reviewed && issues.length === 0) {
    status = "empty_reviewed";
    reason = "reviewed_but_no_valid_usage_found";
  } else if (matches.length <= 0) {
    status = issues.length > 0 ? "invalid_rejected" : "empty_reviewed";
    reason = issues.length > 0 ? "no_valid_matches_after_validation" : "no_matches";
  } else if (issues.some(issue => ["missing_team", "missing_key", "missing_matches_array"].includes(issue.code))) {
    status = "invalid_rejected";
    reason = "required_fields_missing";
  } else if (confidence >= 0.55 && matches.length >= 2) {
    status = "valid_usage";
    reason = "valid_usage_importable";
    ok = true;
  } else if (confidence >= 0.35) {
    status = "partial_usage";
    reason = "partial_usage_importable";
    ok = true;
  } else {
    status = "invalid_rejected";
    reason = "confidence_below_threshold";
  }

  const record = ok
    ? {
        key,
        team,
        leagueSlug,
        matches,
        source: normalizeText(raw.source) || "player-usage-research-results",
        confidence,
        updatedAt: new Date().toISOString(),
        meta: {
          ...(isPlainObject(raw.meta) ? raw.meta : {}),
          status,
          validationReason: reason,
          validator: "player-usage-validator"
        }
      }
    : null;

  return {
    ok,
    status,
    reason,
    confidence,
    matchCount: matches.length,
    playerCount: matches.reduce((sum, match) => sum + match.players.length, 0),
    issues,
    record
  };
}
