import fs from "node:fs";
import { parseFlashscoreExactKickoffPage } from "../core/exact-provider-kickoff-evidence.js";
import path from "node:path";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { discoverProviderCompetitionsDay } from "./discover-provider-competitions-day.js";
const [dayKey = athensDayKey(), output] = process.argv.slice(2);
if (!output) throw new Error("provider_kickoff_audit_output_required");
fs.mkdirSync(output, { recursive: true });
const read = p => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const root = resolveDataPath("canonical-fixtures", dayKey);
const canonical = fs.readdirSync(root).filter(f => f.endsWith(".json")).flatMap(f => read(path.join(root, f))?.fixtures || []);
const history = read(resolveDataPath("identity-decisions", `prior-explicit-provider-bindings-${dayKey}.v1.json`));
const discovery = await discoverProviderCompetitionsDay(dayKey, { write: false });
if (!discovery.ok) throw new Error("provider_kickoff_discovery_failed");
const cases = [];
for (const f of discovery.artifact.fixtures.filter(f => f.eligibility === "eligible")) {
  const old = (history?.records || []).filter(r => r.providerFixtureId === f.providerFixtureId);
  const matches = canonical.filter(c => c.leagueSlug === f.canonicalSlug && (
    c.providerIds?.flashscore === f.providerFixtureId ||
    c.source === "flashscore" && String(c.sourceMatchId || c.sourceId) === f.providerFixtureId ||
    old.some(r => r.row.canonicalId === c.canonicalId && r.row.providerIds?.espn &&
      r.row.providerIds.espn === c.providerIds?.espn)));
  if (matches.length !== 1) continue;
  const c = matches[0];
  if (Date.parse(c.kickoffUtc) === Date.parse(f.kickoffUtc)) continue;
  const item = { canonicalId: c.canonicalId, leagueSlug: c.leagueSlug, providerFixtureId: f.providerFixtureId,
    primaryProvider: c.source, canonicalKickoffUtc: c.kickoffUtc, independentKickoffUtc: f.kickoffUtc,
    canonicalHome: c.homeTeam, canonicalAway: c.awayTeam,
    independentHome: f.home, independentAway: f.away };
  if (c.source === "espn" && /^\d+$/.test(c.providerIds?.espn || "")) {
    const eventId = c.providerIds.espn, slug = c.providerLeagueSlug || c.leagueSlug;
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/summary?event=${eventId}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const raw = await response.text();
      fs.writeFileSync(path.join(output, `espn-${eventId}.json`), raw);
      const body = JSON.parse(raw), event = body.header?.competitions?.[0];
      const home = event?.competitors?.find(t => t.homeAway === "home");
      const away = event?.competitors?.find(t => t.homeAway === "away");
      Object.assign(item, { primaryUrl: url, httpStatus: response.status,
        primaryHeader: body.header,
        exactPrimaryEventId: String(event?.id || body.header?.id || "") === eventId,
        primaryKickoffUtc: event?.date || null,
        primaryHome: { id: home?.team?.id, name: home?.team?.displayName },
        primaryAway: { id: away?.team?.id, name: away?.team?.displayName },
        exactNativeSides: Boolean(c.providerTeamIds?.espn?.home && c.providerTeamIds?.espn?.away &&
          String(home?.team?.id) === c.providerTeamIds.espn.home &&
          String(away?.team?.id) === c.providerTeamIds.espn.away),
        primaryStatus: event?.status?.type?.name });
    } catch (error) { item.primaryError = String(error.message); }
  } else if (c.source === "flashscore") {
    const url = `https://www.flashscore.com/match/${encodeURIComponent(f.providerFixtureId)}/`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.9" } });
      const html = await response.text();
      fs.writeFileSync(path.join(output, `flashscore-${f.providerFixtureId}.html`), html);
      const fields = [...html.matchAll(/"(?:startDate|startTime|startTimestamp|eventStartTimestamp|dateStart)"\s*:\s*(?:"([^"]+)"|(\d+))/g)]
        .slice(0, 20).map(m => m[0]);
      Object.assign(item, { primaryUrl: url, httpStatus: response.status, finalUrl: response.url,
        primaryTimeFields: fields, primaryKickoffProof: parseFlashscoreExactKickoffPage(html, f) });
    } catch (error) { item.primaryError = String(error.message); }
  }
  cases.push(item);
}
const report = { schema: "ai-matchlab.provider-kickoff-evidence-audit.v1", dayKey,
  generatedAt: new Date().toISOString(), sourceSha: process.env.GITHUB_SHA,
  discoveryHash: discovery.artifact.hash, canonicalMutations: 0, cases };
fs.writeFileSync(path.join(output, "kickoff-evidence-audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
