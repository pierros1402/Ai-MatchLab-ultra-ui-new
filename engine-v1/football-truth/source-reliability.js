function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\/:_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeUrl(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function hostnameOf(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return normalizeUrl(raw).split("/")[0] || "";
  }
}

function sourceIdentity(input) {
  const sourceName =
    input?.sourceName ||
    input?.source ||
    input?.sourceKey ||
    input?.provider ||
    input?.candidate?.sourceName ||
    input?.normalizedEvidence?.sourceName ||
    "";

  const sourceUrl =
    input?.sourceUrl ||
    input?.url ||
    input?.sourceLink ||
    input?.candidate?.sourceUrl ||
    input?.normalizedEvidence?.sourceUrl ||
    "";

  const sourceType =
    input?.sourceType ||
    input?.type ||
    input?.sourceTier ||
    input?.candidate?.sourceType ||
    input?.normalizedEvidence?.sourceType ||
    "";

  return {
    sourceName: String(sourceName || "").trim(),
    sourceUrl: String(sourceUrl || "").trim(),
    sourceType: String(sourceType || "").trim(),
    host: hostnameOf(sourceUrl),
    normalizedName: normalizeText(sourceName),
    normalizedType: normalizeText(sourceType),
    normalizedUrl: normalizeUrl(sourceUrl)
  };
}

function hasAny(value, needles) {
  const text = normalizeText(value);
  return needles.some(needle => text.includes(needle));
}

