// ============================================================
// AIMATCHLAB – DETERMINISTIC AI PERSISTENCE (R2)
// ============================================================

function buildSignature(match) {
  return [
    match.status || "UNKNOWN",
    match.scoreHome ?? 0,
    match.scoreAway ?? 0,
    match.minute ?? 0
  ].join("|");
}

function basePath(match) {
  return `ai/context/${match.leagueSlug}/2025-2026/${match.id}/`;
}

async function listLiveVersions(env, prefix) {
  const list = await env.R2_INTEL.list({ prefix });
  return (list.objects || []).map(o => o.key);
}

export async function getDeterministicProfile(match, runAiEngine, env) {

  const signature = buildSignature(match);
  const prefix = basePath(match);

  const preKey = prefix + "pre.json";
  const finalKey = prefix + "final.json";
  const livePrefix = prefix + "live/";

  // ============================================================
  // FINAL – RETURN IF EXISTS
  // ============================================================
  if (match.status?.includes("FINAL")) {
    const existing = await env.R2_INTEL.get(finalKey);
    if (existing) {
      return await existing.json();
    }
  }

  // ============================================================
  // SCHEDULED – RETURN PRE IF EXISTS
  // ============================================================
  if (match.status?.includes("SCHEDULED")) {
    const existing = await env.R2_INTEL.get(preKey);
    if (existing) {
      return await existing.json();
    }
  }

  // ============================================================
  // LIVE – CHECK SIGNATURE MATCH
  // ============================================================
  if (match.status?.includes("IN_PROGRESS")) {

    const liveObjects = await listLiveVersions(env, livePrefix);

    for (const key of liveObjects) {
      const obj = await env.R2_INTEL.get(key);
      if (!obj) continue;

      const data = await obj.json();
      if (data?.meta?.stateSignature === signature) {
        return data;
      }
    }
  }

  // ============================================================
  // GENERATE NEW PROFILE
  // ============================================================

  const profile = await runAiEngine({
    id: match.id,
    league: match.leagueSlug,
    home: match.home,
    away: match.away,
    status: match.status,
    minute: match.minute || null,
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    season: "2025-2026"
  }, env);

  const payload = {
    meta: {
      createdAt: Date.now(),
      stateSignature: signature,
      status: match.status,
      engineVersion: "2.3.8"
    },
    profile
  };

  // ============================================================
  // WRITE LOGIC
  // ============================================================

  if (match.status?.includes("SCHEDULED")) {
    await env.R2_INTEL.put(preKey, JSON.stringify(payload));
    return payload;
  }

  if (match.status?.includes("IN_PROGRESS")) {
    const liveKey = livePrefix + Date.now() + ".json";
    await env.R2_INTEL.put(liveKey, JSON.stringify(payload));
    return payload;
  }

  if (match.status?.includes("FINAL")) {

    // write final
    await env.R2_INTEL.put(finalKey, JSON.stringify(payload));

    // cleanup live versions
    const liveObjects = await listLiveVersions(env, livePrefix);
    for (const key of liveObjects) {
      await env.R2_INTEL.delete(key);
    }

    return payload;
  }

  return payload;
}
