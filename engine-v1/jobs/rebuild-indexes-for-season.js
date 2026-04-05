import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveSeasonFromDay(dayKey) {
  const [year, month] = String(dayKey).split("-").map(Number);

  if (!year || !month) return "unknown-season";

  if (month >= 7) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
}

export async function rebuildIndexesForSeason(dayKey) {
  const season = resolveSeasonFromDay(dayKey);

  const scriptPath = path.resolve(__dirname, "build-current-season-indexes.js");

  try {
    const { stdout, stderr } = await execFileAsync("node", [scriptPath, season], {
      cwd: path.resolve(__dirname, "..", "..")
    });

    return {
      ok: true,
      season,
      stdout: stdout || "",
      stderr: stderr || ""
    };
  } catch (error) {
    return {
      ok: false,
      season,
      error: String(error?.message || error),
      stdout: error?.stdout || "",
      stderr: error?.stderr || ""
    };
  }
}