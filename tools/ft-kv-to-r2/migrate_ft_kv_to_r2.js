/**
 * AIMatchLab — FT KV → R2 Migrator
 *
 * Reads keys MATCH:FT:* from KV namespace AIMATCHLAB_KV_CORE
 * Writes JSON objects to R2 bucket aimatchlab-leagues-archive
 *
 * SAFE: does not delete KV keys
 *
 * Usage:
 *   node migrate_ft_kv_to_r2.js
 *   node migrate_ft_kv_to_r2.js --limit=100
 *   node migrate_ft_kv_to_r2.js --dry
 */

import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const KV_CORE_ID = "3c7930b5401a4434bc7ecf28f677dee5";
const R2_BUCKET = "aimatchlab-leagues-archive";

function arg(name, def = null) {
  const hit = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!hit) return def;
  return hit.split("=").slice(1).join("=");
}

const LIMIT = Number(arg("limit", "0")) || 0;
const DRY = process.argv.includes("--dry");

function parseJSONSafe(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function seasonFromKickoffMs(kickoff_ms) {
  const d = new Date(Number(kickoff_ms || 0));
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (m >= 7) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function r2KeyForFT(row) {
  const league = String(row.leagueSlug || "_unknown").trim() || "_unknown";
  const season = seasonFromKickoffMs(row.kickoff_ms);
  const id = String(row.id || "").trim() || "unknown-id";
  return `ft/${league}/${season}/matches/${id}.json`;
}

function listFTKeys(cursor = null) {
  const cmd = cursor
    ? `npx wrangler kv key list --remote --namespace-id ${KV_CORE_ID} --prefix "MATCH:FT:" --cursor "${cursor}"`
    : `npx wrangler kv key list --remote --namespace-id ${KV_CORE_ID} --prefix "MATCH:FT:"`;

  const out = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf-8");

  // ✅ Wrangler returns JSON array like: [{ "name": "MATCH:FT:..." }, ...]
  const arr = parseJSONSafe(out);

  if (Array.isArray(arr)) {
    return { keys: arr, cursor: null };
  }

  // fallback
  return { keys: [], cursor: null };
}

function getKVValue(key) {
  // IMPORTANT: use --remote
  const cmd = `npx wrangler kv key get --remote --namespace-id ${KV_CORE_ID} "${key}"`;
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf-8");
}

async function putToR2(objectKey, bodyText) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aiml-r2-"));
  const filePath = path.join(tmpDir, "obj.json");
  await fs.writeFile(filePath, bodyText, "utf-8");

  const cmd = `npx wrangler r2 object put ${R2_BUCKET}/${objectKey} --file "${filePath}" --content-type "application/json" --remote`;
  execSync(cmd, { stdio: "inherit" });

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

async function main() {
  console.log("== AIMatchLab FT KV → R2 Migrator ==");
  console.log("KV_CORE namespace:", KV_CORE_ID);
  console.log("R2 bucket:", R2_BUCKET);
  console.log("DRY:", DRY);
  console.log("LIMIT:", LIMIT || "none");
  console.log("");

  let cursor = null;
  let totalKeys = 0;
  let written = 0;
  let failed = 0;

  while (true) {
    const page = listFTKeys(cursor);
    const keys = page.keys || [];
    cursor = page.cursor || null;

    if (!keys.length) break;

    for (const k of keys) {
      const keyName = k.name || "";
      if (!keyName) continue;

      totalKeys++;

      if (LIMIT && totalKeys > LIMIT) {
        console.log("\n[STOP] limit reached.");
        console.log({ totalKeys, written, failed });
        return;
      }

      try {
        const raw = getKVValue(keyName);
        const row = parseJSONSafe(raw);

        if (!row || !row.id) {
          console.log(`[SKIP] ${keyName} (not valid JSON)`);
          continue;
        }

        const objectKey = r2KeyForFT(row);
        console.log("[PUT]", objectKey);
        const body = JSON.stringify(
          { ...row, migratedAt: new Date().toISOString(), kvKey: keyName },
          null,
          2
        );

        if (!DRY) {
          await putToR2(objectKey, body);
        }

        written++;
        if (written % 25 === 0) console.log(`[OK] written=${written} keys=${totalKeys}`);
        await sleep(25);
      } catch {
        failed++;
        console.log(`[FAIL] ${keyName}`);
      }
    }

    if (!cursor) break;
  }

  console.log("\nDONE:");
  console.log({ totalKeys, written, failed });
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
