import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const competitions = {
  'esp.1': { route: 'laliga-easports', sourceId: 'primera-division' },
  'esp.2': { route: 'laliga-hypermotion', sourceId: 'segunda-division' },
};

export async function captureLaLigaSeason(slug, startYear, { fetchPage = fetch, asOf = new Date() } = {}) {
  const competition = competitions[slug];
  if (!competition || !Number.isInteger(startYear) || startYear < 2000 || startYear > 2099 ||
      !Number.isFinite(asOf.getTime())) throw new Error('Invalid competition or season cutoff');
  const edition = `${startYear}-${String(startYear + 1).slice(-2)}`;
  const base = `https://www.laliga.com/en-GB/${competition.route}/results`;
  const pages = [];
  async function read(url) {
    const response = await fetchPage(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`LALIGA_HTTP_${response.status}: ${url}`);
    const html = await response.text();
    const script = html.match(/<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const props = script && JSON.parse(script[1]).props?.pageProps;
    if (props?.statusCode !== 200 || String(props.season) !== String(startYear) || props.competition !== competition.sourceId) {
      throw new Error(`LALIGA_EDITION_MISMATCH: ${url}`);
    }
    pages.push({ url, sha256: createHash('sha256').update(html).digest('hex'), retrievedAt: new Date().toISOString() });
    return props;
  }

  const index = await read(`${base}/${edition}/gameweek-1`);
  const rounds = index.gameweekList;
  if (!Array.isArray(rounds) || !rounds.length ||
      rounds.some((round, i) => round.week !== i + 1 || !Number.isFinite(Date.parse(round.date)))) {
    throw new Error('LALIGA_ROUND_LIST_UNVERIFIED');
  }
  const matches = new Map();
  const seen = new Set();
  for (const round of rounds) {
    if (Date.parse(round.date) > asOf.getTime() + 7 * 86400000) continue;
    const page = round.week === 1 ? index : await read(`${base}/${edition}/gameweek-${round.week}`);
    if (page.gameweek?.id !== round.id || !Array.isArray(page.matches) || !page.matches.length) {
      throw new Error(`LALIGA_ROUND_UNVERIFIED: ${round.week}`);
    }
    for (const match of page.matches) {
      const kickoff = Date.parse(match.date);
      if (!Number.isInteger(match.id) || !match.home_team?.id || !match.away_team?.id ||
          !Number.isFinite(kickoff) || seen.has(match.id)) {
        throw new Error(`LALIGA_FIXTURE_UNVERIFIED: ${match.id}`);
      }
      seen.add(match.id);
      if (kickoff > asOf.getTime()) continue;
      matches.set(match.id, {
        officialId: String(match.id), round: round.week, kickoffUtc: match.date,
        home: { id: match.home_team.id, name: match.home_team.nickname },
        away: { id: match.away_team.id, name: match.away_team.nickname },
        reportedStatus: match.status,
        sourceUrl: pages.at(-1).url,
      });
    }
  }
  return { slug, edition, asOf: asOf.toISOString(), pages, matches: [...matches.values()],
    scope: 'OFFICIAL_SCHEDULE_EVIDENCE', fullCoverageCertified: false, productionWrites: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [year, cutoff, ...slugs] = process.argv.slice(2);
  if (!slugs.length) throw new Error('Usage: capture-laliga-season-census.mjs START_YEAR ISO_CUTOFF SLUG...');
  const results = await Promise.allSettled(slugs.map(slug => captureLaLigaSeason(slug, Number(year), { asOf: new Date(cutoff) })));
  console.log(JSON.stringify(results.map((result, i) => result.status === 'fulfilled' ?
    result.value : { slug: slugs[i], status: 'HOLD', reason: result.reason.message }), null, 2));
  if (results.some(result => result.status === 'rejected')) process.exitCode = 2;
}
