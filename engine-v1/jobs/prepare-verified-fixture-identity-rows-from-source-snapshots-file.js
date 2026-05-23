import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? "" : String(value);
}

function clean(value) {
  return text(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function providerFromUrl(url) {
  const lower = text(url).toLowerCase();
  if (lower.includes("betexplorer.")) return "betexplorer";
  if (lower.includes("flashscore.")) return "flashscore";
  return "official_or_other";
}

function snapshotText(snapshot) {
  return text(snapshot?.http?.text || snapshot?.text || snapshot?.body || snapshot?.html || "");
}

function snapshotUrl(snapshot) {
  return text(snapshot?.resolvedUrl || snapshot?.url || snapshot?.finalUrl || snapshot?.sourceUrl || "");
}

function sourceSnapshotId(snapshot, sourceFile, index) {
  return `${path.basename(sourceFile)}#${index}:${text(snapshot.leagueSlug)}:${snapshotUrl(snapshot)}`;
}

function dateFromShort(dayKey, raw) {
  const m = text(raw).match(/(\d{1,2})\.(\d{1,2})\./);
  if (!m) return "";
  const year = text(dayKey).slice(0, 4);
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function addDays(dayKey, days) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeFrom(raw) {
  const m = text(raw).match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function dateFromBetExplorer(raw, dayKey, generatedAt) {
  const value = clean(raw);
  const explicit = dateFromShort(dayKey, value);
  if (explicit) return { localDate: explicit, dateConfidence: "explicit_dd_mm_in_source" };

  const generatedDate = text(generatedAt).slice(0, 10);
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(generatedDate) ? generatedDate : dayKey;

  if (/^today\b/i.test(value)) return { localDate: ref, dateConfidence: "relative_today_from_snapshot_generated_at" };
  if (/^tomorrow\b/i.test(value)) return { localDate: addDays(ref, 1), dateConfidence: "relative_tomorrow_from_snapshot_generated_at" };

  return { localDate: "", dateConfidence: "missing_or_ambiguous_source_date" };
}

function parseBetExplorer(snapshot, sourceFile, index, dayKey, generatedAt) {
  const html = snapshotText(snapshot);
  const rows = [];
  const trRegex = /<tr\b[\s\S]*?<\/tr>/gi;
  let currentDate = "";

  for (const tr of html.matchAll(trRegex)) {
    const rowHtml = tr[0];

    const dateMatch = rowHtml.match(/<td[^>]*class="[^"]*table-main__datetime[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (dateMatch) {
      const candidate = clean(dateMatch[1]);
      if (candidate) currentDate = candidate;
    }

    const linkMatch = rowHtml.match(/<a\s+href="([^"]+)"[^>]*class="[^"]*\bin-match\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const teams = [...linkMatch[2].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((m) => clean(m[1]))
      .filter(Boolean);

    if (teams.length < 2) continue;

    const rawKickoffText = currentDate || "";
    const localTime = timeFrom(rawKickoffText);
    const dateInfo = dateFromBetExplorer(rawKickoffText, dayKey, generatedAt);
    const href = clean(linkMatch[1]);
    const sourceMatchId = href.split("/").filter(Boolean).pop() || "";

    rows.push({
      leagueSlug: text(snapshot.leagueSlug),
      name: text(snapshot.name),
      country: text(snapshot.country),
      dayKey,
      provider: "betexplorer",
      sourceSnapshotId: sourceSnapshotId(snapshot, sourceFile, index),
      sourceUrl: snapshotUrl(snapshot),
      sourceMatchId,
      homeTeam: teams[0],
      awayTeam: teams[1],
      rawKickoffText,
      localDate: dateInfo.localDate,
      localTime,
      kickoffUtc: "",
      dateConfidence: dateInfo.dateConfidence,
      extractionMethod: "betexplorer_table_main_in_match",
      evidenceState: dateInfo.localDate && localTime ? "fixture_identity_candidate_prepared" : "fixture_identity_candidate_needs_date_review",
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  return rows;
}

function parseFlashscore(snapshot, sourceFile, index, dayKey) {
  const html = snapshotText(snapshot);
  const rows = [];
  const normalized = html
    .replace(/\\u00ac/g, "¬")
    .replace(/\\u00f7/g, "÷")
    .replace(/\\u002f/g, "/");

  const chunks = normalized.split(/(?:¬)?AA÷/).slice(1);

  for (const chunk of chunks) {
    const block = `AA÷${chunk.slice(0, 5000)}`;
    const sourceMatchId = (block.match(/AA÷([^¬]+)/) || [])[1] || "";
    const tsRaw = (block.match(/¬AD÷(\d{9,12})/) || [])[1] || "";
    const homeTeam = clean((block.match(/¬CX÷([^¬]+)/) || [])[1] || "");
    const awayTeam = clean((block.match(/¬AF÷([^¬]+)/) || [])[1] || "");

    if (!sourceMatchId || !homeTeam || !awayTeam) continue;

    let kickoffUtc = "";
    let localDate = "";
    let localTime = "";
    let dateConfidence = "missing_timestamp";

    if (tsRaw) {
      const d = new Date(Number(tsRaw) * 1000);
      if (Number.isFinite(d.getTime())) {
        kickoffUtc = d.toISOString();
        localDate = kickoffUtc.slice(0, 10);
        localTime = kickoffUtc.slice(11, 16);
        dateConfidence = "flashscore_epoch_timestamp";
      }
    }

    rows.push({
      leagueSlug: text(snapshot.leagueSlug),
      name: text(snapshot.name),
      country: text(snapshot.country),
      dayKey,
      provider: "flashscore",
      sourceSnapshotId: sourceSnapshotId(snapshot, sourceFile, index),
      sourceUrl: snapshotUrl(snapshot),
      sourceMatchId,
      homeTeam,
      awayTeam,
      rawKickoffText: tsRaw,
      localDate,
      localTime,
      kickoffUtc,
      dateConfidence,
      extractionMethod: "flashscore_livesport_encoded_event_block",
      evidenceState: kickoffUtc ? "fixture_identity_candidate_prepared" : "fixture_identity_candidate_needs_date_review",
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  return rows;
}

function parseOfficialOrOther(snapshot, sourceFile, index, dayKey) {
  const body = clean(snapshotText(snapshot));
  const rows = [];
  const regex = /([A-ZÀ-ÿ][A-Za-zÀ-ÿ0-9 .'’&()/-]{2,80})\s+(?:v|vs|-)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ0-9 .'’&()/-]{2,80})/gi;

  for (const m of body.matchAll(regex)) {
    const homeTeam = clean(m[1]);
    const awayTeam = clean(m[2]);
    if (!homeTeam || !awayTeam) continue;

    rows.push({
      leagueSlug: text(snapshot.leagueSlug),
      name: text(snapshot.name),
      country: text(snapshot.country),
      dayKey,
      provider: providerFromUrl(snapshotUrl(snapshot)),
      sourceSnapshotId: sourceSnapshotId(snapshot, sourceFile, index),
      sourceUrl: snapshotUrl(snapshot),
      sourceMatchId: "",
      homeTeam,
      awayTeam,
      rawKickoffText: "",
      localDate: "",
      localTime: "",
      kickoffUtc: "",
      dateConfidence: "official_generic_needs_date_review",
      extractionMethod: "official_generic_team_vs_team_regex",
      evidenceState: "fixture_identity_candidate_needs_date_review",
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  return rows.slice(0, 50);
}

function identitySlugsFromProposal(filePath) {
  if (!filePath) return new Set();
  const json = readJson(filePath);
  return new Set(
    asArray(json.proposals)
      .filter((row) => text(row.blockedReason) === "missing_match_level_fixture_identity_rows")
      .map((row) => text(row.leagueSlug))
      .filter(Boolean)
  );
}

function dedupe(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.leagueSlug,
      row.sourceMatchId,
      row.homeTeam.toLowerCase(),
      row.awayTeam.toLowerCase(),
      row.localDate,
      row.localTime
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const dayKey = text(args.date || args.dayKey);
  const output = text(args.output);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error("--date YYYY-MM-DD is required");
  if (!output) throw new Error("--output is required");

  const inputFiles = text(args.inputs || args.input).split(";").map((v) => v.trim()).filter(Boolean);
  if (inputFiles.length === 0) throw new Error("--inputs is required; separate files with semicolon");

  const identitySlugs = identitySlugsFromProposal(text(args.proposals || args.proposal));
  const snapshots = [];
  let generatedAt = "";

  for (const file of inputFiles) {
    if (!fs.existsSync(file)) throw new Error(`Missing input snapshot file: ${file}`);
    const json = readJson(file);
    if (!generatedAt && json.generatedAt) generatedAt = text(json.generatedAt);

    asArray(json.fetchedSourceSnapshots).forEach((snapshot, index) => {
      const slug = text(snapshot.leagueSlug);
      if (identitySlugs.size > 0 && !identitySlugs.has(slug)) return;
      snapshots.push({ file, index, snapshot });
    });
  }

  const extracted = [];
  const rejectedSnapshots = [];

  for (const item of snapshots) {
    const provider = providerFromUrl(snapshotUrl(item.snapshot));
    let rows = [];

    if (provider === "betexplorer") rows = parseBetExplorer(item.snapshot, item.file, item.index, dayKey, generatedAt);
    else if (provider === "flashscore") rows = parseFlashscore(item.snapshot, item.file, item.index, dayKey);
    else rows = parseOfficialOrOther(item.snapshot, item.file, item.index, dayKey);

    extracted.push(...rows);

    if (rows.length === 0) {
      rejectedSnapshots.push({
        leagueSlug: text(item.snapshot.leagueSlug),
        name: text(item.snapshot.name),
        provider,
        sourceUrl: snapshotUrl(item.snapshot),
        reason: "no_match_level_fixture_identity_rows_extracted",
        sourceSnapshotId: sourceSnapshotId(item.snapshot, item.file, item.index)
      });
    }
  }

  const deduped = dedupe(extracted);

  const targetDayRows = [];
  const needsReview = [];

  for (const row of deduped) {
    if (row.evidenceState === "fixture_identity_candidate_prepared" && row.localDate === dayKey) {
      targetDayRows.push(row);
      continue;
    }

    if (row.evidenceState === "fixture_identity_candidate_prepared" && row.localDate && row.localDate !== dayKey) {
      needsReview.push({
        ...row,
        evidenceState: "fixture_identity_candidate_outside_target_date",
        blockedReason: "local_date_does_not_match_requested_day"
      });
      continue;
    }

    needsReview.push(row);
  }

  const prepared = targetDayRows;

  const report = {
    ok: true,
    job: "prepare-verified-fixture-identity-rows-from-source-snapshots-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_extraction_diagnostic",
    sourceInput: {
      dayKey,
      inputFiles,
      proposalPath: text(args.proposals || args.proposal),
      filteredIdentitySlugCount: identitySlugs.size
    },
    summary: {
      snapshotCount: snapshots.length,
      extractedCandidateCount: extracted.length,
      dedupedCandidateCount: deduped.length,
      preparedIdentityCandidateCount: prepared.length,
      needsReviewCandidateCount: needsReview.length,
      rejectedSnapshotCount: rejectedSnapshots.length,
      uniqueLeagueSlugCount: new Set(deduped.map((row) => row.leagueSlug)).size,
      preparedUniqueLeagueSlugCount: new Set(prepared.map((row) => row.leagueSlug)).size
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    preparedFixtureIdentityRows: prepared,
    needsReviewFixtureIdentityRows: needsReview,
    rejectedSnapshots,
    notes: [
      "Diagnostic only: this file does not write canonical fixtures.",
      "BetExplorer parser extracts table-main datetime and in-match team spans.",
      "Flashscore parser extracts Livesport encoded event blocks when embedded in HTML.",
      "Official/other parser is conservative and marks rows for review."
    ]
  };

  writeJson(output, report);
  console.log(JSON.stringify({ ok: true, output, summary: report.summary, guarantees: report.guarantees }, null, 2));
}

main();