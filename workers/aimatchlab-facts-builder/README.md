Facts Builder – AIMATCHLAB

Role:
- Build factual stats (standings, form, splits)
- NO AI, NO confidence

Reads:
- KV: MATCH:<matchId>
- KV: TEAM_STATS

Writes:
- R2: stats/match/<matchId>/facts.json

Endpoint:
GET /?matchId=<MATCH_ID>

Deploy:
wrangler deploy
