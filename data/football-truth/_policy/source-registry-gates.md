# Football Truth source registry gates

This repo must not run standings extraction or canonical candidate promotion from raw/noisy web signals.

Hard rules:

1. No source identity -> no extraction.
2. No extraction contract -> no standings.
3. No expected shape policy -> no candidate.
4. No reconciliation or official/final-source evidence -> no production truth.
5. Generic accepted-shape tables are not source identity evidence.
6. Legacy `data/standings` artifacts must not be used as active truth input.
7. Production/truth writes remain locked unless separately and explicitly approved.

Truth ladder:

- L0: unknown / no verified source identity
- L1: source candidate found or rejected/quarantined
- L2: source identity verified
- L3: extraction contract verified
- L4: standings shape verified
- L5: reconciled with fixtures/results or official final table
- L6: canonical candidate
- L7: production truth

The next allowed workstream is source registry growth, not ad-hoc standings scraping.
