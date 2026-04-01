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

export function appendObservation(row) {
  const db = readDb();
  db.observations.push(row);
  writeDb(db);
}

export function getObservationsByMatchId(matchId) {
  const db = readDb();
  return db.observations.filter(x => x.matchId === matchId);
}