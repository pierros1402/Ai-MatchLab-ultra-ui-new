import fs from "fs";
import path from "path";

const dataDir = path.resolve("data");
const logPath = path.join(dataDir, "skipped.json");

function ensureFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(
      logPath,
      JSON.stringify({ skipped: [] }, null, 2),
      "utf8"
    );
  }
}

function readLog() {
  ensureFile();
  return JSON.parse(fs.readFileSync(logPath, "utf8"));
}

function writeLog(data) {
  ensureFile();
  fs.writeFileSync(logPath, JSON.stringify(data, null, 2), "utf8");
}

export function appendSkipped(entry) {
  const db = readLog();
  db.skipped.push(entry);
  writeLog(db);
}