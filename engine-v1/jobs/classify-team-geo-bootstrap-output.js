import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasUsableCoordinates(row) {
  const lat = normalizeNumber(row?.latitude);
  const lon = normalizeNumber(row?.longitude);

  return Number.isFinite(lat) && Number.isFinite(lon);
}

function isValidationOk(row) {
  return row?.sourceMeta?.validation?.ok === true;
}

function validationQuality(row) {
  return normalizeText(row?.sourceMeta?.validation?.quality).toLowerCase() || null;
}

function classifyRow(row) {
  const coordsOk = hasUsableCoordinates(row);
  const validationOk = isValidationOk(row);
  const quality = validationQuality(row);
  const error = normalizeText(row?.sourceMeta?.error) || null;

  if (validationOk && quality === "complete" && coordsOk) {
    return {
      bucket: "complete",
      reason: "validation_complete_with_coordinates"
    };
  }

  if (validationOk && quality === "partial" && coordsOk) {
    return {
      bucket: "safe_partial",
      reason: "validation_partial_with_coordinates"
    };
  }

  if (error) {
    return {
      bucket: "unresolved",
      reason: error
    };
  }

  if (!coordsOk) {
    return {
      bucket: "unresolved",
      reason: "missing_coordinates"
    };
  }

  if (!validationOk) {
    return {
      bucket: "unresolved",
      reason: "validation_not_ok"
    };
  }

  return {
    bucket: "unresolved",
    reason: "unclassified"
  };
}

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolvePath(input) {
  if (!input) return null;
  if (path.isAbsolute(input)) return input;
  return path.resolve(rootDir(), input);
}

function buildOutputPaths(inputFile) {
  const dir = path.dirname(inputFile);
  const base = path.basename(inputFile, ".json");

  let prefix = base;
  if (prefix.endsWith(".enriched")) {
    prefix = prefix.slice(0, -".enriched".length);
  }

  return {
    completeImportFile: path.join(dir, `${prefix}.complete-import.json`),
    safePartialImportFile: path.join(dir, `${prefix}.safe-partial-import.json`),
    unresolvedReviewFile: path.join(dir, `${prefix}.unresolved-review.json`),
    diagnosticFile: path.join(dir, `${prefix}.diagnostic.json`)
  };
}

export async function classifyTeamGeoBootstrapOutput(inputArg) {
  const inputFile = resolvePath(inputArg);

  if (!inputFile || !fs.existsSync(inputFile)) {
    throw new Error(`input file not found: ${inputArg}`);
  }

  const rows = readJson(inputFile);

  if (!Array.isArray(rows)) {
    throw new Error("bootstrap output must be an array");
  }

  const {
    completeImportFile,
    safePartialImportFile,
    unresolvedReviewFile,
    diagnosticFile
  } = buildOutputPaths(inputFile);

  const complete = [];
  const safePartial = [];
  const unresolved = [];
  const diagnostic = [];

  for (const row of rows) {
    const result = classifyRow(row);

    diagnostic.push({
      team: row?.team || null,
      leagueSlug: row?.leagueSlug || null,
      status: result.bucket,
      reason: result.reason,
      validation: row?.sourceMeta?.validation || null,
      country: row?.country || "",
      city: row?.city || "",
      venue: row?.venue || "",
      latitude: normalizeNumber(row?.latitude),
      longitude: normalizeNumber(row?.longitude),
      source: row?.source || null,
      sourceMeta: row?.sourceMeta || null
    });

    if (result.bucket === "complete") {
      complete.push(row);
      continue;
    }

    if (result.bucket === "safe_partial") {
      safePartial.push(row);
      continue;
    }

    unresolved.push(row);
  }

  writeJson(completeImportFile, complete);
  writeJson(safePartialImportFile, safePartial);
  writeJson(unresolvedReviewFile, unresolved);
  writeJson(diagnosticFile, diagnostic);

  return {
    ok: true,
    inputFile,
    total: rows.length,
    completeCount: complete.length,
    safePartialCount: safePartial.length,
    unresolvedCount: unresolved.length,
    completeImportFile,
    safePartialImportFile,
    unresolvedReviewFile,
    diagnosticFile
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const inputArg = process.argv[2];

  if (!inputArg) {
    console.error("[classify-team-geo-bootstrap-output] cli:fatal missing input file");
    process.exit(1);
  }

  console.log("[classify-team-geo-bootstrap-output] cli:start", { inputArg });

  classifyTeamGeoBootstrapOutput(inputArg)
    .then(result => {
      console.log("[classify-team-geo-bootstrap-output] cli:done", result);
    })
    .catch(err => {
      console.error("[classify-team-geo-bootstrap-output] cli:fatal", err);
      process.exit(1);
    });
}