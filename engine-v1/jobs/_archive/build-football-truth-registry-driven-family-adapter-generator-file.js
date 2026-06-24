import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `registry-driven-family-adapter-generator-${DATE}`);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function safeJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function readJsonl(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}
function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function normHost(h) {
  return String(h || "").replace(/^www\./, "").toLowerCase().trim();
}
function familyKey(host, adapterKind) {
  return `${adapterKind}:${normHost(host) || "unknown"}`;
}
function addFamily(map, key, patch) {
  if (!map.has(key)) {
    map.set(key, {
      familyKey: key,
      familyId: patch.familyId || key.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase(),
      adapterKind: patch.adapterKind || "unknown",
      sourceHost: patch.sourceHost || null,
      configuredSlugSet: new Set(),
      dueSlugSet: new Set(),
      candidateSlugSet: new Set(),
      verifiedSlugSet: new Set(),
      routeConfiguredCount: 0,
      routeIdentityRuleCount: 0,
      executableNow: false,
      implementationStatus: "unclassified",
      requiredGates: new Set(),
      sourceFiles: new Set(),
      evidenceRows: []
    });
  }
  const f = map.get(key);
  for (const [k, v] of Object.entries(patch)) {
    if (k.endsWith("Set") && f[k] && v) for (const x of v) f[k].add(x);
    else if (k === "requiredGates" && Array.isArray(v)) for (const x of v) f.requiredGates.add(x);
    else if (k === "sourceFiles" && Array.isArray(v)) for (const x of v) f.sourceFiles.add(x);
    else if (k === "evidenceRows" && Array.isArray(v)) f.evidenceRows.push(...v);
    else if (!(k in f) || f[k] === null || f[k] === "unclassified") f[k] = v;
  }
  return f;
}

ensureDir(OUT_DIR);

const renderedConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");
const apiConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-official-api-route-families.json");
const renderedConfig = safeJson(renderedConfigPath);
const apiConfig = safeJson(apiConfigPath);

