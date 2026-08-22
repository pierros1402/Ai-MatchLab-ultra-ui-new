import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveFlashscoreCompetitionIdentity } from "../odds/flashscore-competition-identity.js";
import { resolveDataPath } from "../storage/data-root.js";

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function canonicalFlashscoreId(row) {
  return String(
    row?.providerIds?.flashscore ||
    row?.sourceMatchId ||
    row?.sourceId ||
    ""
  ).trim();
}

function isFlashscoreRow(row) {
  const source = String(row?.source || "").trim().toLowerCase();
  return source === "flashscore" || Boolean(row?.providerIds?.flashscore);
}

export function auditCanonicalRowsAgainstFlashscoreFeed({
  dayKey,
  canonicalPayloads = [],
  feedRows = []
} = {}) {
  const providerById = new Map();
  for (const row of Array.isArray(feedRows) ? feedRows : []) {
    const id = String(row?.matchId || "").trim();
    if (id) providerById.set(id, row);
  }

  const issues = [];
  const verified = [];
  const providerEvidenceMissing = [];
  let flashscoreCanonicalRows = 0;

  for (const payload of Array.isArray(canonicalPayloads) ? canonicalPayloads : []) {
    const fileSlug = String(payload?.leagueSlug || "").trim();
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    for (const row of fixtures) {
      if (!isFlashscoreRow(row)) continue;
      flashscoreCanonicalRows++;

      const providerId = canonicalFlashscoreId(row);
      const observedSlug = String(row?.leagueSlug || fileSlug || "").trim();
      const evidence = providerId ? providerById.get(providerId) : null;

      const base = {
        dayKey: String(dayKey || payload?.dayKey || row?.dayKey || ""),
        canonicalId: row?.canonicalId || row?.matchId || null,
        providerId: providerId || null,
        observedSlug: observedSlug || null,
        observedLeagueName: row?.leagueName || null,
        homeTeam: row?.homeTeam || null,
        awayTeam: row?.awayTeam || null,
        kickoffUtc: row?.kickoffUtc || null
      };

      if (!evidence) {
        providerEvidenceMissing.push({
          ...base,
          reason: providerId ? "provider_match_not_in_fetched_window" : "provider_match_id_missing"
        });
        continue;
      }

      const identity = resolveFlashscoreCompetitionIdentity(evidence);
      const evidenceBlock = {
        providerCountry: evidence?.country || null,
        providerLeagueName: evidence?.leagueName || null,
        providerLeaguePath: identity.providerPath || evidence?.leaguePath || null,
        authoritativeSlug: identity.slug || null,
        identityResolution: identity.resolution,
        identityAuthoritative: identity.authoritative
      };

      if (!identity.slug) {
        issues.push({
          ...base,
          ...evidenceBlock,
          reason: "provider_path_unmapped_from_declared_coverage"
        });
        continue;
      }

      if (identity.slug !== observedSlug) {
        issues.push({
          ...base,
          ...evidenceBlock,
          reason: "canonical_competition_slug_mismatch"
        });
        continue;
      }

      verified.push({
        ...base,
        ...evidenceBlock
      });
    }
  }

  return {
    schema: "ai-matchlab.flashscore-canonical-taxonomy-audit.v1",
    dayKey: String(dayKey || ""),
    flashscoreCanonicalRows,
    providerEvidenceRows: providerById.size,
    verifiedCount: verified.length,
    issueCount: issues.length,
    providerEvidenceMissingCount: providerEvidenceMissing.length,
    clean:
      issues.length === 0 &&
      providerEvidenceMissing.length === 0,
    issues,
    providerEvidenceMissing,
    verified
  };
}

function loadCanonicalDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => readJson(path.join(dir, name), null))
    .filter(Boolean);
}

function parseArgs(argv = process.argv.slice(2)) {
  const dayKey = String(argv.find(x => /^\d{4}-\d{2}-\d{2}$/.test(String(x))) || "").trim();
  const includeVerified = argv.includes("--include-verified");
  return { dayKey, includeVerified };
}

export async function runFlashscoreCanonicalTaxonomyAudit(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
    throw new Error("audit-flashscore-canonical-taxonomy-day: expected YYYY-MM-DD day key");
  }

  // This is an evidence audit, not a repair. The current-day Flashscore feed is
  // fetched with adjacent offsets so provider IDs around local-day boundaries are
  // available. Missing provider evidence remains explicitly unresolved and never
  // becomes permission to delete a canonical row.
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, 0, 1] });
  const canonicalPayloads = loadCanonicalDay(dayKey);

  const audit = auditCanonicalRowsAgainstFlashscoreFeed({
    dayKey,
    canonicalPayloads,
    feedRows: feed?.rows || []
  });

  return {
    ...audit,
    providerFetch: {
      ok: Boolean(feed?.ok),
      attempts: Array.isArray(feed?.attempts) ? feed.attempts : []
    },
    generatedAt: new Date().toISOString(),
    readOnly: true
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const { dayKey, includeVerified } = parseArgs();

  runFlashscoreCanonicalTaxonomyAudit(dayKey)
    .then(result => {
      const output = includeVerified
        ? result
        : { ...result, verified: undefined };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      process.exitCode = result.issueCount > 0 ? 2 : 0;
    })
    .catch(error => {
      console.error(error?.stack || error?.message || error);
      process.exitCode = 1;
    });
}
