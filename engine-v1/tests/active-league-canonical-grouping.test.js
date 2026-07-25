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

test("active panel uses canonical league slug as group identity", () => {
  assert.ok(
    source.includes(
      "const leagueKey = String(\n" +
      "        m.leagueSlug ||\n" +
      "        m.leagueName ||\n" +
      "        \"Other\""
    )
  );

  assert.ok(
    !source.includes(
      "const leagueKey = m.leagueName || m.leagueSlug || \"Other\";"
    )
  );
});

test("active panel preserves a human league display name", () => {
  assert.ok(
    source.includes(
      "m.canonicalLeagueName ||\n" +
      "        m.leagueDisplayName ||\n" +
      "        m.leagueName ||\n" +
      "        m.leagueSlug"
    )
  );

  assert.ok(
    !source.includes(
      "leagues.set(leagueKey, { name: leagueKey"
    )
  );
});

test("two provider labels for col.2 produce one group", () => {
  const matches = [
    {
      leagueSlug: "col.2",
      leagueName: "Primera B - Clausura"
    },
    {
      leagueSlug: "col.2",
      leagueName: "Colombia Primera B"
    }
  ];

  const groups = new Map();

  for (const match of matches) {
    const key = String(
      match.leagueSlug ||
      match.leagueName ||
      "Other"
    )
      .trim()
      .toLowerCase();

    const name = String(
      match.canonicalLeagueName ||
      match.leagueDisplayName ||
      match.leagueName ||
      match.leagueSlug ||
      "Other"
    ).trim();

    if (!groups.has(key)) {
      groups.set(key, {
        name,
        rows: []
      });
    } else if (
      name.length >
      groups.get(key).name.length
    ) {
      groups.get(key).name = name;
    }

    groups.get(key).rows.push(match);
  }

  assert.equal(groups.size, 1);
  assert.ok(groups.has("col.2"));
  assert.equal(groups.get("col.2").rows.length, 2);
  assert.equal(
    groups.get("col.2").name,
    "Primera B - Clausura"
  );
});
