// Durable data incidents. A source returning rows is not proof that Value used them.
export function updateValueDataAlarm(previous, { dayKey, fixtures, joinedIds, nowMs, diagnoses = {} }) {
  const queue = structuredClone(previous || { schema: "ai-matchlab.value-data-alarm.v1", incidents: {}, research: {} });
  if (queue.schema !== "ai-matchlab.value-data-alarm.v1" || !queue.incidents || !queue.research) throw new Error("invalid_data_alarm_queue");
  const joined = new Set(joinedIds);
  const now = new Date(nowMs).toISOString();
  for (const incident of Object.values(queue.incidents)) {
    if (incident.status === "RESOLVED") continue;
    const kickoff = Date.parse(incident.kickoffUtc);
    if (kickoff <= nowMs) incident.status = "HISTORICAL_GAP_OPEN";
    else if (kickoff - nowMs <= 86400000) incident.status = "PREMATCH_PREPARATION_OVERDUE";
  }
  for (const row of fixtures) {
    const id = row.canonicalId || row.matchId;
    if (!/^cid_[a-zA-Z0-9_]+$/.test(id || "") || !/^[a-zA-Z0-9_.-]+$/.test(row.leagueSlug || "")) throw new Error("invalid_data_alarm_identity");
    const old = queue.incidents[id];
    if (joined.has(id)) {
      if (old && old.status !== "RESOLVED") queue.incidents[id] = { ...old, status: "RESOLVED", resolvedAt: now, resolution: "verified_assessment_join_observed" };
      continue;
    }
    const kickoffMs = Date.parse(row.kickoffUtc || "");
    const diagnosis = diagnoses[row.leagueSlug] || { reasonCodes: ["ASSESSMENT_INPUT_MISSING"] };
    const historical = Number.isFinite(kickoffMs) && kickoffMs <= nowMs;
    const next = { ...old, canonicalId: id, dayKey, leagueSlug: row.leagueSlug,
      home: row.homeTeam || row.home, away: row.awayTeam || row.away, kickoffUtc: row.kickoffUtc,
      firstSeenAt: old?.firstSeenAt || now, readyByUtc: Number.isFinite(kickoffMs) ? new Date(kickoffMs - 86400000).toISOString() : null,
      status: historical ? "HISTORICAL_GAP_OPEN" : kickoffMs - nowMs <= 86400000 ? "PREMATCH_PREPARATION_OVERDUE" : "DATA_SEARCH_REQUIRED",
      diagnosis, requiredAction: "acquire_and_validate_source_evidence", historicalPredictionsRegenerated: false };
    delete next.resolvedAt; delete next.resolution;
    queue.incidents[id] = next;
  }
  // Incidents absent from a new day's fixture set are intentionally retained.
  return queue;
}

export function dueValueDataResearch(queue, nowMs, maxLeagues = 2) {
  const groups = new Map();
  for (const incident of Object.values(queue.incidents)) {
    if (incident.status === "RESOLVED") continue;
    const key = `${incident.leagueSlug}|${incident.diagnosis.researchSeason || incident.dayKey.slice(0, 4)}`;
    const task = queue.research[key];
    const kickoff = Date.parse(incident.kickoffUtc);
    const urgent = kickoff > nowMs && kickoff - nowMs <= 86400000;
    // Old backoff schedules must not sleep through the pre-match deadline.
    const dueAt = urgent && task?.lastAttemptAt
      ? Math.min(Date.parse(task.nextAttemptAt), Date.parse(task.lastAttemptAt) + 15 * 60000)
      : Date.parse(task?.nextAttemptAt);
    if (dueAt > nowMs) continue;
    const list = groups.get(key) || [];
    list.push(incident); groups.set(key, list);
  }
  const ordered = [...groups].map(([key, incidents]) => ({ key, incidents,
    lastAttempt: Date.parse(queue.research[key]?.lastAttemptAt) || 0,
    deadline: Math.min(...incidents.map(row => Date.parse(row.kickoffUtc) > nowMs ? Date.parse(row.kickoffUtc) : Infinity)) }))
    .sort((a, b) => {
      const priority = task => task.deadline - nowMs <= 86400000 ? 0 : Number.isFinite(task.deadline) ? 1 : 2;
      return priority(a) - priority(b) || a.lastAttempt - b.lastAttempt || a.deadline - b.deadline || a.key.localeCompare(b.key);
    });
  const selected = ordered.slice(0, maxLeagues);
  // Repeated urgent failures must not consume every slot until the next set
  // of fixtures also becomes overdue. Reserve one due slot for early research.
  const early = ordered.find(task => Number.isFinite(task.deadline) && task.deadline - nowMs > 86400000);
  if (maxLeagues >= 2 && selected.length === maxLeagues && early && !selected.includes(early)
    && selected.every(task => task.deadline - nowMs <= 86400000)) selected[selected.length - 1] = early;
  return selected;
}

export function recordValueDataResearch(queue, task, result, nowMs) {
  const attempts = (queue.research[task.key]?.attempts || 0) + 1;
  const futureKickoff = Math.min(...task.incidents.map(row => Date.parse(row.kickoffUtc) > nowMs ? Date.parse(row.kickoffUtc) : Infinity));
  const deadlineDelay = Math.max(15 * 60000, futureKickoff - nowMs - 86400000);
  const delayMs = Math.min(24 * 3600000, deadlineDelay, 15 * 60000 * 2 ** Math.min(attempts - 1, 7));
  queue.research[task.key] = { attempts, lastAttemptAt: new Date(nowMs).toISOString(),
    nextAttemptAt: new Date(nowMs + delayMs).toISOString(), result,
    status: attempts >= 3 ? "ESCALATED_SOURCE_VALIDATION_REQUIRED" : "RETRY_PENDING" };
  // Neither 'accepted' research nor passing kickoff closes a missing assessment.
  for (const incident of task.incidents) queue.incidents[incident.canonicalId].researchKey = task.key;
  return queue;
}
