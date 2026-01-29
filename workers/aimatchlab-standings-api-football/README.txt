AIMATCHLAB Standings Worker (API-Football)

Routes:
- /health
- /leagues
- /standings?league=eng.1
- /standings?league=eng.1&write=1
- /run  (bulk refresh + writes KV)
KV Keys:
- STANDINGS:OFFICIAL:<slug>
- STANDINGS:INDEX

IMPORTANT:
- Ensure secret API_FOOTBALL_KEY exists:
  wrangler secret put API_FOOTBALL_KEY
- Ensure KV binding AIMATCHLAB_KV_CORE is correct in wrangler.toml
