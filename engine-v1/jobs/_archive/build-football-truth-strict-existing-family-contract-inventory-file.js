import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `strict-existing-family-contract-inventory-${today}`);
const outputPath = path.join(outputDir, `strict-existing-family-contract-inventory-${today}.json`);
const rowsOutputPath = path.join(outputDir, `strict-existing-family-contract-inventory-rows-${today}.jsonl`);

const scanRoots = ["engine-v1/jobs", "engine-v1/config"];

const genericRejectNameTerms = [
  "existing-family-contract-inventory",
  "strict-existing-family-contract-inventory",
  "source-agnostic",
  "whole-map",
  "high-volume-official-host-route-probe",
  "direct-official-host",
  "official-host-asset",
  "official-host-proof",
  "official-host-extraction",
  "hard-pivot",
  "failure-root-cause",
  "enhanced-bulk-high-value",
  "bulk-high-value-source-discovery",
  "host-mined-start-date",
  "prioritized-start-date",
  "frontier",
  "named-frontier",
  "route-search",
  "blocked-families-controlled",
  "blocked-families-exact",
  "blocked-families-local"
];

const families = [
  { familyKey: "laliga_official", slugs: ["esp.1", "esp.2"], nameTerms: ["laliga", "la-liga"], contentTerms: ["esp.1", "esp.2", "laliga.com"] },
  { familyKey: "bundesliga_dfb_rendered", slugs: ["ger.1", "ger.2", "ger.3"], nameTerms: ["bundesliga", "dfb", "browser-rendered-official"], contentTerms: ["ger.1", "ger.2", "ger.3", "dfb.de", "bundesliga.com"] },
  { familyKey: "spfl_official_rendered", slugs: ["sco.1", "sco.2"], nameTerms: ["spfl"], contentTerms: ["sco.1", "sco.2", "spfl"] },
  { familyKey: "norway_ntf", slugs: ["nor.1"], nameTerms: ["norway", "ntf", "eliteserien"], contentTerms: ["nor.1", "ntf", "eliteserien.no"] },
  { familyKey: "torneopal_veikkausliiga", slugs: ["fin.1", "fin.2"], nameTerms: ["torneopal", "veikkausliiga"], contentTerms: ["fin.1", "fin.2", "torneopal", "veikkausliiga"] },
  { familyKey: "ksi_iceland", slugs: ["isl.1", "isl.2"], nameTerms: ["ksi", "iceland"], contentTerms: ["isl.1", "isl.2", "ksi", "ksí"] },
  { familyKey: "sportomedia_sef", slugs: ["swe.1", "swe.2"], nameTerms: ["sportomedia", "sef"], contentTerms: ["swe.1", "swe.2", "sportomedia", "allsvenskan", "superettan"] },
  { familyKey: "loi_ajax", slugs: ["irl.1"], nameTerms: ["loi", "league-of-ireland"], contentTerms: ["irl.1", "league of ireland", "loi"] },
  { familyKey: "cfa_cyprus_html", slugs: ["cyp.1"], nameTerms: ["cfa", "cyprus"], contentTerms: ["cyp.1", "cyprus", "cfa.com.cy"] }
];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir, out = []) {
  if (!(await exists(dir))) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "_raw", "raw", "payloads"].includes(entry.name)) continue;
      await walk(full, out);
    } else if (entry.isFile() && /\.(js|json)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function hasAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function roleOf(rel) {
  if (rel.includes("/jobs/run-")) return "runner";
  if (rel.includes("/jobs/verify-")) return "verifier";
  if (rel.includes("/jobs/build-")) return "builder";
  if (rel.includes("/config/")) return "config";
  return "other";
}

function isGenericRejected(rel) {
  const lower = rel.toLowerCase();
  return genericRejectNameTerms.some(term => lower.includes(term));
}

await fs.mkdir(outputDir, { recursive: true });

const files = [];
for (const scanRoot of scanRoots) {
  await walk(path.join(root, scanRoot), files);
}

const rows = [];

for (const family of families) {
  const matches = [];

  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const lowerRel = rel.toLowerCase();
    const fileRole = roleOf(rel);

    if (isGenericRejected(rel)) continue;

    let text = "";
    try {
      const stat = await fs.stat(file);
      if (stat.size > 1_500_000) continue;
      text = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    const lowerText = text.toLowerCase();

    const familyNameHit = hasAny(lowerRel, family.nameTerms);
    const familyContentHits = family.contentTerms.filter(term => lowerText.includes(term.toLowerCase()));
    const slugHits = family.slugs.filter(slug => lowerText.includes(slug));

    const executableSignals = [
      "allow-fetch",
      "fetch(",
      "browser",
      "chrome",
      "render",
      "standings",
      "table",
      "canonicalWriteExecutedNowCount",
      "truthAssertionExecutedNowCount"
    ].filter(term => lowerText.includes(term.toLowerCase()));

    const strictFamilySpecific =
      familyNameHit ||
      slugHits.length >= 1 ||
      familyContentHits.length >= 2;

    if (!strictFamilySpecific) continue;

    const executableCandidate =
      fileRole === "runner" &&
      strictFamilySpecific &&
      executableSignals.length >= 2;

    const verifierCandidate =
      fileRole === "verifier" &&
      strictFamilySpecific;

    matches.push({
      rel,
      fileRole,
      familyNameHit,
      familyContentHits,
      slugHits,
      executableSignals,
      executableCandidate,
      verifierCandidate,
      score:
        (familyNameHit ? 40 : 0) +
        slugHits.length * 25 +
        familyContentHits.length * 10 +
        executableSignals.length * 5 +
        (fileRole === "runner" ? 20 : 0) +
        (fileRole === "verifier" ? 15 : 0) +
        (fileRole === "config" ? 10 : 0)
    });
  }

  matches.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));

  const runners = matches.filter(row => row.fileRole === "runner");
  const executableRunners = matches.filter(row => row.executableCandidate);
  const verifiers = matches.filter(row => row.verifierCandidate);
  const configs = matches.filter(row => row.fileRole === "config");

  let readiness = "no_strict_family_contract_found";
  if (executableRunners.length > 0 && verifiers.length > 0) readiness = "strict_executable_family_with_verifier";
  else if (executableRunners.length > 0) readiness = "strict_executable_family_missing_verifier";
  else if (configs.length > 0 && runners.length > 0) readiness = "configured_family_needs_strict_proof";
  else if (matches.length > 0) readiness = "strict_references_only";

  rows.push({
    familyKey: family.familyKey,
    slugs: family.slugs,
    readiness,
    strictMatchCount: matches.length,
    runnerMatchCount: runners.length,
    executableRunnerMatchCount: executableRunners.length,
    verifierMatchCount: verifiers.length,
    configMatchCount: configs.length,
    topFiles: matches.slice(0, 10),
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  });
}

