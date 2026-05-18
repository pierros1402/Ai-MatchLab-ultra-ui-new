function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizeStatus(row) {
  return String(
    row?.status ||
    row?.operationalState ||
    row?.rawStatus ||
    row?.statusType ||
    row?.phase ||
    "UNKNOWN"
  ).trim().toUpperCase();
}

function scoreValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoreOf(row) {
  const home = scoreValue(row?.scoreHome ?? row?.homeScore ?? row?.score?.home ?? row?.scores?.home);
  const away = scoreValue(row?.scoreAway ?? row?.awayScore ?? row?.score?.away ?? row?.scores?.away);
  if (home === null || away === null) return null;
  return { home, away };
}

function isTerminalStatus(status) {
  const s = String(status || "").toUpperCase();
  return [
    "FT",
    "FULL_TIME",
    "STATUS_FINAL",
    "AET",
    "PEN",
    "PENS",
    "CANCELLED",
    "CANCELED",
    "POSTPONED",
    "ABANDONED",
    "VOID"
  ].includes(s);
}

function kickoffTime(row) {
  const raw = row?.kickoffUtc || row?.date || row?.startTime || row?.startUtc || row?.kickoff || null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function hoursSinceKickoff(row, nowMs) {
  const t = kickoffTime(row);
  if (!t) return null;
  return (nowMs - t) / 36e5;
}

function sourceOf(row) {
  return row?.source ||
    row?.provider ||
    row?.sourceMeta?.source ||
    row?.sourceMeta?.provider ||
    row?.sourceMeta?.acquisitionProvider ||
    "unknown";
}

function matchIdOf(row) {
  return String(row?.matchId ?? row?.id ?? row?.fixtureId ?? "").trim();
}

function leagueSlugOf(row) {
  return String(row?.leagueSlug || row?.league || row?.competitionSlug || "unknown").trim();
}

function reasonForWatch(row, options = {}) {
  const status = normalizeStatus(row);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const minAgeHours = Number.isFinite(Number(options.minAgeHours)) ? Number(options.minAgeHours) : 2;
  const ageHours = hoursSinceKickoff(row, nowMs);

  if (isTerminalStatus(status)) return null;

  if (status.includes("STALE_LIVE")) return "stale_live_needs_final_truth";
  if (status.includes("STALE_PRE")) return "stale_pre_needs_final_truth";
  if (status.includes("LIVE")) return "live_needs_followup";
  if (status.includes("FIRST_HALF") || status.includes("SECOND_HALF") || status.includes("HALF_TIME")) {
    return "live_phase_needs_followup";
  }

  if (status === "PRE" || status.includes("SCHEDULED")) {
    if (ageHours !== null && ageHours >= minAgeHours) return "scheduled_past_kickoff_needs_final_truth";
    return null;
  }

  if (status === "UNKNOWN") {
    if (ageHours === null || ageHours >= minAgeHours) return "unknown_status_needs_final_truth";
    return null;
  }

  if (ageHours !== null && ageHours >= minAgeHours) return "non_terminal_past_kickoff_needs_final_truth";
  return null;
}

function priorityFor(reason, row, options = {}) {
  const ageHours = hoursSinceKickoff(row, Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now());

  if (reason === "stale_live_needs_final_truth") return "critical";
  if (reason === "stale_pre_needs_final_truth") return "high";
  if (reason === "scheduled_past_kickoff_needs_final_truth" && ageHours !== null && ageHours >= 6) return "high";
  if (reason === "unknown_status_needs_final_truth") return "high";
  if (reason === "live_needs_followup" || reason === "live_phase_needs_followup") return "medium";
  return "medium";
}

export function buildFinalResultWatchsetFromRows(rows, options = {}) {
  const day = options.day || null;
  const out = [];

  for (const row of rowsOf(rows)) {
    const reason = reasonForWatch(row, options);
    if (!reason) continue;

    const score = scoreOf(row);
    out.push({
      day,
      matchId: matchIdOf(row),
      leagueSlug: leagueSlugOf(row),
      homeTeam: row?.homeTeam || row?.home,
      awayTeam: row?.awayTeam || row?.away,
      currentStatus: normalizeStatus(row),
      rawStatus: row?.rawStatus,
      statusType: row?.statusType,
      minute: row?.minute,
      scoreHome: score ? score.home : null,
      scoreAway: score ? score.away : null,
      kickoffUtc: row?.kickoffUtc || row?.date || row?.startTime || row?.startUtc || row?.kickoff || null,
      source: sourceOf(row),
      reason,
      priority: priorityFor(reason, row, options),
      sourceState: "needs_discovery"
    });
  }

  return out.sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    return (rank[b.priority] || 0) - (rank[a.priority] || 0) ||
      String(a.day || "").localeCompare(String(b.day || "")) ||
      String(a.leagueSlug || "").localeCompare(String(b.leagueSlug || "")) ||
      String(a.kickoffUtc || "").localeCompare(String(b.kickoffUtc || ""));
  });
}

export function summarizeWatchset(rows) {
  const byPriority = {};
  const byReason = {};
  const byLeague = {};

  for (const row of rows) {
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
    byReason[row.reason] = (byReason[row.reason] || 0) + 1;
    byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
  }

  return {
    count: rows.length,
    byPriority,
    byReason,
    byLeague
  };
}
