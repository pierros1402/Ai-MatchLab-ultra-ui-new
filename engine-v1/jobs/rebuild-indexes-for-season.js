import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentSeason } from "../core/season.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveSeasonFromDay(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(dayKey || "")
  );

  if (!match) return "unknown-season";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "unknown-season";
  }

  return currentSeason(date);
}

export function collectIndexRebuildTargets(
  historyCatchUp = []
) {
  const bySeason = new Map();

  for (
    const row of Array.isArray(historyCatchUp)
      ? historyCatchUp
      : []
  ) {
    if (!row?.appended) continue;

    const season = String(
      row?.season || ""
    ).trim();

    const day = String(
      row?.day || ""
    ).trim();

    if (
      !season ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      bySeason.has(season)
    ) {
      continue;
    }

    bySeason.set(season, {
      season,
      day
    });
  }

  return [...bySeason.values()];
}

export async function rebuildIndexesForSeason(dayKey) {
  const season = resolveSeasonFromDay(dayKey);

  if (season === "unknown-season") {
    return {
      ok: false,
      reason: "invalid_day_key",
      dayKey,
      season
    };
  }

  const scriptPath = path.resolve(
    __dirname,
    "build-current-season-indexes.js"
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      [
        scriptPath,
        season,
        dayKey
      ],
      {
        cwd: path.resolve(
          __dirname,
          "..",
          ".."
        )
      }
    );

    return {
      ok: true,
      dayKey,
      season,
      stdout: stdout || "",
      stderr: stderr || ""
    };
  } catch (error) {
    return {
      ok: false,
      dayKey,
      season,
      error: String(
        error?.message || error
      ),
      stdout: error?.stdout || "",
      stderr: error?.stderr || ""
    };
  }
}