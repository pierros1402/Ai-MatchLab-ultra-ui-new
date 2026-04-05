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