import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const salvagePath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-${today}`, `football-truth-global-batch001-official-html-custom-salvage-${today}.json`);
const salvageRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-${today}`, `football-truth-global-batch001-official-html-custom-salvage-rows-${today}.jsonl`);
const salvageVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-verification-${today}`, `football-truth-global-batch001-official-html-custom-salvage-verification-${today}.json`);

const htmlPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-candidates-extraction-probe-${today}`, `football-truth-global-batch001-official-html-candidates-extraction-probe-${today}.json`);
const htmlRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-candidates-extraction-probe-${today}`, `football-truth-global-batch001-official-html-candidates-extraction-probe-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-proof-shape-season-league-review-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-proof-shape-season-league-review-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function norm(value) { return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim(); }
function titleOf(html) { const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i); return stripHtml(m?.[1] || "").slice(0, 180); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

function seasonMentions(text) {
  const normalized = stripHtml(text);
  const out = [];
  for (const m of normalized.matchAll(/\b20\d{2}\s*[\/\-–]\s*(?:\d{2}|20\d{2})\b/g)) out.push(m[0].replace(/\s+/g, ""));
  for (const m of normalized.matchAll(/\b(?:season|saison|sezona|stagione|competizione|championship|league)\s*(?:20\d{2}\s*[\/\-–]\s*(?:\d{2}|20\d{2})|20\d{2})\b/gi)) out.push(m[0].replace(/\s+/g, " "));
  for (const m of normalized.matchAll(/\b20\d{2}\b/g)) out.push(m[0]);
  return uniq(out).slice(0, 20);
}

function targetTerms(row) {
  const terms = [row.slug];
  if (row.displayName) terms.push(row.displayName);
  if (row.slug === "ita.2") terms.push("Serie B", "Serie BKT", "Lega B");
  if (row.slug === "bih.1") terms.push("Bosnia", "Premijer Liga", "NFSBiH", "FK BORAC", "ZRINJSKI");
  if (row.slug === "mne.1") terms.push("Montenegro", "Prva CFL", "FSCG", "Sutjeska", "Mornar");
  if (row.slug === "aus.1") terms.push("A-League", "A-League Men", "Newcastle Jets", "Auckland FC");
  if (row.slug === "aus.2") terms.push("A-League", "A-League Women", "Newcastle Jets", "Auckland FC");
  if (row.slug === "ned.2") terms.push("Keuken Kampioen Divisie", "Jong AZ", "Jong Ajax");
  return uniq(terms);
}

function termHits(text, terms) {
  const n = norm(text);
  return uniq(terms.filter(term => n.includes(norm(term))));
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +proof-shape-season-league-review)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

