import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// storage/ -> engine-v1/ -> project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_ROOT = path.join(PROJECT_ROOT, "data");

export function getProjectRoot() {
  return PROJECT_ROOT;
}

export function getDataRoot() {
  ensureDir(DATA_ROOT);
  return DATA_ROOT;
}

export function resolveDataPath(...parts) {
  const root = getDataRoot();
  return path.join(root, ...parts);
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// data/fixtures.json is written as an object `{ fixtures: [...] }`, but some
// consumers historically read it as a top-level array and silently received an
// empty list. This normalizer accepts either shape and always returns the rows.
export function normalizeFixtureRows(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.fixtures)) return value.fixtures;
  return [];
}