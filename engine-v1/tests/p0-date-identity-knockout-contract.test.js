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
  assert.equal(teamNamesMatch("Estudiantes de La Plata", "Estudiantes L.P."), true);
  assert.equal(teamNamesMatch("Gimnasia La Plata", "Gimnasia L.P."), true);
  assert.equal(teamNamesMatch("Sint-Truidense", "St. Truiden"), true);
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

test("operational today has one Europe/Athens authority", () => {
  const authority = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "live", "operational-day.js"),
    "utf8"
  );
  const loader = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "live", "date-nav-loader.js"),
    "utf8"
  );
  const dateNav = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "ui", "date-nav.js"),
    "utf8"
  );
  const app = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "ui", "app.js"),
    "utf8"
  );
  const valueAdapter = fs.readFileSync(
    path.join(repoRoot, "assets", "js", "live", "value-adapter.js"),
    "utf8"
  );
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");

  assert.match(authority, /timeZone:\s*"Europe\/Athens"/);
  assert.match(loader, /AIML_OperationalDay/);
  assert.match(dateNav, /AIML_OperationalDay/);
  assert.match(dateNav, /typeof window\.emit === "function"/);
  assert.match(app, /AIML_OperationalDay/);
  assert.match(valueAdapter, /AIML_OperationalDay/);
  assert.doesNotMatch(authority, /data\/deploy-snapshots\/latest\.json/);
  assert.ok(
    html.indexOf("assets/js/live/operational-day.js") <
    html.indexOf("assets/js/live/fixtures-loader.js")
  );
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
