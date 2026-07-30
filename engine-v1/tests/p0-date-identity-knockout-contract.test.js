import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { teamNamesMatch } from "../core/team-identity.js";
import {
  normalizeDisplayTeam,
  canonicalDisplayTeamName
} from "../core/display-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

test("known cross-provider senior-team aliases converge", () => {
  assert.equal(teamNamesMatch("AGF", "Aarhus"), true);
  assert.equal(teamNamesMatch("Crvena zvezda (Srb)", "Red Star Belgrade"), true);
  assert.equal(teamNamesMatch("Univ. Craiova (Rou)", "CSU Craiova"), true);
});


test("display aliases collapse provider duplicates and preserve canonical casing", () => {
  assert.equal(normalizeDisplayTeam("Argentinos Jrs"), "argentinosjuniors");
  assert.equal(normalizeDisplayTeam("Argentinos Juniors"), "argentinosjuniors");
  assert.equal(normalizeDisplayTeam("Estudiantes Rio Cuarto"), "estudiantesriocuarto");
  assert.equal(normalizeDisplayTeam("Estudiantes de Río Cuarto"), "estudiantesriocuarto");
  assert.equal(normalizeDisplayTeam("Lech Poznan (Pol)"), "lechpoznan");
  assert.equal(normalizeDisplayTeam("AGF"), normalizeDisplayTeam("Aarhus (Den)"));
  assert.equal(canonicalDisplayTeamName("gimnasia mendoza"), "Gimnasia Mendoza");
  assert.equal(canonicalDisplayTeamName("Argentinos Jrs"), "Argentinos Juniors");
});

test("squad markers remain identity boundaries", () => {
  assert.equal(teamNamesMatch("Ajax", "Ajax U21"), false);
  assert.equal(teamNamesMatch("Barcelona", "Barcelona B"), false);
});

test("knockout display keeps FT, AET and PEN separate", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "ui", "active-leagues-panel.js"),
    "utf8"
  );
  assert.match(source, /parts\.push\("FT /);
  assert.match(source, /parts\.push\("AET /);
  assert.match(source, /parts\.push\("PEN /);
  assert.doesNotMatch(source, /scoreHome\s*\+\s*.*penalt/i);
  assert.doesNotMatch(source, /scoreAway\s*\+\s*.*penalt/i);
});

test("operational today is anchored to Europe\/Athens", () => {
  const loader = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "live", "date-nav-loader.js"),
    "utf8"
  );
  const todayPanel = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "ui", "today-panel.js"),
    "utf8"
  );
  assert.match(loader, /timeZone:\s*"Europe\/Athens"/);
  assert.match(todayPanel, /timeZone:\s*"Europe\/Athens"/);
  assert.doesNotMatch(loader, /return window\.DateNav\.getToday\(\)/);
});


test("display universe preserves knockout score namespaces and provider authority", () => {
  const source = fs.readFileSync(path.join(repoRoot, "engine-v1", "index.js"), "utf8");
  assert.match(source, /withKnockoutScoreNamespaces/);
  assert.match(source, /terminalMinuteSuggestsExtraTime/);
  assert.match(source, /afterExtraTimeScore = \{ home: scoreHome, away: scoreAway \}/);
  assert.match(source, /decidedBy = decidedBy \|\| "AET"/);
  assert.match(source, /authoritativeTerminalWriteback/);
  assert.match(source, /dateMatchSourceAuthority/);
});

test("misclassified Kings World club rows are excluded without disabling the real World Cup slug", () => {
  const source = fs.readFileSync(path.join(repoRoot, "engine-v1", "index.js"), "utf8");
  assert.match(source, /MISCLASSIFIED_KINGS_WORLD_CLUB_TEAMS/);
  assert.match(source, /isMisclassifiedKingsWorldClubRow/);
  assert.match(source, /slug !== "fifa\.world"/);
  assert.match(source, /"fifa\.world_cup":\s*"fifa\.world"/);
});