function classify(target, fetchedText, finalUrl, fetchStatus) {
  const text = `${finalUrl} ${fetchedText}`;
  const seasons = seasonMentions(text);
  const hits = termHits(text, targetTerms(target));
  const hasSeasonEvidence = seasons.length > 0;
  const hasLeagueEvidence = hits.length >= 2;
  const isCollision = target.hasSameRowsCollision === true;
  const isZeroPlayed = target.sourceLane === "zero_played";

  if (isZeroPlayed) {
    return {
      reviewStatus: "zero_played_start_date_lane_required",
      reviewReason: "zero-played table cannot become countable without governed start date",
      hasSeasonEvidence,
      hasLeagueEvidence,
      seasonMentions: seasons,
      identityTermHits: hits
    };
  }

  if (isCollision) {
    return {
      reviewStatus: "league_identity_collision_review_required",
      reviewReason: "same parsed rows appear under multiple slugs; cannot count until league identity is resolved",
      hasSeasonEvidence,
      hasLeagueEvidence,
      seasonMentions: seasons,
      identityTermHits: hits
    };
  }

  if ((fetchStatus ?? 0) < 200 || (fetchStatus ?? 0) >= 400) {
    return {
      reviewStatus: "source_fetch_review_required",
      reviewReason: "source fetch did not return 2xx/3xx",
      hasSeasonEvidence,
      hasLeagueEvidence,
      seasonMentions: seasons,
      identityTermHits: hits
    };
  }

  if (hasSeasonEvidence && hasLeagueEvidence) {
    return {
      reviewStatus: "season_league_review_candidate_after_explicit_approval",
      reviewReason: "proof shape passed and source page contains season/league identity evidence; still not canonical until explicit approval",
      hasSeasonEvidence,
      hasLeagueEvidence,
      seasonMentions: seasons,
      identityTermHits: hits
    };
  }

  return {
    reviewStatus: "season_or_league_identity_evidence_insufficient",
    reviewReason: "proof shape passed but season/league evidence is not strong enough for candidate write",
    hasSeasonEvidence,
    hasLeagueEvidence,
    seasonMentions: seasons,
    identityTermHits: hits
  };
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const salvage = JSON.parse(await fs.readFile(salvagePath, "utf8"));
const salvageRows = parseJsonl(await fs.readFile(salvageRowsPath, "utf8"));
const salvageVerification = JSON.parse(await fs.readFile(salvageVerificationPath, "utf8"));
const html = JSON.parse(await fs.readFile(htmlPath, "utf8"));
const htmlRows = parseJsonl(await fs.readFile(htmlRowsPath, "utf8"));

if (salvage.status !== "passed") blocks.push("salvage_not_passed");
if (salvageVerification.status !== "passed") blocks.push("salvage_verification_not_passed");
if (html.status !== "passed") blocks.push("html_probe_not_passed");

const nonCollisionProof = salvageRows
  .filter(row => row.customSalvageStatus === "custom_salvage_proof_shape_passed_nonzero_needs_season_league_review")
  .map(row => ({ ...row, sourceLane: "nonzero_proof_shape" }));

const collisionProof = salvageRows
  .filter(row => row.customSalvageStatus === "custom_salvage_proof_shape_passed_nonzero_with_collision_needs_league_identity_review")
  .map(row => ({ ...row, sourceLane: "nonzero_collision_proof_shape" }));

const zeroPlayed = htmlRows
  .filter(row => row.extractionProbeStatus === "proof_shape_passed_zero_played_table_needs_start_date_lane")
  .map(row => ({
    slug: row.slug,
    displayName: row.displayName,
    sourceFinalUrl: row.finalUrl,
    sourceTitle: row.title,
    customParsedStandingRowCount: row.extractedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row.arithmeticFailedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    parsedRows: row.standingsRows,
    sourceLane: "zero_played",
    hasSameRowsCollision: false,
    collisionGroupSlugs: [row.slug]
  }));

if (nonCollisionProof.length !== 3) blocks.push("non_collision_proof_count_not_3");
if (collisionProof.length !== 2) blocks.push("collision_proof_count_not_2");
if (zeroPlayed.length !== 1) blocks.push("zero_played_count_not_1");

const targets = [...nonCollisionProof, ...collisionProof, ...zeroPlayed];
const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let i = 0;
  for (const target of targets) {
    i += 1;
    const url = target.sourceFinalUrl;
    console.log(`[${i}/${targets.length}] ${target.slug} ${url}`);

    const fetched = await fetchWithTimeout(url);
    fetchCount += 1;

    const finalUrl = fetched.response?.url || url;
    const fetchedTitle = titleOf(fetched.text || "");
    const review = classify(target, `${fetchedTitle} ${fetched.text || ""}`, finalUrl, fetched.response?.status ?? null);

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      sourceLane: target.sourceLane,
      sourceFinalUrl: url,
      finalUrl,
      finalHost: hostOf(finalUrl),
      fetchStatus: fetched.response?.status ?? null,
      title: fetchedTitle || target.sourceTitle || "",
      bodyLength: (fetched.text || "").length,
      bodySha256: fetched.text ? shaText(fetched.text) : null,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      customParsedStandingRowCount: target.customParsedStandingRowCount,
      arithmeticPassedRowCount: target.arithmeticPassedRowCount,
      arithmeticFailedRowCount: target.arithmeticFailedRowCount,
      duplicateTeamNameCount: target.duplicateTeamNameCount,
      minPlayed: target.minPlayed,
      maxPlayed: target.maxPlayed,
      hasSameRowsCollision: target.hasSameRowsCollision === true,
      collisionGroupSlugs: target.collisionGroupSlugs || [target.slug],
      reviewStatus: review.reviewStatus,
      reviewReason: review.reviewReason,
      hasSeasonEvidence: review.hasSeasonEvidence,
      hasLeagueEvidence: review.hasLeagueEvidence,
      seasonMentions: review.seasonMentions,
      identityTermHits: review.identityTermHits,
      sampleParsedRows: (target.parsedRows || []).slice(0, 6),
      acceptedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const reviewStatusCounts = rows.reduce((acc, row) => {
  acc[row.reviewStatus] = (acc[row.reviewStatus] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_batch001_proof_shape_season_league_review",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputs: {
    salvagePath: rel(salvagePath),
    salvageRowsPath: rel(salvageRowsPath),
    salvageVerificationPath: rel(salvageVerificationPath),
    htmlPath: rel(htmlPath),
    htmlRowsPath: rel(htmlRowsPath)
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: targets.length,
    attemptedFetchCount: fetchCount,
    reviewStatusCounts,
    candidateAfterExplicitApprovalSlugs: rows.filter(row => row.reviewStatus === "season_league_review_candidate_after_explicit_approval").map(row => row.slug),
    seasonOrLeagueInsufficientSlugs: rows.filter(row => row.reviewStatus === "season_or_league_identity_evidence_insufficient").map(row => row.slug),
    collisionReviewRequiredSlugs: rows.filter(row => row.reviewStatus === "league_identity_collision_review_required").map(row => row.slug),
    zeroPlayedStartDateLaneRequiredSlugs: rows.filter(row => row.reviewStatus === "zero_played_start_date_lane_required").map(row => row.slug),
    sourceFetchReviewRequiredSlugs: rows.filter(row => row.reviewStatus === "source_fetch_review_required").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "candidateAfterExplicitApprovalSlugs require explicit approval before review-only candidate write; zero-played needs governed start-date evidence; collisions need league identity resolution"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: rows.map(row => ({
    slug: row.slug,
    sourceLane: row.sourceLane,
    reviewStatus: row.reviewStatus,
    finalUrl: row.finalUrl,
    fetchStatus: row.fetchStatus,
    title: row.title,
    customParsedStandingRowCount: row.customParsedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    hasSameRowsCollision: row.hasSameRowsCollision,
    collisionGroupSlugs: row.collisionGroupSlugs,
    hasSeasonEvidence: row.hasSeasonEvidence,
    hasLeagueEvidence: row.hasLeagueEvidence,
    seasonMentions: row.seasonMentions,
    identityTermHits: row.identityTermHits
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