const readinessOrder = {
  strict_executable_family_with_verifier: 1,
  strict_executable_family_missing_verifier: 2,
  configured_family_needs_strict_proof: 3,
  strict_references_only: 4,
  no_strict_family_contract_found: 5
};

rows.sort((a, b) =>
  readinessOrder[a.readiness] - readinessOrder[b.readiness] ||
  b.executableRunnerMatchCount - a.executableRunnerMatchCount ||
  b.strictMatchCount - a.strictMatchCount ||
  a.familyKey.localeCompare(b.familyKey)
);

const report = {
  status: "passed",
  runner: "strict_existing_family_contract_inventory",
  contractVersion: 2,
  purpose: "Strict inventory of actual family-specific runners/configs after rejecting generic crawler strategy. Excludes generic discovery/probe/inventory jobs.",
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  scannedRoots: scanRoots,
  scannedFileCount: files.length,
  rejectedGenericNameTerms: genericRejectNameTerms,
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    familyCount: rows.length,
    strictExecutableFamilyWithVerifierCount: rows.filter(row => row.readiness === "strict_executable_family_with_verifier").length,
    strictExecutableFamilyMissingVerifierCount: rows.filter(row => row.readiness === "strict_executable_family_missing_verifier").length,
    configuredFamilyNeedsStrictProofCount: rows.filter(row => row.readiness === "configured_family_needs_strict_proof").length,
    strictReferencesOnlyCount: rows.filter(row => row.readiness === "strict_references_only").length,
    noStrictFamilyContractFoundCount: rows.filter(row => row.readiness === "no_strict_family_contract_found").length,
    firstStrictExecutionCandidates: rows
      .filter(row => ["strict_executable_family_with_verifier", "strict_executable_family_missing_verifier", "configured_family_needs_strict_proof"].includes(row.readiness))
      .map(row => ({
        familyKey: row.familyKey,
        readiness: row.readiness,
        slugs: row.slugs,
        executableRunnerMatchCount: row.executableRunnerMatchCount,
        verifierMatchCount: row.verifierMatchCount,
        topFiles: row.topFiles.slice(0, 5).map(file => file.rel)
      })),
    acceptedNowCount: 0
  },
  rows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  scannedFileCount: report.scannedFileCount,
  guardrails: report.guardrails,
  summary: report.summary
}, null, 2));
