import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    output: null,
    maxGroups: null,
    maxItemsPerGroup: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--input" && argv[i + 1]) {
      out.input = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--max-groups" && argv[i + 1]) {
      out.maxGroups = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }

    if (arg === "--max-items-per-group" && argv[i + 1]) {
      out.maxItemsPerGroup = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }
  }

  if (!out.input) {
    throw new Error("--input path/to/review-pack.json is required");
  }

  if (!out.output) {
    const parsed = path.parse(out.input);
    out.output = path.join(parsed.dir, `${parsed.name}.batch-review-groups.json`);
  }

  if (out.maxGroups != null && (!Number.isFinite(out.maxGroups) || out.maxGroups < 1)) {
    throw new Error("--max-groups must be a positive integer");
  }

  if (out.maxItemsPerGroup != null && (!Number.isFinite(out.maxItemsPerGroup) || out.maxItemsPerGroup < 1)) {
    throw new Error("--max-items-per-group must be a positive integer");
  }

  return out;
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing input file: ${file}`);
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: invalid JSON: ${error?.message || String(error)}`);
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function humanizeCountry(value) {
  const raw = cleanText(value);
  const upper = raw.toUpperCase();

  if (["AFC", "CAF", "UEFA", "CONCACAF", "CONMEBOL", "OFC"].includes(upper)) {
    return upper;
  }

  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function groupKeyFor(item) {
  const dayKey = cleanText(item?.dayKey);
  const country = normalizeKey(item?.country || "unknown");
  return `${dayKey}:${country}`;
}

function groupLabelFor(item) {
  const dayKey = cleanText(item?.dayKey);
  const country = humanizeCountry(item?.country || "unknown");
  return `${country} external activity check — ${dayKey}`;
}

function unique(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function firstN(values, limit) {
  return values.slice(0, limit);
}

function buildCombinedQueries(items) {
  const dayKey = cleanText(items[0]?.dayKey);
  const country = cleanText(items[0]?.country);
  const countryLabel = humanizeCountry(country);

  const competitionNames = unique(items.map((item) => item.name));
  const competitionSlugs = unique(items.map((item) => item.leagueSlug));

  const countryQueries = [
    country ? `${countryLabel} football fixtures ${dayKey}` : "",
    country ? `${countryLabel} football schedule ${dayKey}` : "",
    country ? `${countryLabel} soccer fixtures ${dayKey}` : "",
    country ? `${countryLabel} federation fixtures ${dayKey}` : ""
  ];

  const competitionQueries = competitionNames.flatMap((name) => [
    `"${name}" fixtures ${dayKey}`,
    `"${name}" schedule ${dayKey}`
  ]);

  const slugQueries = competitionSlugs.map((slug) => `${slug} fixtures ${dayKey}`);

  const itemQueries = items.flatMap((item) => Array.isArray(item?.searchQueries) ? item.searchQueries : []);

  return firstN(unique([
    ...countryQueries,
    ...competitionQueries,
    ...slugQueries,
    ...itemQueries
  ]), 30);
}

function buildSourceTargets(items) {
  const country = cleanText(items[0]?.country);
  const countryLabel = humanizeCountry(country);
  const competitionNames = unique(items.map((item) => item.name));

  return unique([
    country ? `${countryLabel} football federation official fixtures page` : "",
    country ? `${countryLabel} league official schedule page` : "",
    country ? `${countryLabel} cup official fixtures page` : "",
    ...competitionNames.map((name) => `${name} official fixtures`),
    ...competitionNames.map((name) => `${name} official schedule`)
  ]);
}

function reviewStrategyFor(items) {
  const hasCup = items.some((item) => /\.cup$/.test(cleanText(item?.leagueSlug)));
  const hasMultiple = items.length > 1;

  if (hasMultiple && hasCup) {
    return "Check the country/federation fixtures hub first, then verify league and cup rows separately if the hub splits competitions.";
  }

  if (hasMultiple) {
    return "Check the country/federation or league hub first; one official schedule source may resolve multiple competitions.";
  }

  return "Check the competition official fixture/schedule page first, then use a structured provider only as cross-check.";
}

function buildGroups(reviewPack, options) {
  const items = Array.isArray(reviewPack?.reviewItems) ? reviewPack.reviewItems : [];

  const buckets = new Map();

  for (const item of items) {
    const key = groupKeyFor(item);
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(item);
  }

  let groups = [...buckets.entries()].map(([groupKey, groupItems], index) => {
    const limitedItems = options.maxItemsPerGroup
      ? groupItems.slice(0, options.maxItemsPerGroup)
      : groupItems;

    const dayKey = cleanText(limitedItems[0]?.dayKey);
    const country = cleanText(limitedItems[0]?.country);

    return {
      groupId: `fixture-external-active-batch:${String(index + 1).padStart(4, "0")}`,
      groupKey,
      groupLabel: groupLabelFor(limitedItems[0]),
      dayKey,
      country: country || null,
      competitionCount: limitedItems.length,
      reviewItemIds: limitedItems.map((item) => cleanText(item.reviewId)),
      leagueSlugs: limitedItems.map((item) => cleanText(item.leagueSlug)),
      competitionNames: limitedItems.map((item) => cleanText(item.name)),
      priorities: unique(limitedItems.map((item) => item.priority)),
      targetTypes: unique(limitedItems.map((item) => item.targetType)),
      needsExternalActivityProof: limitedItems.some((item) => item.needsExternalActivityProof === true),
      combinedSearchQueries: buildCombinedQueries(limitedItems),
      preferredBatchSourceTargets: buildSourceTargets(limitedItems),
      reviewStrategy: reviewStrategyFor(limitedItems),
      reviewFields: {
        groupReviewed: false,
        sourceUrls: [],
        sourceTypes: [],
        groupVerdict: "unreviewed",
        notes: "",
        itemDecisions: limitedItems.map((item) => ({
          reviewId: cleanText(item.reviewId),
          leagueSlug: cleanText(item.leagueSlug),
          externallyActive: null,
          fixtureCountFound: null,
          missingFromSnapshot: null,
          sourceVerdict: "unreviewed",
          reviewerNotes: ""
        }))
      },
      acceptanceRules: [
        "Prefer official federation, league, or competition sources for the group.",
        "A single country/federation source can support multiple item decisions only if it clearly lists each competition/day.",
        "Do not mark an item externallyActive=true unless the source evidence shows fixtures for that exact day.",
        "Do not treat scoreboard-only evidence as value-ready fixture acquisition capability.",
        "Do not write canonical fixtures from this batch group file."
      ],
      guarantees: {
        sourceFetch: false,
        discoveredExternally: false,
        canonicalWrites: 0,
        valueWrites: false,
        detailsWrites: false,
        productionWrite: false
      }
    };
  });

  groups.sort((a, b) => {
    return String(a.dayKey).localeCompare(String(b.dayKey)) ||
      String(a.country || "").localeCompare(String(b.country || "")) ||
      String(a.groupId).localeCompare(String(b.groupId));
  });

  if (options.maxGroups) {
    groups = groups.slice(0, options.maxGroups);
  }

  return groups;
}

function summarize(groups, reviewPack) {
  const itemCount = groups.reduce((sum, group) => sum + group.competitionCount, 0);

  return {
    inputReviewSummary: reviewPack?.summary || null,
    groupCount: groups.length,
    groupedReviewItemCount: itemCount,
    countryCount: new Set(groups.map((group) => group.country)).size,
    dayCount: new Set(groups.map((group) => group.dayKey)).size,
    multiCompetitionGroupCount: groups.filter((group) => group.competitionCount > 1).length,
    unreviewedGroupCount: groups.filter((group) => group.reviewFields?.groupVerdict === "unreviewed").length
  };
}

async function main() {
  const options = parseArgs();
  const reviewPack = readJson(options.input);

  if (!reviewPack?.ok) {
    throw new Error("Input review pack is not ok:true");
  }

  const groups = buildGroups(reviewPack, options);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceInput: options.input,
    auditWindow: reviewPack.auditWindow || null,
    summary: summarize(groups, reviewPack),
    groups,
    notes: [
      "This file groups review items for faster manual or controlled external activity checks.",
      "It does not fetch sources and does not prove external fixture activity.",
      "Group decisions must still be validated item-by-item before any acquisition action.",
      "No canonical, value, details, or production writes are allowed from this file."
    ],
    guarantees: {
      sourceFetch: false,
      discoveredExternally: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    ok: true,
    input: options.input,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});