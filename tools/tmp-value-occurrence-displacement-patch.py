from pathlib import Path

p = Path("engine-v1/jobs/build-value-plan-comparison-day.js")
s = p.read_text(encoding="utf-8")

if "value-settlement-occurrence-displacement.js" in s:
    raise SystemExit("occurrence import unexpectedly pre-existing")

import_anchor = '} from "../core/production-evidence-identity-overlay.js";\n'
if s.count(import_anchor) != 1:
    raise SystemExit(f"import anchor count={s.count(import_anchor)}")
s = s.replace(
    import_anchor,
    import_anchor
    + 'import {\n'
      '  buildOccurrenceDisplacementSettlementProvenance,\n'
      '  resolveValueSettlementOccurrenceDisplacement\n'
      '} from "../core/value-settlement-occurrence-displacement.js";\n',
    1,
)

lines = s.splitlines(keepends=True)


def unique_index(marker):
    hits = [i for i, line in enumerate(lines) if line.strip() == marker]
    if len(hits) != 1:
        raise SystemExit(f"{marker}: expected 1 line, got {len(hits)}")
    return hits[0]


nonplayed_i = unique_index("const nonPlayedVoid = isValueSettlementVoidState(fixture);")
lines[nonplayed_i + 1:nonplayed_i + 1] = [
    "  const occurrenceDisplacement =\n",
    "    !finalResult && !nonPlayedVoid\n",
    "      ? resolveValueSettlementOccurrenceDisplacement(row)\n",
    "      : null;\n",
    "  const occurrenceDisplacementVoid =\n",
    "    occurrenceDisplacement?.verified === true &&\n",
    '    occurrenceDisplacement?.action === "VOID";\n',
]


def replace_range(start_marker, end_marker, new_lines):
    start = unique_index(start_marker)
    end = unique_index(end_marker)
    if start >= end:
        raise SystemExit(f"bad marker order: {start_marker} -> {end_marker}")
    lines[start:end] = [line if line.endswith("\n") else line + "\n" for line in new_lines]


replace_range(
    "const finalStatus =",
    "const finalStatusType =",
    [
        "  const finalStatus =",
        "    resolveComparisonFinalStatus(finalResult) ||",
        "    (",
        "      nonPlayedVoid",
        "        ? clean(",
        "            fixture?.rawStatus ||",
        "            fixture?.status",
        "          ) || null",
        "        : occurrenceDisplacementVoid",
        '          ? "STATUS_OCCURRENCE_MOVED_OTHER_DAY"',
        "          : null",
        "    );",
    ],
)
replace_range(
    "const finalStatusType =",
    "const finalResultProvenance =",
    [
        "  const finalStatusType =",
        "    resolveComparisonFinalStatusType(finalResult) ||",
        "    (",
        "      nonPlayedVoid",
        "        ? clean(",
        "            fixture?.statusType ||",
        "            fixture?.rawStatus ||",
        "            fixture?.status",
        "          ) || null",
        "        : occurrenceDisplacementVoid",
        '          ? "STATUS_OCCURRENCE_MOVED_OTHER_DAY"',
        "          : null",
        "    );",
    ],
)
replace_range(
    "const finalResultProvenance =",
    'let settlement = "UNRESOLVED";',
    [
        "  const finalResultProvenance =",
        "    nonPlayedVoid",
        "      ? buildComparisonNonPlayedProvenance(fixture)",
        "      : occurrenceDisplacementVoid",
        "        ? buildOccurrenceDisplacementSettlementProvenance(occurrenceDisplacement)",
        "        : buildComparisonFinalResultProvenance(finalResult);",
        "",
    ],
)


def replace_line(old_marker, new_line):
    idx = unique_index(old_marker)
    lines[idx] = new_line + "\n"


replace_line(
    'if (nonPlayedVoid) settlement = "VOID";',
    '  if (nonPlayedVoid || occurrenceDisplacementVoid) settlement = "VOID";',
)
replace_line(
    "finalScore: nonPlayedVoid ? null : verifiedScore,",
    "    finalScore: (nonPlayedVoid || occurrenceDisplacementVoid) ? null : verifiedScore,",
)

s = "".join(lines)
old_contract = 'finalTruth: "verified_final_results_or_canonical_non_played_state"'
new_contract = 'finalTruth: "verified_final_results_or_canonical_non_played_state_or_verified_occurrence_displacement"'
if s.count(old_contract) != 2:
    raise SystemExit(f"source contract count={s.count(old_contract)}")
s = s.replace(old_contract, new_contract)

p.write_text(s, encoding="utf-8")
