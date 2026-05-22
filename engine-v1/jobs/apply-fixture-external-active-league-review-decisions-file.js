import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    review: null,
    groups: null,
    decisions: null,
    validation: null,
    allowOverwrite: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--review" && argv[i + 1]) {
      out.review = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--groups" && argv[i + 1]) {
      out.groups = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--decisions" && argv[i + 1]) {
      out.decisions = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--validation" && argv[i + 1]) {
      out.validation = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--allow-overwrite") {
      out.allowOverwrite = true;
      continue;
    }
  }

  for (const key of ["review", "groups", "decisions"]) {
    if (!out[key]) throw new Error(`--${key} path is required`);
  }

  if (!out.validation) {
    const parsed = path.parse(out.review);
    out.validation = path.join(parsed.dir, `${parsed.name}.validation.json`);
  }

  return out;
}

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeDecisionPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.decisions;
  if (!Array.isArray(rows)) {
    throw new Error("Decisions file must be either an array or an object with decisions:[].");
  }

  return rows.map((row, index) => {
    const leagueSlug = clean(row.leagueSlug);
    const sourceVerdict = clean(row.sourceVerdict);

    if (!leagueSlug) throw new Error(`Decision ${index}: leagueSlug is required`);
    if (!["verified_active", "verified_inactive", "insufficient_evidence", "unreviewed"].includes(sourceVerdict)) {
      throw new Error(`Decision ${index} ${leagueSlug}: unsupported sourceVerdict '${sourceVerdict}'`);
    }

    const externallyActive = row.externallyActive ?? null;
    const fixtureCountFound = row.fixtureCountFound ?? null;
    const missingFromSnapshot = row.missingFromSnapshot ?? null;

    if (sourceVerdict === "verified_active") {
      if (externallyActive !== true) throw new Error(`${leagueSlug}: verified_active requires externallyActive=true`);
      if (!Number.isFinite(Number(fixtureCountFound)) || Number(fixtureCountFound) < 1) {
        throw new Error(`${leagueSlug}: verified_active requires fixtureCountFound >= 1`);
      }
      if (missingFromSnapshot !== true) throw new Error(`${leagueSlug}: verified_active requires missingFromSnapshot=true for this external gap review`);
      if (asArray(row.sourceUrls).length < 1) throw new Error(`${leagueSlug}: verified_active requires sourceUrls`);
    }

    if (sourceVerdict === "verified_inactive") {
      if (externallyActive !== false) throw new Error(`${leagueSlug}: verified_inactive requires externallyActive=false`);
      if (Number(fixtureCountFound) !== 0) throw new Error(`${leagueSlug}: verified_inactive requires fixtureCountFound=0`);
      if (missingFromSnapshot !== false) throw new Error(`${leagueSlug}: verified_inactive requires missingFromSnapshot=false`);
      if (asArray(row.sourceUrls).length < 1) throw new Error(`${leagueSlug}: verified_inactive requires sourceUrls`);
    }

    return {
      leagueSlug,
      externallyActive,
      fixtureCountFound,
      sourceUrls: asArray(row.sourceUrls).map(clean).filter(Boolean),
      sourceTypes: asArray(row.sourceTypes).map(clean).filter(Boolean),
      sourceVerdict,
      missingFromSnapshot,
      reviewerNotes: clean(row.reviewerNotes)
    };
  });
}

function applyReviewDecision(review, decision, allowOverwrite) {
  const item = review.reviewItems?.find((row) => clean(row.leagueSlug) === decision.leagueSlug);
  if (!item) throw new Error(`Review item not found for ${decision.leagueSlug}`);

  const currentVerdict = clean(item.reviewFields?.sourceVerdict || "unreviewed");
  if (!allowOverwrite && currentVerdict !== "unreviewed") {
    throw new Error(`Refusing to overwrite ${decision.leagueSlug}: current verdict is ${currentVerdict}`);
  }

  item.reviewFields.externallyActive = decision.externallyActive;
  item.reviewFields.fixtureCountFound = decision.fixtureCountFound;
  item.reviewFields.sourceUrls = decision.sourceUrls;
  item.reviewFields.sourceTypes = decision.sourceTypes;
  item.reviewFields.sourceVerdict = decision.sourceVerdict;
  item.reviewFields.missingFromSnapshot = decision.missingFromSnapshot;
  item.reviewFields.reviewerNotes = decision.reviewerNotes;

  return item;
}