const ledgerRowsPath = latestFile(/season-lane-coverage-ledger-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const dueTasksPath = latestFile(/permanent-season-lifecycle-due-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const sourceCompilerRowsPath = latestFile(/source-family-execution-compiler-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const sourceFamilyBoardPath = latestFile(/source-family-execution-family-board-\d{4}-\d{2}-\d{2}\.jsonl$/);
const apiHintRowsPath = latestFile(/bulk-api-hint-slug-scores-\d{4}-\d{2}-\d{2}\.jsonl$/);

const ledgerRows = readJsonl(ledgerRowsPath);
const dueTasks = readJsonl(dueTasksPath);
const compilerRows = readJsonl(sourceCompilerRowsPath);
const familyBoardRows = readJsonl(sourceFamilyBoardPath);
const apiHintScores = readJsonl(apiHintRowsPath);

const previousSatisfied = new Set(ledgerRows.filter((r) => r.previousCompletedStandingsSatisfied).map((r) => r.competitionSlug));
const currentSatisfied = new Set(ledgerRows.filter((r) => r.currentOrNewSeasonStandingsSatisfied).map((r) => r.competitionSlug));
const startSatisfied = new Set(ledgerRows.filter((r) => r.nextSeasonStartDateSatisfied).map((r) => r.competitionSlug));
const duePrevious = new Set(dueTasks.filter((t) => t.taskType === "acquire_previous_completed_standings").map((t) => t.competitionSlug));
const dueStart = new Set(dueTasks.filter((t) => t.taskType === "acquire_next_season_start_date").map((t) => t.competitionSlug));

const families = new Map();

if (renderedConfig?.families) {
  for (const fam of renderedConfig.families) {
    const competitions = fam.competitions || fam.routes || fam.targets || [];
    const host = fam.sourceHost || fam.host || hostFromUrl(competitions[0]?.sourceUrl || competitions[0]?.url || "");
    const key = familyKey(host, "browser_rendered_official");
    const slugs = competitions.map((c) => c.competitionSlug || c.slug).filter(Boolean);
    const f = addFamily(families, key, {
      familyId: fam.familyId || key,
      adapterKind: "browser_rendered_official",
      sourceHost: host,
      configuredSlugSet: slugs,
      verifiedSlugSet: slugs.filter((s) => previousSatisfied.has(s)),
      routeConfiguredCount: slugs.length,
      implementationStatus: "implemented",
      executableNow: true,
      requiredGates: ["route_identity", "expected_row_count", "team_signals", "arithmetic", "season_scope"],
      sourceFiles: [rel(renderedConfigPath)]
    });
    f.evidenceRows.push({ kind: "implemented_config", slugCount: slugs.length });
  }
}

if (apiConfig?.families) {
  for (const fam of apiConfig.families) {
    const competitions = fam.competitions || fam.routes || fam.targets || [];
    const host = fam.sourceHost || fam.host || hostFromUrl(competitions[0]?.sourceUrl || competitions[0]?.url || "");
    const key = familyKey(host, "official_api");
    const slugs = competitions.map((c) => c.competitionSlug || c.slug).filter(Boolean);
    const f = addFamily(families, key, {
      familyId: fam.familyId || key,
      adapterKind: "official_api",
      sourceHost: host,
      configuredSlugSet: slugs,
      verifiedSlugSet: slugs.filter((s) => previousSatisfied.has(s)),
      routeConfiguredCount: slugs.length,
      implementationStatus: "implemented",
      executableNow: true,
      requiredGates: ["route_identity", "expected_row_count", "team_signals", "arithmetic", "non_trivial", "season_scope"],
      sourceFiles: [rel(apiConfigPath)]
    });
    f.evidenceRows.push({ kind: "implemented_config", slugCount: slugs.length });
  }
}

for (const row of compilerRows) {
  const host = normHost(row.officialHost || hostFromUrl(row.finalUrl || row.sourceUrl || row.apiUrl));
  const key = row.familyId && row.familyId !== "generic_official_html_candidate"
    ? row.familyId
    : familyKey(host, "candidate_official_html_or_route");
  const slug = row.competitionSlug;
  const f = addFamily(families, key, {
    familyId: row.familyId || key,
    adapterKind: row.familyId === "jleague_official_html" ? "official_html" : "candidate_official_html_or_route",
    sourceHost: host,
    candidateSlugSet: slug ? [slug] : [],
    dueSlugSet: slug && duePrevious.has(slug) ? [slug] : [],
    routeIdentityRuleCount: row.routeIdentityPassed ? 1 : 0,
    implementationStatus: row.routeIdentityPassed ? "executable_candidate_requires_family_adapter" : "blocked_or_needs_route_identity_contract",
    executableNow: Boolean(row.routeIdentityPassed),
    requiredGates: row.requiredGates || ["route_identity", "expected_row_count", "team_signals", "arithmetic", "season_scope"],
    sourceFiles: [sourceCompilerRowsPath ? rel(sourceCompilerRowsPath) : null].filter(Boolean),
    evidenceRows: [{
      kind: "compiled_candidate",
      competitionSlug: slug,
      routeIdentityPassed: row.routeIdentityPassed,
      routeIdentityReason: row.routeIdentityReason,
      finalUrl: row.finalUrl || row.sourceUrl || row.apiUrl,
      priorityScore: row.priorityScore
    }]
  });
}

for (const row of apiHintScores) {
  const slug = row.competitionSlug;
  if (!slug || previousSatisfied.has(slug)) continue;
  const key = familyKey(row.officialHost || row.sourceHost || slug.split(".")[0], "hint_backlog");
  addFamily(families, key, {
    adapterKind: "hint_backlog",
    sourceHost: row.officialHost || row.sourceHost || null,
    candidateSlugSet: [slug],
    dueSlugSet: duePrevious.has(slug) ? [slug] : [],
    implementationStatus: "needs_family_discovery_or_adapter_generation",
    executableNow: false,
    requiredGates: ["route_identity", "expected_row_count", "team_signals", "arithmetic", "non_trivial", "season_scope", "duplicate_signature"],
    sourceFiles: [apiHintRowsPath ? rel(apiHintRowsPath) : null].filter(Boolean),
    evidenceRows: [{
      kind: "api_hint_score",
      competitionSlug: slug,
      score: row.score,
      fetched2xx: row.fetched2xx,
      tableSignals: row.tableSignals,
      governedDates: row.governedDates,
      usefulStanding: row.usefulStanding
    }]
  });
}

const registryRows = [...families.values()].map((f) => {
  const configuredSlugs = [...f.configuredSlugSet].sort();
  const dueSlugs = [...f.dueSlugSet].sort();
  const candidateSlugs = [...f.candidateSlugSet].sort();
  const verifiedSlugs = [...f.verifiedSlugSet].sort();
  const requiredGates = [...f.requiredGates].sort();
  const sourceFiles = [...f.sourceFiles].filter(Boolean).sort();
  const unsatisfiedDueSlugs = dueSlugs.filter((s) => !previousSatisfied.has(s));
  let actionClass = "monitor";
  if (f.implementationStatus === "implemented") actionClass = "execute_existing_family";
  else if (f.executableNow) actionClass = "generate_family_adapter_from_route_identity_passed_manifest";
  else if (candidateSlugs.length >= 2 || dueSlugs.length >= 2) actionClass = "discover_route_identity_contracts_for_family";
  else actionClass = "low_priority_or_singleton_backlog";

  return {
    familyKey: f.familyKey,
    familyId: f.familyId,
    adapterKind: f.adapterKind,
    sourceHost: f.sourceHost,
    implementationStatus: f.implementationStatus,
    executableNow: f.executableNow,
    actionClass,
    configuredSlugCount: configuredSlugs.length,
    verifiedSlugCount: verifiedSlugs.length,
    dueSlugCount: dueSlugs.length,
    unsatisfiedDueSlugCount: unsatisfiedDueSlugs.length,
    candidateSlugCount: candidateSlugs.length,
    routeConfiguredCount: f.routeConfiguredCount,
    routeIdentityRuleCount: f.routeIdentityRuleCount,
    configuredSlugs,
    verifiedSlugs,
    dueSlugs,
    unsatisfiedDueSlugs,
    candidateSlugs,
    requiredGates,
    sourceFiles,
    evidenceDigest: sha(JSON.stringify(f.evidenceRows.slice(0, 50))),
    evidenceSample: f.evidenceRows.slice(0, 12)
  };
}).sort((a, b) =>
  Number(b.actionClass === "execute_existing_family") - Number(a.actionClass === "execute_existing_family") ||
  Number(b.actionClass === "generate_family_adapter_from_route_identity_passed_manifest") - Number(a.actionClass === "generate_family_adapter_from_route_identity_passed_manifest") ||
  b.unsatisfiedDueSlugCount - a.unsatisfiedDueSlugCount ||
  b.candidateSlugCount - a.candidateSlugCount ||
  a.familyKey.localeCompare(b.familyKey)
);

const executableFamilies = registryRows.filter((r) => r.actionClass === "execute_existing_family");
const generatorFamilies = registryRows.filter((r) => r.actionClass === "generate_family_adapter_from_route_identity_passed_manifest");
const discoveryFamilies = registryRows.filter((r) => r.actionClass === "discover_route_identity_contracts_for_family");

const summary = {
  status: "passed",
  runner: "registry_driven_family_adapter_generator",
  contractVersion: 1,
  purpose: "build a source-family registry from implemented configs, lifecycle due tasks, and route-identity-filtered evidence; do not promote review candidates",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  ledgerRowsPath: ledgerRowsPath ? rel(ledgerRowsPath) : null,
  dueTasksPath: dueTasksPath ? rel(dueTasksPath) : null,
  sourceCompilerRowsPath: sourceCompilerRowsPath ? rel(sourceCompilerRowsPath) : null,
  sourceFamilyBoardPath: sourceFamilyBoardPath ? rel(sourceFamilyBoardPath) : null,
  apiHintRowsPath: apiHintRowsPath ? rel(apiHintRowsPath) : null,
  previousCompletedSatisfiedCount: previousSatisfied.size,
  currentOrNewSatisfiedCount: currentSatisfied.size,
  nextSeasonStartDateSatisfiedCount: startSatisfied.size,
  duePreviousCompletedSlugCount: duePrevious.size,
  dueNextSeasonStartDateSlugCount: dueStart.size,
  registryFamilyCount: registryRows.length,
  executableExistingFamilyCount: executableFamilies.length,
  generatorReadyFamilyCount: generatorFamilies.length,
  discoveryNeededFamilyCount: discoveryFamilies.length,
  totalUnsatisfiedDueSlugsRepresented: new Set(registryRows.flatMap((r) => r.unsatisfiedDueSlugs)).size,
  topExecutableFamilies: executableFamilies.slice(0, 20).map((r) => ({ familyId: r.familyId, adapterKind: r.adapterKind, verifiedSlugCount: r.verifiedSlugCount, configuredSlugCount: r.configuredSlugCount, configuredSlugs: r.configuredSlugs })),
  topGeneratorReadyFamilies: generatorFamilies.slice(0, 20).map((r) => ({ familyId: r.familyId, adapterKind: r.adapterKind, sourceHost: r.sourceHost, unsatisfiedDueSlugs: r.unsatisfiedDueSlugs, candidateSlugs: r.candidateSlugs })),
  topDiscoveryNeededFamilies: discoveryFamilies.slice(0, 20).map((r) => ({ familyId: r.familyId, adapterKind: r.adapterKind, sourceHost: r.sourceHost, unsatisfiedDueSlugCount: r.unsatisfiedDueSlugCount, candidateSlugCount: r.candidateSlugCount, candidateSlugs: r.candidateSlugs.slice(0, 20) })),
  hardRule: "only executable family adapters may emit truth rows; registry rows are planning/control artifacts only",
  recommendedNextLane: generatorFamilies.length > 0
    ? "generate_and_execute_route_identity_passed_family_adapters"
    : "discover_route_identity_contracts_for_high_slug_families"
};

const outPath = path.join(OUT_DIR, `registry-driven-family-adapter-generator-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `registry-family-rows-${DATE}.jsonl`);
const executablePath = path.join(OUT_DIR, `registry-executable-existing-families-${DATE}.jsonl`);
const generatorPath = path.join(OUT_DIR, `registry-generator-ready-families-${DATE}.jsonl`);
const discoveryPath = path.join(OUT_DIR, `registry-discovery-needed-families-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, registryRows, executableFamilies, generatorFamilies, discoveryFamilies }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, registryRows.map((r) => JSON.stringify(r)).join("\n") + (registryRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(executablePath, executableFamilies.map((r) => JSON.stringify(r)).join("\n") + (executableFamilies.length ? "\n" : ""), "utf8");
fs.writeFileSync(generatorPath, generatorFamilies.map((r) => JSON.stringify(r)).join("\n") + (generatorFamilies.length ? "\n" : ""), "utf8");
fs.writeFileSync(discoveryPath, discoveryFamilies.map((r) => JSON.stringify(r)).join("\n") + (discoveryFamilies.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  executableFamiliesOutput: rel(executablePath),
  generatorReadyFamiliesOutput: rel(generatorPath),
  discoveryNeededFamiliesOutput: rel(discoveryPath),
  summary
}, null, 2));
