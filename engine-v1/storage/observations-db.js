import fs from "fs";
import { resolveDataPath } from "./data-root.js";
import {
  overlayProductionEvidenceDocumentReadView,
  resolveProductionEvidenceFixtureIdReadView,
} from "../core/production-evidence-identity-overlay.js";

// P0-C P5 READ BOUNDARY: observation evidence identity views.

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

function readObservationsRaw() {
  ensureFile();

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return Array.isArray(parsed.observations)
      ? parsed.observations
      : [];
  } catch {
    return [];
  }
}

export function readObservations() {
  return overlayProductionEvidenceDocumentReadView(
    readObservationsRaw(),
  );
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

  const current = readObservationsRaw();
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

  const query =
    resolveProductionEvidenceFixtureIdReadView(
      matchId,
    ).resolvedFixtureId;

  return readObservations().filter(
    x =>
      String(x?.matchId || "") ===
      String(query),
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