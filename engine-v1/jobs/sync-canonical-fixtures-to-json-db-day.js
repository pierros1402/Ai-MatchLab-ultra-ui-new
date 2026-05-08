import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";
import { upsertFixtureWithMeta } from "../storage/json-db.js";

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function listJsonFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        out.push(full);
      }
    }
  }

  return out.sort((a, b) => String(a).localeCompare(String(b)));
}

function unwrapFixtureRows(payload) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.rows)) return payload.rows;

  if (payload?.fixture && typeof payload.fixture === "object") return [payload.fixture];
  if (payload?.match && typeof payload.match === "object") return [payload.match];

  if (payload && typeof payload === "object" && (payload.matchId || payload.id || payload.matchKey)) {
    return [payload];
  }

  return [];
}

function normalizeCanonicalFixture(row, dayKey, sourceFile) {
  if (!row || typeof row !== "object") return null;

  const matchId = String(row.matchId || row.id || row.eventId || "").trim();
  const matchKey = String(row.matchKey || "").trim();

  if (!matchId && !matchKey) return null;

  const normalized = {
    ...row,
    matchId: matchId || matchKey,
    matchKey: matchKey || row.matchKey || null,
    dayKey: String(row.dayKey || dayKey),
    state: row.state || "staging",
    source: row.source || "canonical-fixtures",
    sources: {
      ...(row.sources && typeof row.sources === "object" ? row.sources : {}),
      canonicalFixtures: {
        sourceFile: path.relative(resolveDataPath(), sourceFile).replaceAll("\\", "/"),
        syncedAt: new Date().toISOString()
      }
    },
    meta: {
      ...(row.meta && typeof row.meta === "object" ? row.meta : {}),
      canonicalFixtureSync: true
    }
  };

  if (!String(normalized.dayKey || "").trim()) {
    normalized.dayKey = dayKey;
  }

  return normalized;
}

export function syncCanonicalFixturesToJsonDbDay(dayKey, options = {}) {
  const {
    write = true
  } = options;

  if (!isValidDayKey(dayKey)) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const root = resolveDataPath("canonical-fixtures", dayKey);
  const files = listJsonFilesRecursive(root);

  let rawRows = 0;
  let acceptedRows = 0;
  let skippedRows = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const byFile = [];

  for (const file of files) {
    const payload = readJsonSafe(file, null);
    const rows = unwrapFixtureRows(payload);

    let fileAccepted = 0;
    let fileSkipped = 0;

    for (const row of rows) {
      rawRows++;

      const normalized = normalizeCanonicalFixture(row, dayKey, file);

      if (!normalized) {
        skippedRows++;
        fileSkipped++;
        continue;
      }

      acceptedRows++;
      fileAccepted++;

      if (!write) continue;

      const result = upsertFixtureWithMeta(normalized);
      const action = String(result?.action || "");

      if (action === "inserted") inserted++;
      else if (action === "updated") updated++;
      else unchanged++;
    }

    byFile.push({
      file: path.relative(resolveDataPath(), file).replaceAll("\\", "/"),
      rows: rows.length,
      accepted: fileAccepted,
      skipped: fileSkipped
    });
  }

  return {
    ok: true,
    dayKey,
    write,
    root,
    fileCount: files.length,
    rawRows,
    acceptedRows,
    skippedRows,
    inserted,
    updated,
    unchanged,
    byFile
  };
}

const entryUrl = process.argv?.[1]
  ? new URL(`file://${path.resolve(process.argv[1])}`).href
  : null;

if (entryUrl === import.meta.url) {
  const dayKey = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  try {
    const result = syncCanonicalFixturesToJsonDbDay(dayKey, {
      write: !dryRun
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[sync-canonical-fixtures] failed", err);
    process.exit(1);
  }
}
