import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ROOT PROJECT /data
const dataDir = path.resolve(__dirname, "..", "..", "data");
const dbPath = path.join(dataDir, "fixtures.json");
const dbTmpPath = path.join(dataDir, "fixtures.json.tmp");
const dbBakPath = path.join(dataDir, "fixtures.json.bak");
const lockDir = path.join(dataDir, ".fixtures.lock");

// 🔥 ADD THIS EXACTLY HERE
function normalizeTeamKey(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|if|ac|afc|club|footballclub|fodbold|fk|nk|hnk)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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

  if (!fs.existsSync(dbBakPath)) {
    fs.writeFileSync(
      dbBakPath,
      JSON.stringify({ fixtures: [] }, null, 2),
      "utf8"
    );
  }
}

function acquireLock(timeoutMs = 5000) {
  ensureDb();
  const started = Date.now();

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      return;
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      if (Date.now() - started > timeoutMs) {
        throw new Error("db_lock_timeout");
      }
      sleepSync(25);
    }
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(lockDir)) {
      fs.rmdirSync(lockDir);
    }
  } catch (_) {}
}

function waitForUnlocked(timeoutMs = 3000) {
  const started = Date.now();

  while (fs.existsSync(lockDir)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("db_read_wait_timeout");
    }
    sleepSync(20);
  }
}

function safeParseDb(raw, sourceLabel = dbPath) {
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    return { fixtures: [] };
  }

  if (!parsed.fixtures || !Array.isArray(parsed.fixtures)) {
    return { fixtures: [] };
  }

  return parsed;
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function readDb() {
  ensureDb();

  let lastErr = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      waitForUnlocked();

      const raw = fs.readFileSync(dbPath, "utf8");
      return safeParseDb(raw, dbPath);
    } catch (err) {
      lastErr = err;

      // πιθανό partial read πάνω σε write window
      if (err instanceof SyntaxError) {
        sleepSync(40);
        continue;
      }

      throw err;
    }
  }

  // fallback σε backup αν το κύριο file πετύχει λάθος στιγμή πολλές φορές
  try {
    const rawBak = readTextIfExists(dbBakPath);
    if (rawBak) {
      return safeParseDb(rawBak, dbBakPath);
    }
  } catch (_) {}

  throw new Error(
    `readDb_failed: ${String(lastErr?.message || lastErr)}`
  );
}

function writeDb(data) {
  ensureDb();
  acquireLock();

  try {
    const payload = JSON.stringify(
      {
        fixtures: Array.isArray(data?.fixtures) ? data.fixtures : []
      },
      null,
      2
    );

    // γράψε temp
    fs.writeFileSync(dbTmpPath, payload, "utf8");

    // backup του προηγούμενου stable snapshot
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, dbBakPath);
    }

    // replace
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (_) {}

    fs.renameSync(dbTmpPath, dbPath);
  } finally {
    try {
      if (fs.existsSync(dbTmpPath)) {
        fs.unlinkSync(dbTmpPath);
      }
    } catch (_) {}

    releaseLock();
  }
}

export function getFixtureById(matchId) {
  const db = readDb();
  return db.fixtures.find(x => String(x.matchId) === String(matchId)) || null;
}

export function getFixtureByMatchKey(matchKey) {
  const db = readDb();
  return db.fixtures.find(x => String(x.matchKey || "") === String(matchKey)) || null;
}

export function upsertFixture(row) {
  const db = readDb();

  const idx = db.fixtures.findIndex(
    x => String(x.matchId) === String(row.matchId)
  );

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
        x.state === "staging"
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

export function findFixtureIndex(db, row) {
  // 1. matchKey (όπως τώρα)
  if (row.matchKey) {
    const byKey = db.fixtures.findIndex(
      x => String(x.matchKey || "") === String(row.matchKey)
    );
    if (byKey !== -1) return byKey;
  }

  // 2. SAME KICKOFF + SIMILAR TEAMS (🔥 NEW)
  const bySimilar = db.fixtures.findIndex(x => {
    if (!x.kickoffUtc || !row.kickoffUtc) return false;

    const sameKickoff =
      new Date(x.kickoffUtc).getTime() === new Date(row.kickoffUtc).getTime();

    if (!sameKickoff) return false;

    const h1 = normalizeTeamKey(x.homeTeam);
    const a1 = normalizeTeamKey(x.awayTeam);
    const h2 = normalizeTeamKey(row.homeTeam);
    const a2 = normalizeTeamKey(row.awayTeam);

    return (
      (h1.includes(h2) || h2.includes(h1)) &&
      (a1.includes(a2) || a2.includes(a1))
    );
  });

  if (bySimilar !== -1) return bySimilar;

  // 3. fallback matchId
  return db.fixtures.findIndex(
    x => String(x.matchId) === String(row.matchId)
  );
}
export function upsertFixtureWithMeta(row) {
  const db = readDb();

  const idx = findFixtureIndex(db, row);

  let action = "inserted";

  if (idx === -1) {
    db.fixtures.push(row);
    action = "inserted";
  } else {
    const existing = db.fixtures[idx];

    function buildComparable(row) {
      return JSON.stringify({
        status: row.status,
        rawStatus: row.rawStatus,
        minute: row.minute,
        scoreHome: row.scoreHome,
        scoreAway: row.scoreAway,
        penalties: row.penalties,
        decidedBy: row.decidedBy,
        kickoffUtc: row.kickoffUtc,
        operationalState: row.operationalState,
        isDisplayLive: row.isDisplayLive,
        isDisplayPre: row.isDisplayPre,
        isDisplayFinal: row.isDisplayFinal,
        terminalConfidence: row.terminalConfidence,
        health: row.health,
        sources: row.sources,
        reconcileMeta: {
          confidence: row?.reconcileMeta?.confidence,
          conflictTypes: row?.reconcileMeta?.conflictTypes,
          disagreement: row?.reconcileMeta?.disagreement
        }
      });
    }

    const prevComparable = buildComparable(existing);
    const nextComparable = buildComparable(row);

    const isLive =
      String(row.status || "").toUpperCase().includes("LIVE") ||
      String(row.status || "").toUpperCase().includes("FIRST") ||
      String(row.status || "").toUpperCase().includes("SECOND") ||
      String(row.status || "").toUpperCase().includes("HALF") ||
      String(row.status || "").toUpperCase().includes("PROGRESS");

    if (isLive) {
      db.fixtures[idx] = row;
      action = "updated";
    } else if (prevComparable === nextComparable) {
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
/**
 * Patch the aiAssessment field on a canonical fixture, looked up by team names
 * + dayKey. Called by run-odds-opening after building our Poisson assessment, so
 * the canonical id and our fs_* id both carry the same assessment — no more
 * findOddsByTeams fallback needed in the details route.
 */
export function patchFixtureAssessment(homeTeam, awayTeam, dayKey, aiAssessment) {
  if (!aiAssessment || !homeTeam || !awayTeam || !dayKey) return false;
  const db = readDb();
  const nh = normalizeTeamKey(homeTeam), na = normalizeTeamKey(awayTeam);
  const idx = db.fixtures.findIndex(x => {
    if (x.dayKey !== dayKey) return false;
    return normalizeTeamKey(x.homeTeam) === nh && normalizeTeamKey(x.awayTeam) === na;
  });
  if (idx === -1) return false;
  db.fixtures[idx] = { ...db.fixtures[idx], aiAssessment, aiAssessmentAt: new Date().toISOString() };
  writeDb(db);
  return true;
}
