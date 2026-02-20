
export default function normalize(match){
  return {
    id: match.id,
    league: match.league,
    season: match.season,
    home: match.home,
    away: match.away,
    date: match.date,
    status: match.status,
    source: match.source,
    confidence: 0.85
  };
}
