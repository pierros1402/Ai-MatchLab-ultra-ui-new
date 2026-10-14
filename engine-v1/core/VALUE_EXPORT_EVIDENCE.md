# Export evidence scope

The value export reads persisted pick rows, comparison summaries and settlement results. It does not read and verify complete execution logs or all required input audits. Therefore an empty pick array, summary count of zero or `comparison.ok=true` cannot certify successful zero-value execution.

Report schema v2 uses `ZERO_PICKS_UNVERIFIED` for empty stored plan records and records an integrity issue. This includes recovery placeholders: a stored object cannot authenticate a historical evaluation. No assertion of no games or absent odds is inferred. The separate historical diagnosis can support a value-stage outcome without certifying the full workflow.

`NO_PLAN_RECORD` means the plan object is missing from the stored source; it does not establish that the plan did not exist. `MISSING_DAY` means no day record was loaded; it does not establish that execution was never attempted. Pick-bearing status and win/loss counts describe persisted picks and settlement, not full input completeness or workflow success.

Range counters are explicitly based on stored records:

```
recordedPlanDays + noPlanRecordDays + missingDayRecords = totalDays
```

The legacy JSON aliases `availableDays` and `notAvailableDays` remain for existing readers and still count record presence/absence. Workbook headers use the accurate record labels and show both missing and total days. Missing, unverified and absent records remain visible alongside unchanged picks; no model replay, original observation mutation or automatic historical result correction occurs.

Execution certification must come from a separately verified execution/input evidence ledger. The exporter does not manufacture that ledger or relabel its missing evidence as success.