function hostMatches(host, domains) {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

const OFFICIAL_TYPE_SIGNALS = [
  "official",
  "club official",
  "team official",
  "league official",
  "federation official"
];

const TRUSTED_TYPE_SIGNALS = [
  "trusted",
  "verified media",
  "league data partner"
];

const PROVIDER_TYPE_SIGNALS = [
  "provider",
  "scoreboard",
  "data provider"
];

const AGGREGATOR_TYPE_SIGNALS = [
  "aggregator",
  "results aggregator",
  "livescore"
];

const KNOWN_PROVIDER_DOMAINS = [
  "espn.com",
  "soccerway.com",
  "flashscore.com",
  "fotmob.com",
  "sofascore.com",
  "worldfootball.net"
];

const KNOWN_AGGREGATOR_DOMAINS = [
  "livescore.com",
  "aiscore.com",
  "besoccer.com",
  "thefishy.co.uk"
];

const REJECTED_DOMAIN_SIGNALS = [
  "bet365",
  "1xbet",
  "stake.",
  "casino",
  "prediction",
  "tips",
  "odds",
  "betting",
  "freebets",
  "bonus",
  "telegram"
];

export function classifyFinalResultSource(input, options = {}) {
  const identity = sourceIdentity(input);
  const reasons = [];
  const warnings = [];

  const allowProviderDomains = new Set(options.allowProviderDomains || KNOWN_PROVIDER_DOMAINS);
  const allowAggregatorDomains = new Set(options.allowAggregatorDomains || KNOWN_AGGREGATOR_DOMAINS);

  if (!identity.sourceName && !identity.sourceUrl && !identity.sourceType) {
    return {
      ok: false,
      tier: "rejected",
      verdict: "rejected_source",
      reason: "missing_source_identity",
      confidence: 0,
      identity,
      reasons: [],
      warnings,
      canonicalWrites: 0
    };
  }

  const combined = [
    identity.normalizedName,
    identity.normalizedType,
    identity.normalizedUrl,
    identity.host
  ].filter(Boolean).join(" ");

  if (hasAny(combined, REJECTED_DOMAIN_SIGNALS)) {
    return {
      ok: false,
      tier: "rejected",
      verdict: "rejected_source",
      reason: "blocked_betting_or_prediction_source",
      confidence: 0,
      identity,
      reasons: ["blocked_source_signal"],
      warnings,
      canonicalWrites: 0
    };
  }

  let tier = "unknown";
  let confidence = 0.25;

  if (hasAny(identity.normalizedType, OFFICIAL_TYPE_SIGNALS)) {
    tier = "official";
    confidence = 0.95;
    reasons.push("official_type_signal");
  } else if (hasAny(identity.normalizedName, OFFICIAL_TYPE_SIGNALS)) {
    tier = "official";
    confidence = 0.9;
    reasons.push("official_name_signal");
  } else if (hasAny(identity.normalizedType, TRUSTED_TYPE_SIGNALS)) {
    tier = "trusted";
    confidence = 0.82;
    reasons.push("trusted_type_signal");
  } else if (hasAny(identity.normalizedType, PROVIDER_TYPE_SIGNALS)) {
    tier = "provider";
    confidence = 0.74;
    reasons.push("provider_type_signal");
  } else if (identity.host && hostMatches(identity.host, Array.from(allowProviderDomains))) {
    tier = "provider";
    confidence = 0.72;
    reasons.push("known_provider_domain");
  } else if (hasAny(identity.normalizedType, AGGREGATOR_TYPE_SIGNALS)) {
    tier = "aggregator";
    confidence = 0.58;
    reasons.push("aggregator_type_signal");
  } else if (identity.host && hostMatches(identity.host, Array.from(allowAggregatorDomains))) {
    tier = "aggregator";
    confidence = 0.55;
    reasons.push("known_aggregator_domain");
  } else {
    reasons.push("unknown_source");
    warnings.push("source_requires_review_before_trust");
  }

  if (tier === "provider") {
    warnings.push("provider_requires_independent_confirmation_or_official_evidence");
  }

  if (tier === "aggregator") {
    warnings.push("aggregator_cannot_verify_final_result_alone");
  }

  return {
    ok: tier !== "rejected",
    tier,
    verdict: tier === "unknown" ? "unknown_source" : "classified_source",
    reason: reasons[0] || null,
    confidence: Number(confidence.toFixed(3)),
    identity,
    reasons,
    warnings,
    canonicalWrites: 0,
    guarantees: {
      noFetch: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0
    }
  };
}

export function classifyFinalResultSources(inputs, options = {}) {
  const rows = Array.isArray(inputs) ? inputs : [];
  const results = rows.map((row, index) => ({
    index,
    ...classifyFinalResultSource(row, options)
  }));

  const byTier = {};
  const byVerdict = {};

  for (const row of results) {
    byTier[row.tier || "unknown"] = (byTier[row.tier || "unknown"] || 0) + 1;
    byVerdict[row.verdict || "unknown"] = (byVerdict[row.verdict || "unknown"] || 0) + 1;
  }

  return {
    ok: true,
    mode: "read_only_source_reliability_classification",
    canonicalWrites: 0,
    inputCount: rows.length,
    byTier,
    byVerdict,
    results
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runSelfTest() {
  const report = classifyFinalResultSources([
    {
      sourceType: "official",
      sourceKey: "home_official_site_candidate"
    },
    {
      sourceUrl: "https://www.espn.com/soccer/match/_/gameId/123",
      sourceName: "ESPN"
    },
    {
      sourceType: "aggregator",
      sourceName: "LiveScore"
    },
    {
      sourceUrl: "https://example-betting-tips.com/match-prediction",
      sourceName: "Betting Tips"
    },
    {
      sourceName: "Unknown Local Blog"
    }
  ]);

  assert(report.canonicalWrites === 0, "classifier must not write canonical data");
  assert(report.inputCount === 5, "input count mismatch");
  assert(report.byTier.official === 1, "expected 1 official source");
  assert(report.byTier.provider === 1, "expected 1 provider source");
  assert(report.byTier.aggregator === 1, "expected 1 aggregator source");
  assert(report.byTier.rejected === 1, "expected 1 rejected source");
  assert(report.byTier.unknown === 1, "expected 1 unknown source");

  const provider = report.results.find(row => row.tier === "provider");
  assert(provider.warnings.includes("provider_requires_independent_confirmation_or_official_evidence"), "provider warning missing");

  const aggregator = report.results.find(row => row.tier === "aggregator");
  assert(aggregator.warnings.includes("aggregator_cannot_verify_final_result_alone"), "aggregator warning missing");

  console.log(JSON.stringify({
    ok: true,
    selfTest: "source-reliability",
    canonicalWrites: report.canonicalWrites,
    byTier: report.byTier,
    byVerdict: report.byVerdict
  }, null, 2));
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
}
