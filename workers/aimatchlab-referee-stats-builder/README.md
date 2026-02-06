Referee Stats Builder – AIMATCHLAB

Role:
- Build factual referee statistics (cards, penalties, bias)
- NO AI, NO confidence

Reads:
- KV: REFEREE:MATCHES:<refId>

Writes:
- R2: stats/referee/<refId>.json

Endpoint:
GET /?refId=<REFEREE_ID>

Deploy:
wrangler deploy
