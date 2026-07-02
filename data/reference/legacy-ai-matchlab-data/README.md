# Legacy AI-MATCHLAB-DATA reference

This directory keeps the useful parts of the old root-level `AI-MATCHLAB-DATA` folder as reference data only.

Runtime/UI code must not read this directory directly. The active league catalogue is generated from the canonical coverage registry into `assets/data/leagues-catalogue.json`, and the engine exposes the same shape through `/api/leagues`.

Kept here:
- regional `*_betting_ready_FINAL.json` maps
- `mappings/espn_league_kv_map_FULL_with_ids.json`
- `mappings/venues_map.json`
- `indexes/continents.json` as historical reference

Removed from active data:
- empty/failed history metadata
- empty lookup files
- old standalone loader/package files
- Cloudflare/local test HTML
