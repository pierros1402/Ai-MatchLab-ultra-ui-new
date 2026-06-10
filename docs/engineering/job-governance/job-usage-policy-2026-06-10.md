# Job Usage Policy — 2026-06-10

## Hard stop

No new source jobs and no direct acquisition/search/fetch runner execution until job governance is reviewed.

## Allowed immediately

- Read-only inspection.
- Writer/validator self-tests.
- Governance board updates.
- Provider Contract Registry design.

## Not allowed without explicit gate

- Any fetch/search runner.
- Any promotion adapter outside its exact schema.
- Any actual canonical write.
- Any provider-specific normalizer unless it is attached to the registry.

## Production write gate

Canonical writes require:

1. Known provider contract.
2. Normalized rows in canonical-compatible schema.
3. Dry-run report.
4. Zero blocked rows.
5. Zero plan errors.
6. Explicit apply/allow-production flags.
7. Stage only intended source or data files.
