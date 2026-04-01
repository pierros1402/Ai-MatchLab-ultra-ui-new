import fs from "fs";
import path from "path";

const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "fixtures.json");

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(
      dbPath,
      JSON.stringify({ fixtures: [] }, null, 2),
      "utf8"
    );
  }
}

function readDb() {
  ensureDb();

  const raw = fs.readFileSync(dbPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed.fixtures || !Array.isArray(parsed.fixtures)) {
    return { fixtures: [] };
  }

  return parsed;
}

function writeDb(data) {
  ensureDb();

  fs.writeFileSync(
    dbPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

export function getFixtureById(matchId) {
  const db = readDb();
  return db.fixtures.find(x => x.matchId === matchId) || null;
}

export function upsertFixture(row) {
  const db = readDb();

  const idx = db.fixtures.findIndex(x => x.matchId === row.matchId);

  if (idx === -1) {
    db.fixtures.push(row);
  } else {
    db.fixtures[idx] = row;
  }

  writeDb(db);
}

export function getFixturesByDay(dayKey) {
  const db = readDb();

  return db.fixtures
    .filter(x => x.dayKey === dayKey)
    .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));
}

export function getStagingByDay(dayKey) {
  const db = readDb();

  return db.fixtures
    .filter(x => x.dayKey === dayKey && x.state === "staging")
    .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));
}

export function getActiveByDay(dayKey) {
  const db = readDb();

  return db.fixtures
    .filter(
      x =>
        x.dayKey === dayKey &&
        x.state === "staging" &&
        ["PRE", "LIVE", "FT", "SPECIAL"].includes(x.status)
    )
    .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));
}

export function markDayFinal(dayKey) {
  const db = readDb();
  const now = Date.now();

  db.fixtures = db.fixtures.map(row => {
    if (row.dayKey !== dayKey) return row;

    return {
      ...row,
      state: "final",
      finalized: 1,
      updatedAt: now
    };
  });

  writeDb(db);
}
// =====================================================
// CHANGE DETECTION HELPERS
// =====================================================

export function findFixtureIndex(db, matchId) {
  return db.fixtures.findIndex(x => x.matchId === matchId);
}

export function upsertFixtureWithMeta(row) {
  const db = readDb();

  const idx = findFixtureIndex(db, row.matchId);

  let action = "inserted";

  if (idx === -1) {
    db.fixtures.push(row);
    action = "inserted";
  } else {
    const existing = db.fixtures[idx];

    const prevSig = existing.signature;
    const nextSig = row.signature;

    if (prevSig === nextSig) {
      db.fixtures[idx] = row;
      action = "unchanged";
    } else {
      db.fixtures[idx] = row;
      action = "updated";
    }
  }

  writeDb(db);

  return action;
}