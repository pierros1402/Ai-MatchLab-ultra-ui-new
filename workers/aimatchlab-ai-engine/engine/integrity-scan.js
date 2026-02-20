// ============================================================
// R2 INTEGRITY SCAN – SAFE MODE
// - Finds corrupted JSON entries
// - No deletions
// ============================================================

export async function scanIntegrity(env, league, season) {
  const prefix = `league/${league}/${season}/matches/`;

  let cursor = undefined;
  const corrupted = [];
  let scanned = 0;

  while (true) {
    const options = cursor ? { prefix, cursor } : { prefix };
    const list = await env.AI_STATE.list(options);

    if (!list || !Array.isArray(list.objects)) break;

    for (const obj of list.objects) {
      scanned++;

      const raw = await env.AI_STATE.get(obj.key);
      if (!raw) continue;

      if (typeof raw !== "string") continue;

      try {
        JSON.parse(raw);
      } catch {
        corrupted.push(obj.key);
      }
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      league,
      season,
      scanned,
      corruptedCount: corrupted.length,
      corruptedKeys: corrupted
    }),
    {
      headers: { "content-type": "application/json" }
    }
  );
}