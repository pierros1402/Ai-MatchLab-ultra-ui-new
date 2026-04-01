const DISAGREEMENT_PREFIX = "disagreements";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeStatus(v) {
  return cleanStr(v).toUpperCase();
}

function normalizeMinute(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function buildScorePair(obs = {}) {
  return {
    home: safeNum(obs.scoreHome),
    away: safeNum(obs.scoreAway)
  };
}

function scorePairsEqual(a, b) {
  return a.home === b.home && a.away === b.away;
}

export function makeDisagreementEntry({
  matchId,
  field,
  observations,
  chosenSource,
  chosenValue,
  reason = ""
}) {
  const ts = Date.now();

  return {
    id: `${matchId}:${field}:${ts}`,
    ts,
    iso: new Date(ts).toISOString(),
    matchId: String(matchId || ""),
    field: String(field || ""),
    chosenSource: String(chosenSource || ""),
    chosenValue,
    reason: String(reason || ""),
    candidates: Array.isArray(observations)
      ? observations.map(o => ({
          source: String(o?.source || ""),
          value: o?.value ?? null,
          rawStatus: o?.rawStatus ?? null,
          rawMinute: o?.rawMinute ?? null,
          rawScoreHome: o?.rawScoreHome ?? null,
          rawScoreAway: o?.rawScoreAway ?? null,
          ts: o?.ts ?? null
        }))
      : []
  };
}

export function collectDisagreements(matchId, observations = [], resolved = {}) {
  const out = [];
  if (!matchId || !Array.isArray(observations) || observations.length < 2) return out;

  // ------------------------------------
  // STATUS DISAGREEMENT
  // ------------------------------------
  const statusCandidates = observations
    .map(o => ({
      source: o?.source,
      value: normalizeStatus(o?.status),
      rawStatus: o?.status,
      rawMinute: o?.minute,
      rawScoreHome: o?.scoreHome,
      rawScoreAway: o?.scoreAway,
      ts: o?.ts
    }))
    .filter(x => x.source && x.value);

  const uniqueStatuses = [...new Set(statusCandidates.map(x => x.value))];

  if (uniqueStatuses.length > 1) {
    out.push(
      makeDisagreementEntry({
        matchId,
        field: "status",
        observations: statusCandidates,
        chosenSource: resolved?.statusSource || resolved?.source || "",
        chosenValue: normalizeStatus(resolved?.status),
        reason: "status_conflict"
      })
    );
  }

  // ------------------------------------
  // SCORE DISAGREEMENT
  // ------------------------------------
  const scoreCandidates = observations
    .map(o => {
      const pair = buildScorePair(o);
      return {
        source: o?.source,
        value: pair,
        rawStatus: o?.status,
        rawMinute: o?.minute,
        rawScoreHome: o?.scoreHome,
        rawScoreAway: o?.scoreAway,
        ts: o?.ts
      };
    })
    .filter(x => x.source && x.value.home !== null && x.value.away !== null);

  if (scoreCandidates.length >= 2) {
    const base = scoreCandidates[0].value;
    const scoreConflict = scoreCandidates.some(x => !scorePairsEqual(base, x.value));

    if (scoreConflict) {
      out.push(
        makeDisagreementEntry({
          matchId,
          field: "score",
          observations: scoreCandidates,
          chosenSource: resolved?.scoreSource || resolved?.source || "",
          chosenValue: {
            home: safeNum(resolved?.scoreHome),
            away: safeNum(resolved?.scoreAway)
          },
          reason: "score_conflict"
        })
      );
    }
  }

  // ------------------------------------
  // MINUTE DISAGREEMENT
  // ------------------------------------
  const minuteCandidates = observations
    .map(o => ({
      source: o?.source,
      value: normalizeMinute(o?.minute),
      rawStatus: o?.status,
      rawMinute: o?.minute,
      rawScoreHome: o?.scoreHome,
      rawScoreAway: o?.scoreAway,
      ts: o?.ts
    }))
    .filter(x => x.source && x.value !== "");

  const uniqueMinutes = [...new Set(minuteCandidates.map(x => x.value))];

  if (uniqueMinutes.length > 1) {
    out.push(
      makeDisagreementEntry({
        matchId,
        field: "minute",
        observations: minuteCandidates,
        chosenSource: resolved?.minuteSource || resolved?.source || "",
        chosenValue: normalizeMinute(resolved?.minute),
        reason: "minute_conflict"
      })
    );
  }

  return out;
}

export async function persistDisagreements(env, entries = []) {
  if (!env?.AI_STATE) return { ok: false, reason: "missing_AI_STATE" };
  if (!Array.isArray(entries) || !entries.length) {
    return { ok: true, written: 0 };
  }

  let written = 0;

  for (const entry of entries) {
    const matchId = String(entry?.matchId || "").trim();
    const field = String(entry?.field || "").trim();
    const ts = Number(entry?.ts || Date.now());

    if (!matchId || !field) continue;

    const key =
      `${DISAGREEMENT_PREFIX}/${matchId}/${field}/${ts}.json`;

    await env.AI_STATE.put(key, JSON.stringify(entry, null, 2));
    written++;
  }

  return { ok: true, written };
}