function recomputeGroupVerdict(group) {
  const decisions = Array.isArray(group.reviewFields?.itemDecisions) ? group.reviewFields.itemDecisions : [];
  const unreviewed = decisions.filter((row) => clean(row.sourceVerdict) === "unreviewed");
  const active = decisions.filter((row) => clean(row.sourceVerdict) === "verified_active");
  const insufficient = decisions.filter((row) => clean(row.sourceVerdict) === "insufficient_evidence");

  if (unreviewed.length > 0 || insufficient.length > 0) {
    group.reviewFields.groupReviewed = false;
    group.reviewFields.groupVerdict = active.length > 0 ? "partial_verified_active" : "partial_review";
    return;
  }

  group.reviewFields.groupReviewed = true;
  group.reviewFields.groupVerdict = active.length > 0 ? "verified_active" : "verified_inactive";
}

function applyGroupDecision(groups, decision) {
  const group = groups.groups?.find((row) => asArray(row.leagueSlugs).map(clean).includes(decision.leagueSlug));
  if (!group) throw new Error(`Batch group not found for ${decision.leagueSlug}`);

  const itemDecision = group.reviewFields?.itemDecisions?.find((row) => clean(row.leagueSlug) === decision.leagueSlug);
  if (!itemDecision) throw new Error(`Group itemDecision not found for ${decision.leagueSlug}`);

  itemDecision.externallyActive = decision.externallyActive;
  itemDecision.fixtureCountFound = decision.fixtureCountFound;
  itemDecision.missingFromSnapshot = decision.missingFromSnapshot;
  itemDecision.sourceVerdict = decision.sourceVerdict;
  itemDecision.reviewerNotes = decision.reviewerNotes;

  group.reviewFields.sourceUrls = [
    ...new Set([
      ...asArray(group.reviewFields.sourceUrls).map(clean).filter(Boolean),
      ...decision.sourceUrls
    ])
  ];

  group.reviewFields.sourceTypes = [
    ...new Set([
      ...asArray(group.reviewFields.sourceTypes).map(clean).filter(Boolean),
      ...decision.sourceTypes
    ])
  ];

  recomputeGroupVerdict(group);

  const reviewedSlugs = group.reviewFields.itemDecisions
    .filter((row) => clean(row.sourceVerdict) !== "unreviewed")
    .map((row) => clean(row.leagueSlug));

  group.reviewFields.notes = `Updated by review decision applier. Reviewed items in this group: ${reviewedSlugs.join(", ") || "none"}.`;

  return group;
}

function runValidation(reviewPath, validationPath) {
  const validator = path.join(__dirname, "validate-fixture-external-active-league-review-pack-file.js");
  const stdout = execFileSync(process.execPath, [
    validator,
    "--input",
    reviewPath,
    "--output",
    validationPath
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function main() {
  const options = parseArgs();
  const review = readJson(options.review);
  const groups = readJson(options.groups);
  const decisions = normalizeDecisionPayload(readJson(options.decisions));

  const applied = [];

  for (const decision of decisions) {
    const item = applyReviewDecision(review, decision, options.allowOverwrite);
    const group = applyGroupDecision(groups, decision);
    applied.push({
      leagueSlug: decision.leagueSlug,
      reviewId: item.reviewId,
      groupId: group.groupId,
      sourceVerdict: decision.sourceVerdict
    });
  }

  writeJson(options.review, review);
  writeJson(options.groups, groups);

  const validationRun = runValidation(options.review, options.validation);
  const validation = readJson(options.validation);

  const report = {
    ok: true,
    appliedCount: applied.length,
    applied,
    validationSummary: validation.summary || validationRun?.summary || null,
    guarantees: {
      sourceFetch: false,
      discoveredExternally: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});