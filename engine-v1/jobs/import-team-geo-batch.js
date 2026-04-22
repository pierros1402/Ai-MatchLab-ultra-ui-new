import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readTeamGeoRecord, writeTeamGeoRecord } from "../storage/team-geo-db.js";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolvePath(input) {
  if (!input) return null;
  if (path.isAbsolute(input)) return input;
  return path.resolve(rootDir(), input);
}

function buildIncomingRecord(row) {
  const team = normalizeText(row?.team);
  if (!team) return null;

  const lat = normalizeNumber(row?.latitude ?? row?.lat);
  const lon = normalizeNumber(row?.longitude ?? row?.lon);

  return {
    team,
    venue: normalizeText(row?.venue ?? row?.stadium) || null,
    city: normalizeText(row?.city) || null,
    country: normalizeText(row?.country) || null,
    latitude: lat,
    longitude: lon,
    source: normalizeText(row?.source) || "manual_batch",
    updatedAt: new Date().toISOString()
  };
}

function mergeGeo(existing, incoming) {
  if (!existing) return incoming;

  return {
    ...existing,
    ...incoming,
    team: incoming.team || existing.team,
    venue: incoming.venue ?? existing.venue ?? null,
    city: incoming.city ?? existing.city ?? null,
    country: incoming.country ?? existing.country ?? null,
    latitude: incoming.latitude ?? existing.latitude ?? null,
    longitude: incoming.longitude ?? existing.longitude ?? null,
    source: incoming.source || existing.source || "manual_batch",
    updatedAt: incoming.updatedAt || existing.updatedAt || new Date().toISOString()
  };
}

export async function importTeamGeoBatch(fileArg) {
  const filePath = resolvePath(fileArg);

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`import file not found: ${fileArg}`);
  }

  const rows = readJson(filePath);
  if (!Array.isArray(rows)) {
    throw new Error("import payload must be an array");
  }

  const written = [];
  const skipped = [];

  for (const row of rows) {
    const incoming = buildIncomingRecord(row);

    if (!incoming) {
      skipped.push({
        reason: "missing_team",
        row
      });
      continue;
    }

    if (
      !Number.isFinite(incoming.latitude) ||
      !Number.isFinite(incoming.longitude)
    ) {
      skipped.push({
        team: incoming.team,
        reason: "missing_coordinates"
      });
      continue;
    }

    const existing = readTeamGeoRecord(incoming.team);
    const merged = mergeGeo(existing, incoming);
    writeTeamGeoRecord(merged);

    written.push({
      team: merged.team,
      city: merged.city,
      country: merged.country,
      latitude: merged.latitude,
      longitude: merged.longitude,
      source: merged.source
    });
  }

  return {
    ok: true,
    filePath,
    total: rows.length,
    writtenCount: written.length,
    skippedCount: skipped.length,
    written,
    skipped
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const fileArg = process.argv[2];

  if (!fileArg) {
    console.error("[import-team-geo-batch] cli:fatal missing file path");
    process.exit(1);
  }

  console.log("[import-team-geo-batch] cli:start", { fileArg });

  importTeamGeoBatch(fileArg)
    .then(result => {
      console.log("[import-team-geo-batch] cli:done", result);
    })
    .catch(err => {
      console.error("[import-team-geo-batch] cli:fatal", err);
      process.exit(1);
    });
}