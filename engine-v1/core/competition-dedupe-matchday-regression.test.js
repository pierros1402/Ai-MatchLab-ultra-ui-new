import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import {
  teamNamesMatch
} from "./team-identity.js";

import {
  dedupeLeagueDayFixtures
} from "./fixture-dedup.js";

import {
  applyTrustedLeaguePresentation
} from "./league-display-identity.js";

test("Oxford Utd / MK Dons cross-provider duplicate collapses", () => {
  assert.equal(
    teamNamesMatch("Oxford Utd", "Oxford United"),
    true
  );

  assert.equal(
    teamNamesMatch("MK Dons", "Milton Keynes Dons"),
    true
  );

  const rows = [
    {
      canonicalId: "cid_eng3_oxfordutd_mkdons_20260815",
      matchId: "cid_eng3_oxfordutd_mkdons_20260815",
      source: "flashscore",
      sourceId: "06GYPyAt",
      leagueSlug: "eng.3",
      leagueName: "League One",
      dayKey: "2026-08-15",
      kickoffUtc: "2026-08-15T11:30:00.000Z",
      homeTeam: "Oxford Utd",
      awayTeam: "MK Dons",
      status: "FT",
      rawStatus: "STATUS_FINAL",
      scoreHome: 2,
      scoreAway: 2
    },
    {
      canonicalId:
        "cid_eng3_oxfordunited_miltonkeynesdons_20260815",
      matchId:
        "cid_eng3_oxfordunited_miltonkeynesdons_20260815",
      source: "espn",
      sourceId: "401880921",
      leagueSlug: "eng.3",
      leagueName: "League One",
      dayKey: "2026-08-15",
      kickoffUtc: "2026-08-15T11:30:00.000Z",
      homeTeam: "Oxford United",
      awayTeam: "Milton Keynes Dons",
      status: "FT",
      rawStatus: "STATUS_FULL_TIME",
      scoreHome: 2,
      scoreAway: 2
    }
  ];

  const result = dedupeLeagueDayFixtures(
    rows,
    { slug: "eng.3" }
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.removed.length, 1);
  assert.equal(
    result.rows[0].canonicalId,
    "cid_eng3_oxfordunited_miltonkeynesdons_20260815"
  );
});

test("broad eng.1 partition cannot donate Premier League tier or matchday to Isthmian", () => {
  const result = applyTrustedLeaguePresentation(
    {
      leagueSlug: "eng.1",
      leagueName: "Isthmian League Premier Division"
    },
    {
      name: "Premier League",
      country: "England",
      tier: 1
    },
    3
  );

  assert.equal(
    result.leagueName,
    "Isthmian League Premier Division"
  );
  assert.equal(result.country, "England");
  assert.equal(result.leagueTier, null);
  assert.equal(result.matchday, null);
  assert.equal(result.competitionIdentityMismatch, true);
});

test("matching canonical competition keeps trusted tier and matchday", () => {
  const result = applyTrustedLeaguePresentation(
    {
      leagueSlug: "eng.3",
      leagueName: "League One"
    },
    {
      name: "League One",
      country: "England",
      tier: 1
    },
    3
  );

  assert.equal(result.leagueTier, 1);
  assert.equal(result.matchday, 3);
  assert.equal(result.competitionIdentityMismatch, false);
});

