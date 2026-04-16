import fs from "fs";
import { resolveDataPath } from "./data-root.js";

const filePath = resolveDataPath("observations.json");

function ensureFile() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ observations: [] }, null, 2),
      "utf8"
    );
  }
}

export function readObservations() {
  ensureFile();

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return Array.isArray(parsed.observations) ? parsed.observations : [];
  } catch {
    return [];
  }
}

export function writeObservations(observations = []) {
  ensureFile();

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        observations: Array.isArray(observations) ? observations : []
      },
      null,
      2
    ),
    "utf8"
  );
}

export function appendObservations(items = []) {
  if (!Array.isArray(items) || !items.length) return 0;

  const current = readObservations();
  current.push(...items);
  writeObservations(current);
  return items.length;
}

export function appendObservation(item) {
  if (!item) return 0;
  return appendObservations([item]);
}

export function getObservationsByMatchId(matchId) {
  if (!matchId) return [];
  return readObservations().filter(
    x => String(x?.matchId || "") === String(matchId)
  );
}

export function getObservationsByMatchKey(matchKey) {
  if (!matchKey) return [];
  return readObservations().filter(
    x => String(x?.matchKey || "") === String(matchKey)
  );
}

export function getObservationsFilePath() {
  return filePath;
}