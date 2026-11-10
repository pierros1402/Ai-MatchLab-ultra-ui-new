import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildHistoryDayFromTruth, persistVerifiedHistoryBuild } from "../jobs/append-finalized-day-to-history.js";
import { promoteVerifiedGeneration, sha256, recordReviewedHistoryLink } from "../storage/evidence-bound-history-store.js";
import { fingerprint } from "../core/season-closure-contract.js";
import { verifyReadinessEvidence } from "../../assets/js/live/value-readiness-evidence.js";

async function workspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), "matchlab-next-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, journalRoot: path.join(root, "journal"), historyPath: path.join(root, "history.json") };
}
const event = (id, dayKey = "2026-11-10") => ({
  id, dayKey, leagueSlug: "test.1", season: "2026-2027", homeTeam: "Home", awayTeam: "Away",
  kickoff_ms: Date.parse(dayKey + "T18:00Z"), status: "FT", scoreHome: 2, scoreAway: 1, rebuiltAt: 0
});
const day = (rows, dayKey = "2026-11-10") => ({ ok: true, dayKey, season: "2026-2027", rows, errors: [] });
const exists = async p => readFile(p).then(() => true, () => false);

test("real October conflict holds the day but journals each unambiguous accepted FT", async t => {
  const dirs = await workspace(t);
  const build = buildHistoryDayFromTruth("2026-10-11");
  assert.equal(build.ok, false);
  assert.equal(build.acceptedRows, 399);
  const result = await persistVerifiedHistoryBuild(build, dirs);
  assert.equal(result.ok, false);
  assert.equal(result.recovery.journaled.length, 399);
  assert.equal(await exists(dirs.historyPath), false);
  const id = "cid_espcopadelrey_atleticounionguimar_sportinghortaleza_20261011";
  const entry = result.recovery.journaled.find(row => row.id === id);
  const fact = JSON.parse(await readFile(path.join(dirs.journalRoot, "facts", entry.revision + ".json")));
  assert.equal(fact.fact.status, "AET");
  assert.equal((await persistVerifiedHistoryBuild(build, dirs)).recovery.quarantineRevision, result.recovery.quarantineRevision);
});

test("an ambiguous identity is quarantined individually and unrelated facts survive", async t => {
  const dirs = await workspace(t);
  const result = await persistVerifiedHistoryBuild({ ...day([event("ambiguous"), event("valid")]),
    ok: false, reason: "history_truth_parity_failed", errors: [{ matchId: "ambiguous", reason: "duplicate" }] }, dirs);
  assert.deepEqual(result.recovery.journaled.map(x => x.id), ["valid"]);
  assert.ok(result.recovery.quarantineRevision);
  assert.equal(await exists(dirs.historyPath), false);
});

test("an exact retry never rewrites history and a missing or revised prior FT requires review", async t => {
  const dirs = await workspace(t);
  const first = day([event("a"), event("b")]);
  assert.equal((await persistVerifiedHistoryBuild(first, dirs)).rowsWritten, 2);
  const original = await readFile(dirs.historyPath);
  assert.equal((await persistVerifiedHistoryBuild(day([{ ...event("a"), rebuiltAt: 100 }, event("b")]), dirs)).unchanged, true);
  assert.equal((await persistVerifiedHistoryBuild(day([event("a")]), dirs)).reason, "history_review_required");
  assert.equal((await persistVerifiedHistoryBuild(day([{ ...event("a"), scoreHome: 0 }, event("b")]), dirs)).reason, "history_review_required");
  assert.deepEqual(await readFile(dirs.historyPath), original);
});

test("damaged bytes and concurrent owner preserve history", async t => {
  const dirs = await workspace(t);
  await writeFile(dirs.historyPath, "{incomplete");
  assert.equal((await persistVerifiedHistoryBuild(day([event("a")]), dirs)).reason, "history_store_unreadable");
  await mkdir(dirs.historyPath + ".lock");
  assert.equal((await persistVerifiedHistoryBuild(day([event("b")]), dirs)).reason, "artifact_writer_busy");
  assert.equal(await readFile(dirs.historyPath, "utf8"), "{incomplete");
});

