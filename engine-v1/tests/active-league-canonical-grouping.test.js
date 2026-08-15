import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs
  .readFileSync(
    new URL(
      "../../assets/js/ui/active-leagues-panel.js",
      import.meta.url
    ),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityKey(match) {
  const explicit =
    match.canonicalCompetitionKey ||
    match.competitionKey ||
    match.canonicalCompetitionId ||
    match.competitionId ||
    match.tournamentId ||
    match.leagueId ||
    "";

  if (String(explicit).trim()) {
    return "id:" + normalize(explicit);
  }

  const realName =
    match.canonicalLeagueName ||
    match.leagueDisplayName ||
    match.leagueName ||
    match.leagueSlug ||
    "Other";

  if (
    match.competitionIdentityMismatch === true &&
    realName
  ) {
    return "name:" + normalize(realName);
  }

  const slug = normalize(match.leagueSlug);

  if (slug) {
    return "slug:" + slug;
  }

  return "name:" + normalize(realName);
}

test("resolved provider labels retain one canonical-slug group", () => {
  const rows = [
    {
      leagueSlug: "col.2",
      leagueName: "Primera B - Clausura",
      competitionIdentityMismatch: false
    },
    {
      leagueSlug: "col.2",
      leagueName: "Colombia Primera B",
      competitionIdentityMismatch: false
    }
  ];

  assert.deepEqual(
    [...new Set(rows.map(identityKey))],
    ["slug:col 2"]
  );

  assert.match(
    source,
    /if \(slug\) \{\s+return "slug:" \+ slug;/
  );
});

test("proven broad eng.1 mismatch separates real competitions", () => {
  const rows = [
    {
      leagueSlug: "eng.1",
      leagueName: "Isthmian League Premier Division",
      competitionIdentityMismatch: true
    },
    {
      leagueSlug: "eng.1",
      leagueName: "Southern League Premier Central",
      competitionIdentityMismatch: true
    },
    {
      leagueSlug: "eng.1",
      leagueName: "Southern League Premier South",
      competitionIdentityMismatch: true
    }
  ];

  const keys = rows.map(identityKey);

  assert.equal(new Set(keys).size, 3);

  assert.deepEqual(
    keys,
    [
      "name:isthmian league premier division",
      "name:southern league premier central",
      "name:southern league premier south"
    ]
  );
});

test("human competition display-name resolution remains present", () => {
  assert.match(
    source,
    /function leagueNameOf\(m\)/
  );

  assert.match(
    source,
    /m\?\.canonicalLeagueName \|\|/
  );

  assert.match(
    source,
    /m\?\.leagueDisplayName \|\|/
  );

  assert.match(
    source,
    /m\?\.leagueName \|\|/
  );
});

test("explicit competition identity outranks slug and source label", () => {
  const a = {
    canonicalCompetitionKey: "colombia-primera-b",
    leagueSlug: "col.2",
    leagueName: "Primera B - Clausura"
  };

  const b = {
    canonicalCompetitionKey: "colombia-primera-b",
    leagueSlug: "wrong.partition",
    leagueName: "Colombia Primera B"
  };

  assert.equal(identityKey(a),identityKey(b));
});