function fakeNode() {
  const node = {
    children: [],
    className: "",
    textContent: "",
    style: {},
    onclick: null,
    classList: {
      add() {}
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };

  Object.defineProperty(node, "innerHTML", {
    get() {
      return this._innerHTML || "";
    },
    set(value) {
      this._innerHTML = value;
      if (value === "") this.children = [];
    }
  });

  return node;
}

function flatten(node, out = []) {
  if (!node) return out;
  out.push(node);

  for (const child of node.children || []) {
    flatten(child, out);
  }

  return out;
}

function evaluateActive(matches) {
  const mount = fakeNode();
  const listeners = {};

  const document = {
    getElementById(id) {
      return id === "active-leagues-list"
        ? mount
        : null;
    },
    createElement() {
      return fakeNode();
    },
    addEventListener(name, fn) {
      listeners[name] = fn;
    }
  };

  const window = {
    on: null,
    getSavedMatches() {
      return [];
    }
  };

  vm.runInNewContext(
    fs.readFileSync(
      "assets/js/ui/active-leagues-panel.js",
      "utf8"
    ),
    {
      window,
      document,
      console,
      Date,
      Intl
    }
  );

  assert.equal(
    typeof listeners["active-leagues:updated"],
    "function"
  );

  listeners["active-leagues:updated"]({
    detail: { matches }
  });

  return flatten(mount);
}

function evaluateToday(matches) {
  const panel = fakeNode();
  const listeners = {};

  const document = {
    querySelector(selector) {
      return selector === "#panel-today .panel-body"
        ? panel
        : null;
    },
    createElement() {
      return fakeNode();
    },
    addEventListener(name, fn) {
      listeners[name] = fn;
    }
  };

  const window = {
    on: null,
    getSavedMatches() {
      return [];
    }
  };

  vm.runInNewContext(
    fs.readFileSync(
      "assets/js/ui/today-panel.js",
      "utf8"
    ),
    {
      window,
      document,
      console,
      Date,
      Intl,
      setTimeout() {
        return 1;
      },
      setInterval() {
        return 1;
      },
      clearInterval() {}
    }
  );

  assert.equal(
    typeof listeners["today-matches:loaded"],
    "function"
  );

  listeners["today-matches:loaded"]({
    detail: {
      date: "2026-08-15",
      matches
    }
  });

  return flatten(panel);
}

const lowerLeagueRows = [
  {
    id: "isthmian-1",
    matchId: "isthmian-1",
    leagueSlug: "eng.1",
    leagueName: "Isthmian League Premier Division",
    country: "England",
    competitionIdentityMismatch: true,
    providerRound: {
      verified: true,
      roundNumber: 1
    },
    kickoffUtc: "2026-08-15T14:00:00.000Z",
    homeTeam: "Whyteleafe",
    awayTeam: "Wingate & Finchley",
    status: "PRE"
  },
  {
    id: "southern-central-1",
    matchId: "southern-central-1",
    leagueSlug: "eng.1",
    leagueName: "Southern League Premier Central",
    country: "England",
    competitionIdentityMismatch: true,
    providerRound: {
      verified: true,
      roundNumber: 2
    },
    kickoffUtc: "2026-08-15T14:00:00.000Z",
    homeTeam: "Stamford",
    awayTeam: "Racing Club Warwick",
    status: "PRE"
  },
  {
    id: "southern-south-1",
    matchId: "southern-south-1",
    leagueSlug: "eng.1",
    leagueName: "Southern League Premier South",
    country: "England",
    competitionIdentityMismatch: true,
    providerRound: {
      verified: true,
      roundNumber: 2
    },
    kickoffUtc: "2026-08-15T14:00:00.000Z",
    homeTeam: "Wimborne",
    awayTeam: "Gloucester",
    status: "PRE"
  }
];

const oxfordActiveRows = [
  {
    id: "oxford-fs",
    matchId: "oxford-fs",
    leagueSlug: "eng.3",
    leagueName: "League One",
    country: "England",
    leagueTier: 1,
    providerRound: {
      verified: true,
      roundNumber: 3
    },
    kickoffUtc: "2026-08-15T11:30:00.000Z",
    homeTeam: "Oxford Utd",
    awayTeam: "MK Dons",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 2
  },
  {
    id: "oxford-espn",
    matchId: "oxford-espn",
    leagueSlug: "eng.3",
    leagueName: "League One",
    country: "England",
    leagueTier: 1,
    providerRound: {
      verified: true,
      roundNumber: 3
    },
    kickoffUtc: "2026-08-15T11:30:00.000Z",
    homeTeam: "Oxford United",
    awayTeam: "Milton Keynes Dons",
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    scoreHome: 2,
    scoreAway: 2
  }
];

test("Active separates real lower competitions, renders round, and suppresses Oxford duplicate", () => {
  const nodes = evaluateActive([
    ...oxfordActiveRows,
    ...lowerLeagueRows
  ]);

  const headers = nodes
    .filter(n => n.className === "today-league")
    .map(n => n.textContent);

  assert.ok(
    headers.includes("League One · 3η Αγωνιστική")
  );

  assert.ok(
    headers.includes(
      "Isthmian League Premier Division · 1η Αγωνιστική"
    )
  );

  assert.ok(
    headers.includes(
      "Southern League Premier Central · 2η Αγωνιστική"
    )
  );

  assert.ok(
    headers.includes(
      "Southern League Premier South · 2η Αγωνιστική"
    )
  );

  const rows = nodes.filter(
    n => String(n.className).includes("match-row")
  );

  assert.equal(rows.length, 4);
});

test("Today separates competitions, renders round, and suppresses semantic duplicate", () => {
  const todayOxford = oxfordActiveRows.map(row => ({
    ...row,
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED"
  }));

  const nodes = evaluateToday([
    ...todayOxford,
    ...lowerLeagueRows
  ]);

  const headers = nodes
    .filter(n => n.className === "today-league")
    .map(n => n.textContent);

  assert.ok(
    headers.includes(
      "England · League One · 3η Αγωνιστική"
    )
  );

  assert.ok(
    headers.includes(
      "England · Isthmian League Premier Division · 1η Αγωνιστική"
    )
  );

  assert.ok(
    headers.includes(
      "England · Southern League Premier Central · 2η Αγωνιστική"
    )
  );

  assert.ok(
    headers.includes(
      "England · Southern League Premier South · 2η Αγωνιστική"
    )
  );

  const rows = nodes.filter(
    n => String(n.className).includes("match-row")
  );

  assert.equal(rows.length, 4);
});
