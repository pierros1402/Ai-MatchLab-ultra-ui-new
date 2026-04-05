import fs from "fs";
import { resolveDataPath } from "./data-root.js";

const filePath = resolveDataPath("skipped.json");

function ensureFile() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ skipped: [] }, null, 2),
      "utf8"
    );
  }
}

export function readSkipped() {
  ensureFile();

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return Array.isArray(parsed.skipped) ? parsed.skipped : [];
  } catch {
    return [];
  }
}

export function writeSkipped(skipped = []) {
  ensureFile();

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        skipped: Array.isArray(skipped) ? skipped : []
      },
      null,
      2
    ),
    "utf8"
  );
}

export function appendSkipped(items = []) {
  if (!Array.isArray(items) || !items.length) return 0;

  const current = readSkipped();
  current.push(...items);
  writeSkipped(current);
  return items.length;
}

export function getSkippedFilePath() {
  return filePath;
}