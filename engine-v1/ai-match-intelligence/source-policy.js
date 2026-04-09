export const SOURCE_POLICY = {
  referee: {
    preferred: ["official", "league", "trusted-stats"],
    minConfidence: 0.7
  },
  teamNews: {
    preferred: ["official", "trusted-editorial"],
    minConfidence: 0.6
  },
  lineups: {
    preferred: ["official", "trusted-editorial"],
    minConfidence: 0.6
  },
  competition: {
    preferred: ["official"],
    minConfidence: 0.8
  },
  editorial: {
    preferred: ["trusted-editorial"],
    minConfidence: 0.5
  }
};

export function classifySource(url = "") {
  if (!url) return "unknown";

  if (url.includes("uefa") || url.includes("fifa")) return "official";
  if (url.includes("league") || url.includes("premierleague")) return "league";
  if (url.includes("whoscored") || url.includes("sofascore")) return "trusted-stats";
  if (url.includes("espn") || url.includes("bbc")) return "trusted-editorial";

  return "low-trust";
}