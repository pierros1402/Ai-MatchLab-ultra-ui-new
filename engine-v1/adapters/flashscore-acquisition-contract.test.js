import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFlashscoreCanonicalAdmission,
  flashscoreOffsetsForRequestedDay,
  flashscoreRowMatchesRequestedAthensDay,
  resolveFlashscoreAcquisitionIdentity
} from "./flashscore-acquisition-contract.js";

function row(leaguePath, leagueName = "") {
  return {
    leaguePath,
    leagueName,
    country: "England",
    kickoffUtc: "2026-08-15T14:00:00.000Z"
  };
}

test("admits exact England tier 3-5 paths", () => {
  assert.equal(
    resolveFlashscoreAcquisitionIdentity(row("/football/england/league-one/")).slug,
    "eng.3"
  );
  assert.equal(
    resolveFlashscoreAcquisitionIdentity(row("/football/england/league-two/")).slug,
    "eng.4"
  );
  assert.equal(
    resolveFlashscoreAcquisitionIdentity(row("/football/england/national-league/")).slug,
    "eng.5"
  );
});

test("admits exact Germany tier 3 path", () => {
  const result = resolveFlashscoreAcquisitionIdentity({
    leaguePath: "/football/germany/3-liga/",
    leagueName: "3. Liga",
    country: "Germany"
  });

  assert.equal(result.ok, true);
  assert.equal(result.slug, "ger.3");
  assert.equal(result.identityMode, "exact_path");
});

test("rejects National League North and South instead of fuzzily mapping them to eng.5", () => {
  for (const [leaguePath, leagueName] of [
    ["/football/england/national-league-north/", "National League North"],
    ["/football/england/national-league-south/", "National League South"]
  ]) {
    const result = resolveFlashscoreAcquisitionIdentity(row(leaguePath, leagueName));
    assert.equal(result.ok, false);
    assert.equal(result.slug, null);
    assert.equal(result.reason, "unadmitted_provider_competition");
  }
});

test("rejects Isthmian and Southern competitions instead of fuzzily mapping them to eng.1", () => {
  for (const [leaguePath, leagueName] of [
    ["/football/england/isthmian-league-premier-division/", "Isthmian League Premier Division"],
    ["/football/england/southern-league-premier-division-central/", "Southern League Premier Division Central"],
    ["/football/england/southern-league-premier-division-south/", "Southern League Premier Division South"]
  ]) {
    const result = resolveFlashscoreAcquisitionIdentity(row(leaguePath, leagueName));
    assert.equal(result.ok, false);
    assert.equal(result.slug, null);
    assert.equal(result.reason, "unadmitted_provider_competition");
  }
});

test("does not default an unknown provider competition to the requested slug", () => {
  const result = evaluateFlashscoreCanonicalAdmission({
    row: row("/football/england/some-unknown-premier-league/", "Premier League"),
    requestedSlug: "eng.1",
    normalizedSlug: "eng.1"
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unadmitted_provider_competition");
});

test("requires provider identity to equal both requested and normalized slugs", () => {
  const fixture = row("/football/england/national-league/", "National League");

  assert.equal(
    evaluateFlashscoreCanonicalAdmission({
      row: fixture,
      requestedSlug: "eng.5",
      normalizedSlug: "eng.5"
    }).ok,
    true
  );

  assert.equal(
    evaluateFlashscoreCanonicalAdmission({
      row: fixture,
      requestedSlug: "eng.1",
      normalizedSlug: "eng.5"
    }).reason,
    "provider_competition_requested_slug_mismatch"
  );

  assert.equal(
    evaluateFlashscoreCanonicalAdmission({
      row: fixture,
      requestedSlug: "eng.5",
      normalizedSlug: "eng.1"
    }).reason,
    "provider_competition_normalized_slug_mismatch"
  );
});

test("binds Flashscore offsets to the requested calendar day", () => {
  assert.deepEqual(
    flashscoreOffsetsForRequestedDay("2026-08-16", "2026-08-16"),
    [-1, 0, 1]
  );
  assert.deepEqual(
    flashscoreOffsetsForRequestedDay("2026-08-27", "2026-08-16"),
    [10, 11, 12]
  );
  assert.deepEqual(
    flashscoreOffsetsForRequestedDay("2026-08-15", "2026-08-16"),
    [-2, -1, 0]
  );
});

test("filters provider rows by exact Athens kickoff day", () => {
  assert.equal(
    flashscoreRowMatchesRequestedAthensDay(
      { kickoffUtc: "2026-08-15T20:00:00.000Z" },
      "2026-08-15"
    ),
    true
  );

  // 21:30Z is 00:30 in Athens during August and belongs to the next day.
  assert.equal(
    flashscoreRowMatchesRequestedAthensDay(
      { kickoffUtc: "2026-08-15T21:30:00.000Z" },
      "2026-08-15"
    ),
    false
  );
  assert.equal(
    flashscoreRowMatchesRequestedAthensDay(
      { kickoffUtc: "2026-08-15T21:30:00.000Z" },
      "2026-08-16"
    ),
    true
  );
});
