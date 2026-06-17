# Legacy standings active store removed

The previous JSON standings artifacts were removed from active use.

Reason:
Any standings artifact with ambiguity, incomplete finished-league shape, missing explicit expected teams/matches policy, phase ambiguity, stat mismatch, low confidence, empty table, or no external final source identity gate must not remain in active `data/standings`.

Use only:
- `data/football-truth/_state/canonical-standings-candidates` for candidate-layer standings.
- New verified artifacts that pass explicit source identity + expected league shape gates.

See:
`data/football-truth/_diagnostics/legacy-standings-active-store-deletion-2026-06-17/legacy-standings-active-store-deletion-2026-06-17.json`
