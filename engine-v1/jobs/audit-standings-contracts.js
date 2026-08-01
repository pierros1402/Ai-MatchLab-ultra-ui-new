import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { validateCompetitionFormatRegistry } from "../core/competition-format-registry.js";
import { validateStandingsContractsBatch } from "../source-discovery/standings-contract-validator.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_ROOT = path.join(PROJECT_ROOT, "data");

function parseArgs(argv) {
  const options = {
    registry: path.join(DATA_ROOT, "competition-format-registry", "registry.v1.json"),
    standingsDir: path.join(DATA_ROOT, "standings"),
    seasonReference: null,
    leagues: [],
    output: null,
    strict: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing_value_for_${arg}`);
      i += 1;
      return argv[i];
    };

    if (arg === "--registry") options.registry = path.resolve(next());
    else if (arg === "--standings-dir") options.standingsDir = path.resolve(next());
    else if (arg === "--season") options.seasonReference = next();
    else if (arg === "--league") options.leagues.push(...next().split(",").map(value => value.trim()).filter(Boolean));
    else if (arg === "--output") options.output = path.resolve(next());
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown_argument_${arg}`);
  }

  options.leagues = [...new Set(options.leagues)].sort();
  return options;
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readJsonWithHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    payload: JSON.parse(bytes.toString("utf8")),
    sha256: sha256Buffer(bytes),
    bytes: bytes.length
  };
}

function listStandingsFiles(directory, leagues) {
  if (!fs.existsSync(directory)) return [];
  const requested = new Set(leagues);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => ({
      leagueSlug: entry.name.slice(0, -5),
      filePath: path.join(directory, entry.name)
    }))
    .filter(item => requested.size === 0 || requested.has(item.leagueSlug))
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));
}

function helpText() {
  return [
    "Read-only standings contract audit.",
    "",
    "Usage:",
    "  node engine-v1/jobs/audit-standings-contracts.js [options]",
    "",
    "Options:",
    "  --registry <file>       Registry JSON path.",
    "  --standings-dir <dir>   Directory containing <league>.json artifacts.",
    "  --season <season>       Optional season reference (YYYY or YYYY-YYYY).",
    "  --league <slug[,slug]>  Restrict audit to one or more league slugs.",
    "  --output <file>         Write only the audit report; standings remain untouched.",
    "  --strict                Exit 2 when compliance failures/no-contract results exist.",
    "  --help                  Show this help.",
    "",
    "This job never rewrites standings or the registry."
  ].join("\n");
}

export function auditStandingsContracts(options = {}) {
  const registryPath = path.resolve(options.registry);
  const standingsDir = path.resolve(options.standingsDir);
  const registryRead = readJsonWithHash(registryPath);
  const registryValidation = validateCompetitionFormatRegistry(registryRead.payload);

  if (!registryValidation.ok) {
    return {
      schema: "ai-matchlab.standings-contract-audit.v1",
      generatedAt: new Date().toISOString(),
      status: "INVALID_REGISTRY",
      ok: false,
      publicationDecision: "NOT_APPLIED_READ_ONLY",
      inputs: {
        registry: { path: registryPath, sha256: registryRead.sha256, bytes: registryRead.bytes },
        standingsDir
      },
      registryValidation,
      batch: null,
      readOnlyEvidence: {
        mutationAllowed: false,
        standingsFilesChanged: false,
        changedFiles: []
      }
    };
  }

  const requestedLeagues = [...new Set(options.leagues || [])].sort();
  const files = listStandingsFiles(standingsDir, requestedLeagues);
  const foundLeagueSlugs = new Set(files.map(file => file.leagueSlug));
  const missingRequestedLeagues = requestedLeagues.filter(slug => !foundLeagueSlugs.has(slug));
  const artifacts = [];
  const fileEvidence = [];
  const parseFailures = [];

  for (const file of files) {
    try {
      const read = readJsonWithHash(file.filePath);
      artifacts.push({
        leagueSlug: file.leagueSlug,
        seasonReference: options.seasonReference || null,
        standings: read.payload
      });
      fileEvidence.push({
        leagueSlug: file.leagueSlug,
        path: file.filePath,
        sha256Before: read.sha256,
        bytes: read.bytes
      });
    } catch (error) {
      parseFailures.push({
        leagueSlug: file.leagueSlug,
        path: file.filePath,
        error: error?.message || "standings_json_parse_failed"
      });
    }
  }

  const batch = validateStandingsContractsBatch({
    registry: registryRead.payload,
    artifacts,
    seasonReference: options.seasonReference || null
  });

  const changedFiles = [];
  for (const evidence of fileEvidence) {
    const bytesAfter = fs.readFileSync(evidence.path);
    evidence.sha256After = sha256Buffer(bytesAfter);
    evidence.unchanged = evidence.sha256Before === evidence.sha256After;
    if (!evidence.unchanged) changedFiles.push(evidence.path);
  }

  const status = changedFiles.length > 0
    ? "READ_ONLY_VIOLATION"
    : parseFailures.length > 0
      ? "ARTIFACT_PARSE_FAILURES"
      : missingRequestedLeagues.length > 0
        ? "REQUESTED_ARTIFACTS_MISSING"
        : batch.status;

  return {
    schema: "ai-matchlab.standings-contract-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    ok:
      changedFiles.length === 0 &&
      parseFailures.length === 0 &&
      missingRequestedLeagues.length === 0 &&
      batch.ok,
    publicationDecision: "NOT_APPLIED_READ_ONLY",
    inputs: {
      registry: { path: registryPath, sha256: registryRead.sha256, bytes: registryRead.bytes },
      standingsDir,
      requestedLeagues,
      missingRequestedLeagues,
      seasonReference: options.seasonReference || null,
      standingsFiles: fileEvidence
    },
    registryValidation,
    missingRequestedLeagues,
    parseFailures,
    batch,
    readOnlyEvidence: {
      mutationAllowed: false,
      standingsFilesChanged: changedFiles.length > 0,
      changedFiles
    }
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error?.message || error);
    console.error(helpText());
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(helpText());
    return;
  }

  let report;
  try {
    report = auditStandingsContracts(options);
  } catch (error) {
    console.error(JSON.stringify({
      schema: "ai-matchlab.standings-contract-audit-error.v1",
      ok: false,
      error: error?.message || "standings_contract_audit_failed"
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, serialized, "utf8");
  }
  process.stdout.write(serialized);

  if (report.readOnlyEvidence?.standingsFilesChanged) {
    process.exitCode = 3;
  } else if (options.strict && !report.ok) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  await main();
}
