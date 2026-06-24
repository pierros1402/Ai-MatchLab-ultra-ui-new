import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `family-previous-completed-expansion-inspection-${today}`);
const outputPath = path.join(outputDir, `family-previous-completed-expansion-inspection-${today}.json`);
const rowsOutputPath = path.join(outputDir, `family-previous-completed-expansion-inspection-rows-${today}.jsonl`);

const providerAvailabilityPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-availability-board-${today}`, `provider-api-season-availability-board-${today}.json`);

const scanRoots = [
  path.join(root, "engine-v1", "jobs"),
  path.join(root, "engine-v1", "config")
];

const families = [
  {
    family: "sportomedia_sef",
    slugs: ["swe.1", "swe.2"],
    lifecycleNow: "current_or_new_only",
    strongTokens: ["sportomedia", "sef"],
    supportTokens: ["allsvenskan", "superettan", "swe.1", "swe.2"],
    targetReason: "existing Sportomedia/SEF source family has controlled/exact standings runners and covers two Swedish slugs that lack previous_completed coverage"
  },
  {
    family: "torneopal_veikkausliiga",
    slugs: ["fin.1", "fin.2"],
    lifecycleNow: "current_or_new_only",
    strongTokens: ["torneopal", "veikkausliiga"],
    supportTokens: ["ykkosliiga", "fin.1", "fin.2"],
    targetReason: "Finland family has existing current/new coverage but previous_completed remains unpromoted; provider path showed phase/scope mismatch"
  },
  {
    family: "ksi_iceland",
    slugs: ["isl.1", "isl.2"],
    lifecycleNow: "current_or_new_only",
    strongTokens: ["ksi", "iceland"],
    supportTokens: ["island", "isl.1", "isl.2"],
    targetReason: "Iceland family has current/new coverage and may be extensible if season/year parameters exist"
  },
  {
    family: "norway_ntf",
    slugs: ["nor.1"],
    lifecycleNow: "current_or_new_only",
    strongTokens: ["norway", "ntf"],
    supportTokens: ["eliteserien", "obos", "nor.1"],
    targetReason: "Norway NTF has existing official family, but nor.2 is blocked by carryover arithmetic"
  },
  {
    family: "cfa_cyprus_html",
    slugs: ["cyp.1"],
    lifecycleNow: "current_or_new_only",
    strongTokens: ["cfa_cyprus", "cyprus"],
    supportTokens: ["cfa", "cyp.1"],
    targetReason: "Cyprus first division has current/new coverage; cyp.2 remains blocked by phase/carryover problems"
  },
  {
    family: "loi_ajax",
    slugs: ["irl.1"],
    lifecycleNow: "no_lifecycle_coverage",
    strongTokens: ["loi_ajax", "league-of-ireland", "league_of_ireland"],
    supportTokens: ["irl.1", "ireland"],
    targetReason: "LOI family exists but stays lower priority unless exact contract and verifier are independently found"
  }
];

const keywordRegex = /(previous|completed|current|new|season|year|standings|standing|table|graphql|ajax|endpoint|url|route|league|competition|slug|allow-fetch|canonical|truth|verify|verified|exact|controlled|modern|runner|proof)/i;

async function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function walk(dir) {
  const out = [];
  if (!(await exists(dir))) return out;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else if (entry.isFile() && /\.(js|json|mjs|cjs)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function normalized(value) {
  return String(value || "").toLowerCase();
}

function tokenHit(haystack, token) {
  const t = normalized(token);
  if (t.includes(".") || t.includes("_") || t.includes("-")) return haystack.includes(t);

  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function familyMatched(haystack, family) {
  const strongHits = family.strongTokens.filter(token => tokenHit(haystack, token));
  const slugHits = family.slugs.filter(slug => tokenHit(haystack, slug));
  const supportHits = family.supportTokens.filter(token => tokenHit(haystack, token));

  const matched =
    strongHits.length > 0 ||
    slugHits.length > 0 ||
    (supportHits.length >= 2 && family.family !== "loi_ajax");

  return {
    matched,
    strongHits,
    slugHits,
    supportHits
  };
}

function lineSnippets(text) {
  const lines = text.split(/\r?\n/);
  const matches = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!keywordRegex.test(lines[i])) continue;

    const start = Math.max(0, i - 1);
    const end = Math.min(lines.length - 1, i + 1);
    const snippet = [];

    for (let j = start; j <= end; j += 1) {
      snippet.push({
        line: j + 1,
        text: lines[j].slice(0, 240)
      });
    }

    matches.push({
      centerLine: i + 1,
      snippet
    });

    if (matches.length >= 8) break;
  }

  return matches;
}

function boolSignal(text, regex) {
  return regex.test(text);
}

function scoreFamily(row) {
  let score = 0;
  const reasons = [];

  if (row.runnableFileCount > 0) {
    score += 30;
    reasons.push("has_runnable_jobs");
  }

  if (row.verifierFileCount > 0) {
    score += 25;
    reasons.push("has_verifier_jobs");
  }

  if (row.configFileCount > 0) {
    score += 10;
    reasons.push("has_config_files");
  }

  if (row.exactSignal) {
    score += 20;
    reasons.push("has_exact_signal");
  }

  if (row.controlledSignal) {
    score += 15;
    reasons.push("has_controlled_signal");
  }

  if (row.graphqlOrAjaxSignal) {
    score += 20;
    reasons.push("has_graphql_or_ajax_signal");
  }

  if (row.seasonOrYearSignal) {
    score += 25;
    reasons.push("has_season_or_year_signal");
  }

  if (row.previousCompletedSignal) {
    score += 20;
    reasons.push("has_previous_completed_signal");
  }

  if (row.lifecycleNow === "current_or_new_only") {
    score += 15;
    reasons.push("current_new_only_gap");
  }

  if (row.family === "sportomedia_sef") {
    score += 20;
    reasons.push("preferred_first_reusable_family_after_provider_block");
  }

  if (row.family === "loi_ajax" && row.verifierFileCount === 0) {
    score -= 40;
    reasons.push("missing_verifier_penalty");
  }

  return { score, reasons };
}

await fs.mkdir(outputDir, { recursive: true });

const allFiles = [];
for (const scanRoot of scanRoots) {
  allFiles.push(...await walk(scanRoot));
}

let providerAvailabilitySummary = null;
let providerAvailabilitySha256 = null;
if (await exists(providerAvailabilityPath)) {
  const providerAvailability = JSON.parse(await fs.readFile(providerAvailabilityPath, "utf8"));
  providerAvailabilitySummary = providerAvailability.summary || null;
  providerAvailabilitySha256 = await sha256(providerAvailabilityPath);
}

const rows = [];

for (const family of families) {
  const matchingFiles = [];

  for (const file of allFiles) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    const relative = rel(file);
    const haystack = normalized(`${relative}\n${text}`);
    const match = familyMatched(haystack, family);

    if (!match.matched) continue;

    matchingFiles.push({
      path: relative,
      type: relative.startsWith("engine-v1/jobs/") ? "job" : "config",
      sha256: await sha256Text(text),
      bytes: Buffer.byteLength(text, "utf8"),
      basename: path.basename(file),
      matchEvidence: {
        strongHits: match.strongHits,
        slugHits: match.slugHits,
        supportHits: match.supportHits
      },
      signals: {
        runnable: relative.startsWith("engine-v1/jobs/run-"),
        verifier: relative.startsWith("engine-v1/jobs/verify-"),
        builder: relative.startsWith("engine-v1/jobs/build-"),
        config: relative.startsWith("engine-v1/config/"),
        exact: boolSignal(text, /exact/i),
        controlled: boolSignal(text, /controlled/i),
        graphqlOrAjax: boolSignal(text, /graphql|ajax/i),
        seasonOrYear: boolSignal(text, /season|year|seasonLabel|seasonScope|matchweek/i),
        previousCompleted: boolSignal(text, /previous_completed|previous completed|completed season/i),
        currentOrNew: boolSignal(text, /current_or_new|current\/new|current season|new season/i),
        standings: boolSignal(text, /standings|standing|table/i),
        allowFetch: boolSignal(text, /allow-fetch|allowFetch/i),
        canonicalWriteMention: boolSignal(text, /canonicalWrite|canonical write|canonical candidate/i),
        truthMention: boolSignal(text, /truthAssertion|truth assertion/i)
      },
      snippets: lineSnippets(text)
    });
  }

  const row = {
    family: family.family,
    slugs: family.slugs,
    slugCount: family.slugs.length,
    lifecycleNow: family.lifecycleNow,
    targetReason: family.targetReason,
    matchingFileCount: matchingFiles.length,
    runnableFileCount: matchingFiles.filter(file => file.signals.runnable).length,
    verifierFileCount: matchingFiles.filter(file => file.signals.verifier).length,
    builderFileCount: matchingFiles.filter(file => file.signals.builder).length,
    configFileCount: matchingFiles.filter(file => file.signals.config).length,
    exactSignal: matchingFiles.some(file => file.signals.exact),
    controlledSignal: matchingFiles.some(file => file.signals.controlled),
    graphqlOrAjaxSignal: matchingFiles.some(file => file.signals.graphqlOrAjax),
    seasonOrYearSignal: matchingFiles.some(file => file.signals.seasonOrYear),
    previousCompletedSignal: matchingFiles.some(file => file.signals.previousCompleted),
    currentOrNewSignal: matchingFiles.some(file => file.signals.currentOrNew),
    standingsSignal: matchingFiles.some(file => file.signals.standings),
    allowFetchSignal: matchingFiles.some(file => file.signals.allowFetch),
    canonicalWriteMention: matchingFiles.some(file => file.signals.canonicalWriteMention),
    truthMention: matchingFiles.some(file => file.signals.truthMention),
    topFiles: matchingFiles
      .sort((a, b) => {
        const scoreA =
          Number(a.signals.runnable) * 8 +
          Number(a.signals.verifier) * 6 +
          Number(a.signals.config) * 4 +
          Number(a.signals.exact) * 3 +
          Number(a.signals.seasonOrYear) * 2 +
          a.matchEvidence.strongHits.length * 5 +
          a.matchEvidence.slugHits.length * 4;
        const scoreB =
          Number(b.signals.runnable) * 8 +
          Number(b.signals.verifier) * 6 +
          Number(b.signals.config) * 4 +
          Number(b.signals.exact) * 3 +
          Number(b.signals.seasonOrYear) * 2 +
          b.matchEvidence.strongHits.length * 5 +
          b.matchEvidence.slugHits.length * 4;
        return scoreB - scoreA || a.path.localeCompare(b.path);
      })
      .slice(0, 10),
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };

  const score = scoreFamily(row);
  row.expansionReadinessScore = score.score;
  row.expansionReadinessReasons = score.reasons;
  row.recommendedFamilyNextAction = row.verifierFileCount > 0 && row.runnableFileCount > 0 && row.seasonOrYearSignal
    ? "build_family_specific_previous_completed_proof_harness"
    : "inspect_or_create_missing_family_contract_before_fetch";

  rows.push(row);
}

rows.sort((a, b) => b.expansionReadinessScore - a.expansionReadinessScore || b.slugCount - a.slugCount || a.family.localeCompare(b.family));

const selected = rows[0] || null;

const report = {
  status: "passed",
  runner: "family_previous_completed_expansion_inspection",
  contractVersion: 2,
  purpose: "Strictly inspect existing deterministic source-family code/config for previous_completed expansion after provider canonicalization was blocked. No fetch/search/canonical/truth/production writes.",
  scanRoots: scanRoots.map(rel),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  providerAvailabilityPath: (await exists(providerAvailabilityPath)) ? rel(providerAvailabilityPath) : null,
  providerAvailabilitySha256,
  providerAvailabilitySummary,
  summary: {
    inspectedFamilyCount: rows.length,
    selectedNextFamily: selected?.family || null,
    selectedNextSlugs: selected?.slugs || [],
    selectedExpansionReadinessScore: selected?.expansionReadinessScore || 0,
    selectedExpansionReadinessReasons: selected?.expansionReadinessReasons || [],
    selectedRecommendedNextAction: selected?.recommendedFamilyNextAction || null,
    currentNewOnlyFamilyCount: rows.filter(row => row.lifecycleNow === "current_or_new_only").length,
    familiesWithRunnableJobs: rows.filter(row => row.runnableFileCount > 0).map(row => row.family),
    familiesWithVerifierJobs: rows.filter(row => row.verifierFileCount > 0).map(row => row.family),
    familiesWithSeasonOrYearSignal: rows.filter(row => row.seasonOrYearSignal).map(row => row.family),
    providerTargetContractEligibleCount: providerAvailabilitySummary?.targetContractSeasonAvailableAndValidatedCount ?? null,
    providerCanonicalizationAllowedFromCurrentState: (providerAvailabilitySummary?.targetContractSeasonAvailableAndValidatedCount || 0) > 0,
    recommendedNextLane: selected
      ? `build ${selected.family} previous_completed proof harness from existing family files; first plan-only, then bounded allow-fetch if the harness has exact season-scope gates`
      : "no family selected"
  },
  rows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary
}, null, 2));
