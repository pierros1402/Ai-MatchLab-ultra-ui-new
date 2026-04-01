// ============================================================
// R2 INTEGRITY SCAN – SAFE MODE v2.0
// - Finds corrupted JSON entries
// - No deletions
// - Proper R2 read handling
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

      try {
        const raw = await env.AI_STATE.get(obj.key);
        if (!raw) continue;

        const txt = await raw.text();

        try {
          JSON.parse(txt);
        } catch {
          corrupted.push(obj.key);
        }

      } catch (e) {
        // treat read errors as corrupted
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