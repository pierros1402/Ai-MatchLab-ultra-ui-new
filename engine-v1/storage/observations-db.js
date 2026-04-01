import fs from "fs";
import path from "path";

const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "observations.json");

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(
      dbPath,
      JSON.stringify({ observations: [] }, null, 2),
      "utf8"
    );
  }
}

function readDb() {
  ensureDb();

  const raw = fs.readFileSync(dbPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed.observations || !Array.isArray(parsed.observations)) {
    return { observations: [] };
  }

  return parsed;
}

function writeDb(data) {
  ensureDb();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function buildSignature(row) {
  return [
    normStr(row?.matchId),
    normStr(row?.source),
    normStr(row?.status),
    normStr(row?.minute),
    safeNum(row?.scoreHome),
    safeNum(row?.scoreAway),
    normStr(row?.kickoffUtc)
  ].join("|");
}

export function appendObservation(row) {
  const db = readDb();

  const observations = Array.isArray(db.observations)
    ? db.observations
    : [];

  const sig = buildSignature(row);

  // ------------------------------------------------------------
  // DEDUPE: check latest observation per same source + match
  // ------------------------------------------------------------
  const lastSame = [...observations]
    .reverse()
    .find(
      x =>
        x.matchId === row.matchId &&
        x.source === row.source
    );

  if (lastSame) {
    const lastSig = buildSignature(lastSame);

    if (lastSig === sig) {
      return; // skip identical observation
    }
  }

  observations.push(row);

  db.observations = observations;
  writeDb(db);
}

export function getObservationsByMatchId(matchId) {
  const db = readDb();
  return db.observations.filter(x => x.matchId === matchId);
}