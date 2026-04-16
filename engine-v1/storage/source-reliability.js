import fs from "fs";
import { ensureDir, resolveDataPath } from "./data-root.js";

const FILE = resolveDataPath("source-reliability.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(data) {
  ensureDir(resolveDataPath());
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

export function updateSourceReliability(rows, conflictTypes = []) {
  const db = read();

  const sources = [...new Set((rows || []).map(r => r?.source).filter(Boolean))];

  for (const source of sources) {
    if (!db[source]) {
      db[source] = {
        total: 0,
        agreements: 0,
        disagreements: 0,
        scoreDisagreements: 0,
        statusDisagreements: 0,
        lastUpdated: 0
      };
    }

    db[source].total += 1;

    if (!conflictTypes || conflictTypes.length === 0) {
      db[source].agreements += 1;
    } else {
      db[source].disagreements += 1;

      if (conflictTypes.includes("score")) {
        db[source].scoreDisagreements += 1;
      }

      if (conflictTypes.includes("status")) {
        db[source].statusDisagreements += 1;
      }
    }

    db[source].lastUpdated = Date.now();
  }

  write(db);
}

export function getSourceReliabilitySnapshot() {
  return read();
}