import crypto from "node:crypto";
import { athensDayFromKickoff } from "./daykey.js";
const text = v => String(v ?? "").trim();
export function parseFlashscoreExactKickoffPage(html, fixture) {
  const deny = reason => ({ ok: false, reason });
  let page, url;
  try {
    page = JSON.parse(String(html).match(/var\s+pageinfo\s*=\s*(\{[^;]+\});/)?.[1] || "");
    const canonical = String(html).match(/<meta\b(?=[^>]*property=["']og:url["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>/i)?.[1];
    url = new URL(String(canonical || "").replaceAll("&amp;", "&"));
  } catch { return deny("exact_match_page_identity_missing"); }
  const parts = url.pathname.split("/").filter(Boolean);
  if (page.id !== fixture.providerFixtureId || page.sport !== "soccer" ||
    page.tournament !== fixture.providerCompetitionId || url.hostname !== "www.flashscore.com" ||
    url.searchParams.get("mid") !== fixture.providerFixtureId ||
    !parts[2]?.endsWith("-" + fixture.home?.providerTeamId) ||
    !parts[3]?.endsWith("-" + fixture.away?.providerTeamId))
    return deny("exact_match_page_identity_conflict");
  const decoded = String(html).split(String.fromCharCode(92, 34)).join('"');
  const feeds = [...decoded.matchAll(/"common_feed"\s*:\s*\[([\s\S]*?)\]/g)];
  if (feeds.length !== 1) return deny("match_page_time_ambiguous");
  const values = [...feeds[0][1].matchAll(/"DC"\s*:\s*(\d{10})/g)];
  if (values.length !== 1) return deny("match_page_time_missing");
  const kickoffUtc = new Date(Number(values[0][1]) * 1000).toISOString();
  if (Date.parse(kickoffUtc) !== Date.parse(fixture.kickoffUtc) ||
    athensDayFromKickoff(kickoffUtc) !== fixture.dayKey) return deny("independent_feed_page_time_conflict");
  return { ok: true, provider: "flashscore", providerFixtureId: fixture.providerFixtureId,
    providerCompetitionId: fixture.providerCompetitionId, kickoffUtc,
    homeProviderTeamId: fixture.home.providerTeamId, awayProviderTeamId: fixture.away.providerTeamId,
    sourceUrl: url.href, timestampField: "common_feed.DC",
    rawSourceSha256: crypto.createHash("sha256").update(String(html)).digest("hex") };
}
export function validateEspnExactKickoffEvidence(canonical, entry, dayKey) {
  const event = entry?.header?.competitions?.[0], home = event?.competitors?.find(c => c.homeAway === "home"),
    away = event?.competitors?.find(c => c.homeAway === "away");
  const id = text(canonical?.providerIds?.espn);
  if (!/^\d+$/.test(id) || entry?.provider !== "espn" || entry?.canonicalId !== canonical.canonicalId ||
    canonical.source !== "espn" || canonical.leagueSlug !== entry.leagueSlug ||
    entry.header?.competitions?.length !== 1 ||
    (entry.header?.league?.slug && entry.header.league.slug !== canonical.leagueSlug) ||
    event?.competitors?.length !== 2 ||
    text(event?.id || entry.header?.id) !== id || text(entry.header?.id || event?.id) !== id ||
    !canonical.providerTeamIds?.espn?.home || !canonical.providerTeamIds?.espn?.away ||
    text(home?.team?.id) !== canonical.providerTeamIds.espn.home ||
    text(away?.team?.id) !== canonical.providerTeamIds.espn.away ||
    !Number.isFinite(Date.parse(event?.date)) || athensDayFromKickoff(event.date) !== dayKey)
    return { ok: false, reason: "exact_espn_event_identity_conflict" };
  return { ok: true, kickoffUtc: new Date(event.date).toISOString(), eventId: id,
    homeProviderTeamId: text(home.team.id), awayProviderTeamId: text(away.team.id) };
}

export function certifiedProviderKickoffUtc(row, previousDate) {
  const e=row?.exactProviderKickoffEvidence;
  if(row?.hasConflict || row?.providerTeamIdentityConflict || e?.schema!=="ai-matchlab.exact-provider-kickoff.v1"||e.canonicalId!==row.canonicalId||
    e.leagueSlug!==row.leagueSlug||e.dayKey!==row.dayKey||e.provider!==row.source||
    e.providerFixtureId!==row.providerIds?.flashscore)return null;
  let result;
  if(e.provider==="espn")result=validateEspnExactKickoffEvidence(row,e,row.dayKey);
  else if(e.provider==="flashscore"){
    const p=e.primaryProof;
    result={ok:p?.ok===true&&p.providerFixtureId===row.providerIds?.flashscore&&
      p.provider==="flashscore"&&Boolean(row.providerTeamIds?.flashscore?.home)&&
      p.homeProviderTeamId===row.providerTeamIds?.flashscore?.home&&
      p.awayProviderTeamId===row.providerTeamIds?.flashscore?.away&&
      p.timestampField==="common_feed.DC"&&/^[a-f0-9]{64}$/.test(p.rawSourceSha256||""),
      kickoffUtc:p?.kickoffUtc};
  }
  if(!result?.ok||!Number.isFinite(Date.parse(result.kickoffUtc))||
    athensDayFromKickoff(result.kickoffUtc)!==row.dayKey)return null;
  if(previousDate!==undefined&&(!Number.isFinite(Date.parse(previousDate))||
    athensDayFromKickoff(previousDate)!==row.dayKey))return null;
  return new Date(result.kickoffUtc).toISOString();
}
export function retainCertifiedKickoff(previous, merged) {
  const candidate={...merged,exactProviderKickoffEvidence:merged.exactProviderKickoffEvidence||previous?.exactProviderKickoffEvidence};
  const kickoff=certifiedProviderKickoffUtc(candidate);
  if(!kickoff)return merged;
  if(Date.parse(candidate.kickoffUtc)===Date.parse(kickoff))return candidate;
  const result={...candidate,kickoffUtc:kickoff};
  if(typeof result.matchKey==="string"&&result.matchKey.includes("|")){
    const parts=result.matchKey.split("|");
    if(parts.length===3)result.matchKey=parts.slice(0,2).concat(String(Math.round(Date.parse(kickoff)/600000)*600000)).join("|");
  }
  return result;
}