test("reviewed reschedule creates a link and leaves both immutable facts intact", async t => {
  const dirs = await workspace(t);
  const before = await persistVerifiedHistoryBuild(day([event("a")]), dirs);
  const after = await persistVerifiedHistoryBuild(day([event("b", "2026-11-11")], "2026-11-11"), dirs);
  const decision = { before: before.recovery.journaled[0].revision, after: after.recovery.journaled[0].revision,
    kind: "MOVED_DATE", officialId: "test:official-1", reviewId: "review-1", authoritySha256: "a".repeat(64) };
  const revision = await recordReviewedHistoryLink(dirs.journalRoot, decision);
  assert.equal(await recordReviewedHistoryLink(dirs.journalRoot, decision), revision);
  await assert.rejects(recordReviewedHistoryLink(dirs.journalRoot, { ...decision, reviewId: "" }));
  assert.equal((await readdir(path.join(dirs.journalRoot, "facts"))).length, 2);
});

test("publication checks bytes, completeness, contention, stale base and exact retry", async t => {
  const { root } = await workspace(t);
  const pointer = path.join(root, "published.json");
  const artifacts = { "snapshot.json": Buffer.from("test") };
  const registryBinding = { fingerprint: "a".repeat(64), publicReleaseAllowed: true };
  const manifest = { registryBinding, day: "2026-11-10", files: { "snapshot.json": sha256(artifacts["snapshot.json"]) } };
  const certification = { verdict: "VERIFIED_READBACK", registryBinding, artifactSetHash: fingerprint(manifest.files) };
  const input = { pointer, expected: null, manifest, artifacts, certification };
  assert.equal((await promoteVerifiedGeneration({ ...input, certification: { verdict: "HOLD" } })).ok, false);
  assert.equal((await promoteVerifiedGeneration({ ...input, artifacts: { "snapshot.json": Buffer.from("altered") } })).ok, false);
  assert.equal((await promoteVerifiedGeneration(input)).changed, true);
  assert.equal((await promoteVerifiedGeneration(input)).changed, false);
  assert.equal((await promoteVerifiedGeneration({ ...input, manifest: { ...manifest, day: "2026-11-11" } })).reason,
    "stale_generation_base");
  await mkdir(pointer + ".lock");
  assert.equal((await promoteVerifiedGeneration(input)).reason, "artifact_writer_busy");
});

test("real readiness evidence retains 30 canonical IDs and rejects tamper, wrong dates and fabricated rows", async () => {
  const report = JSON.parse(await readFile(new URL("../../data/value-data-readiness/2026-11-10.json", import.meta.url)));
  const summary = { ...report.summary, checkedAt: report.generatedAt };
  const envelope = rows => {
    const json = JSON.stringify({ ...report, rows });
    return { schema: "ai-matchlab.value-readiness-evidence.v1", date: report.date,
      fixtureUniverseHash: report.fixtureUniverse.hash, sha256: sha256(json), json };
  };
  const valid = envelope(report.rows);
  const verified = await verifyReadinessEvidence(valid, report.date, summary);
  assert.equal(verified.rows.length, 30);
  assert.equal(verified.counts.insufficient, 13);
  assert.equal(verified.dimensions.officialSeasonCompleteness, "UNVERIFIED");
  assert.ok(verified.rows.some(row => row.canonicalId.includes("u21")));
  assert.equal(await verifyReadinessEvidence(valid, "2026-11-11", summary), null);
  assert.equal(await verifyReadinessEvidence({ ...valid, json: valid.json + " " }, report.date, summary), null);
  assert.equal(await verifyReadinessEvidence(envelope([...report.rows.slice(1), report.rows[1]]), report.date, summary), null);
});

test("pinned July and November builds keep acceptance separate from local projection", async t => {
  const july = await workspace(t);
  const julyBuild = buildHistoryDayFromTruth("2026-07-31");
  assert.equal(julyBuild.errors.length, 101);
  const held = await persistVerifiedHistoryBuild(julyBuild, july);
  assert.equal(held.recovery.journaled.length, 1);
  assert.equal(await exists(july.historyPath), false);
  const november = await workspace(t);
  const novBuild = buildHistoryDayFromTruth("2026-11-10");
  assert.equal(novBuild.ok, true);
  const local = await persistVerifiedHistoryBuild(novBuild, november);
  assert.equal(local.recovery.journaled.length, 3);
  assert.equal(local.rowsWritten, 3);
  assert.equal((await persistVerifiedHistoryBuild(novBuild, november)).unchanged, true);
  assert.equal(JSON.parse(await readFile(november.historyPath)).days[0].rows.length, 3);
});
