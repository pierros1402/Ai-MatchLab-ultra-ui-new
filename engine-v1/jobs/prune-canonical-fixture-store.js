import fs from "fs";
import path from "path";
import { shiftDay, athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    baseDay: athensDayKey(),
    daysBack: 3,
    daysForward: 30,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.baseDay = arg;
      continue;
    }

    if (arg === "--days-back" && argv[i + 1]) {
      out.daysBack = Number(argv[++i]);
      continue;
    }

    if (arg === "--days-forward" && argv[i + 1]) {
      out.daysForward = Number(argv[++i]);
      continue;
    }

    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
  }

  out.daysBack = Number.isFinite(out.daysBack) && out.daysBack >= 0 ? Math.floor(out.daysBack) : 3;
  out.daysForward = Number.isFinite(out.daysForward) && out.daysForward >= 0 ? Math.floor(out.daysForward) : 30;

  return out;
}

function isDayDir(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(name || ""));
}

function allowedDays(baseDay, daysBack, daysForward) {
  const set = new Set();

  for (let offset = -daysBack; offset <= daysForward; offset++) {
    set.add(shiftDay(baseDay, offset));
  }

  return set;
}

function listDayDirs(root) {
  if (!fs.existsSync(root)) return [];

  return fs.readdirSync(root, { withFileTypes: true })
    .filter(x => x.isDirectory() && isDayDir(x.name))
    .map(x => ({
      name: x.name,
      path: path.join(root, x.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function removePath(target, dryRun) {
  if (dryRun) return;
  fs.rmSync(target, { recursive: true, force: true });
}

export function pruneCanonicalFixtureStore(options = {}) {
  const opts = {
    ...parseArgs([]),
    ...options
  };

  const keep = allowedDays(opts.baseDay, opts.daysBack, opts.daysForward);

  const roots = [
    {
      label: "canonical-fixtures",
      root: resolveDataPath("canonical-fixtures"),
      type: "day-dirs"
    },
    {
      label: "coverage-reports",
      root: resolveDataPath("coverage-reports"),
      type: "day-json"
    }
  ];

  const removed = [];
  const kept = [];

  for (const item of roots) {
    if (!fs.existsSync(item.root)) continue;

    if (item.type === "day-dirs") {
      for (const dir of listDayDirs(item.root)) {
        if (keep.has(dir.name)) {
          kept.push({ root: item.label, dayKey: dir.name, path: dir.path });
          continue;
        }

        removed.push({ root: item.label, dayKey: dir.name, path: dir.path });
        removePath(dir.path, opts.dryRun);
      }
    }

    if (item.type === "day-json") {
      const files = fs.readdirSync(item.root, { withFileTypes: true })
        .filter(x => x.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(x.name))
        .map(x => ({
          name: x.name,
          dayKey: x.name.replace(/\.json$/, ""),
          path: path.join(item.root, x.name)
        }));

      for (const file of files) {
        if (keep.has(file.dayKey)) {
          kept.push({ root: item.label, dayKey: file.dayKey, path: file.path });
          continue;
        }

        removed.push({ root: item.label, dayKey: file.dayKey, path: file.path });
        removePath(file.path, opts.dryRun);
      }
    }
  }

  return {
    ok: true,
    baseDay: opts.baseDay,
    daysBack: opts.daysBack,
    daysForward: opts.daysForward,
    dryRun: opts.dryRun,
    keepCount: kept.length,
    removedCount: removed.length,
    kept,
    removed
  };
}

const entryUrl = process.argv?.[1]
  ? new URL(`file://${path.resolve(process.argv[1])}`).href
  : null;

if (entryUrl === import.meta.url) {
  try {
    const result = pruneCanonicalFixtureStore(parseArgs());
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[prune-canonical-fixture-store] failed", err);
    process.exit(1);
  }
}
