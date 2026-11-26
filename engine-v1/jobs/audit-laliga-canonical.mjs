import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveDataPath } from '../storage/data-root.js';
import { getProductionIdentityResolver } from '../core/production-identity-resolver-runtime.js';
import { captureLaLigaSeason } from './capture-laliga-season-census.mjs';
import { currentSeason } from '../core/season.js';
import { sameTeamName } from '../core/fixture-dedup.js';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' });
const normalize = name => String(name ?? '').normalize('NFC').trim().toLowerCase();

// LaLiga team IDs identify the squad across editions. Scope the known
// third-party spellings to their competition and keep reserve teams distinct.
const reviewedAliases = {
  'esp.1': { 49: ['R. Racing Club', 'Racing Santander'] },
  'esp.2': {
    39: ['Real Sporting', 'Sporting Gijón', 'Sporting Gijon'],
    481: ['Celta Fortuna', 'RC Celta Fortuna', 'Celta Vigo B', 'Celta B'],
    482: ['R. Sociedad B', 'Real Sociedad B', 'Real Sociedad II', 'Sanse'],
  },
};

export async function auditCanonicalCensus(census, { readBucket, teamIdentity }) {
  const buckets = new Map();
  const rows = [];
  for (const match of census.matches) {
    const kickoff = Date.parse(match.kickoffUtc);
    const day = dayFormat.format(new Date(kickoff));
    if (!buckets.has(day)) buckets.set(day, await readBucket(day, census.slug));
    const bucket = buckets.get(day);
    const row = { ...match, day, status: 'CANONICAL_BUCKET_UNAVAILABLE' };
    rows.push(row);
    if (!bucket) continue;

    const byId = bucket.filter(fixture =>
      String(fixture.providerIds?.laliga ?? (fixture.source === 'laliga' ? fixture.sourceMatchId : '')) === match.officialId);
    const sameTeam = (source, canonical) => {
      if (!normalize(source.name) || !normalize(canonical)) return false;
      const a = teamIdentity(census.slug, source.name);
      const b = teamIdentity(census.slug, canonical);
      if (a && b) return a === b;
      const aliases = reviewedAliases[census.slug]?.[source.id]?.map(normalize);
      if (aliases?.includes(normalize(source.name)) && aliases.includes(normalize(canonical))) return true;
      return sameTeamName(census.slug, source.name, canonical);
    };
    const byTeams = bucket.filter(fixture =>
      sameTeam(match.home, fixture.homeTeam) && sameTeam(match.away, fixture.awayTeam));
    const byFixture = byTeams.filter(fixture => Date.parse(fixture.kickoffUtc) === kickoff);
    const candidates = byId.length ? byId : byFixture;
    if (candidates.length === 1 && (!byId.length || byFixture.includes(candidates[0]))) {
      row.canonicalId = candidates[0].canonicalId;
      row.status = byId.length ? 'OFFICIAL_ID_MATCH' : 'KICKOFF_AND_TEAM_MATCH';
    } else if (candidates.length) {
      row.status = 'IDENTITY_HOLD';
      row.canonicalCandidates = candidates.map(({ canonicalId, kickoffUtc, source }) =>
        ({ canonicalId, kickoffUtc, source }));
    } else if (byTeams.length) {
      row.status = 'KICKOFF_DISAGREEMENT';
      row.canonicalCandidates = byTeams.map(({ canonicalId, kickoffUtc, source }) =>
        ({ canonicalId, kickoffUtc, source }));
    } else {
      row.status = 'UNMATCHED_CANDIDATE';
    }
  }

  const used = new Map();
  for (const row of rows) {
    if (!row.canonicalId) continue;
    if (!used.has(row.canonicalId)) used.set(row.canonicalId, []);
    used.get(row.canonicalId).push(row);
  }
  for (const matches of used.values()) {
    if (matches.length > 1) for (const row of matches) row.status = 'IDENTITY_HOLD';
  }
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { slug: census.slug, edition: census.edition, asOf: census.asOf,
    pages: census.pages, counts, rows, fullCoverageCertified: false, productionWrites: 0 };
}

async function readCanonicalBucket(day, slug) {
  try {
    const body = JSON.parse(await readFile(resolveDataPath('canonical-fixtures', day, slug + '.json'), 'utf8'));
    return Array.isArray(body.fixtures) && body.fixtures.every(row => row.canonicalId &&
      (!row.leagueSlug || row.leagueSlug === slug)) ? body.fixtures : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const asOf = process.argv[2] ? new Date(process.argv[2]) : new Date();
  const startYear = Number(currentSeason(asOf).slice(0, 4));
  const resolver = getProductionIdentityResolver();
  const teamIdentity = (leagueSlug, alias) => {
    const result = resolver.resolveTeamReference({ leagueSlug, alias });
    return result.ok ? result.globalClubId : null;
  };
  const slugs = ['esp.1', 'esp.2'];
  const results = await Promise.allSettled(slugs.map(async slug => auditCanonicalCensus(
    await captureLaLigaSeason(slug, startYear, { asOf }), { readBucket: readCanonicalBucket, teamIdentity })));
  console.log(JSON.stringify({
    schema: 'ai-matchlab.laliga-canonical-audit.v1',
    sourceCommit: process.env.GITHUB_SHA ?? null,
    leagues: results.map((result, i) => result.status === 'fulfilled' ? result.value :
      { slug: slugs[i], status: 'HOLD', reason: result.reason.message }),
  }, null, 2));
  if (results.some(result => result.status === 'rejected')) process.exitCode = 2;
}
