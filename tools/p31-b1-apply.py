from pathlib import Path


def replace_once(path, before, after):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise SystemExit(
            f"replace contract failed for {path}: expected 1 occurrence, got {count}: {before!r}"
        )
    p.write_text(text.replace(before, after, 1), encoding="utf-8")


def patch_audit():
    p = Path("engine-v1/jobs/audit-history-semantic-integrity.js")
    text = p.read_text(encoding="utf-8")
    loop_anchor = text.index("  for (const [matchId, sides] of byId) {")
    start = text.index("    if (sides.length >= 2) {", loop_anchor)
    end = text.index("\n    const chosen = sides.find", start)
    old_block = text[start:end]
    if "const home = sides.find" not in old_block or "mirrorConflictCount += 1" not in old_block:
        raise SystemExit("unexpected mirror-audit block shape")

    new_block = '''    if (sides.length >= 2) {
      const homes = sides.filter(side => side.ha === "H");
      const aways = sides.filter(side => side.ha === "A");
      let referencePair = null;

      for (const home of homes) {
        for (const away of aways) {
          const identityMirrors = Boolean(
            semanticTeamKey(slug, home.teamName) === semanticTeamKey(slug, away.opp)
            && semanticTeamKey(slug, away.teamName) === semanticTeamKey(slug, home.opp)
          );
          const scoreMirrors = Boolean(
            safeNum(home.gf) === safeNum(away.ga)
            && safeNum(home.ga) === safeNum(away.gf)
          );
          if (identityMirrors && scoreMirrors) {
            referencePair = { home, away };
            break;
          }
        }
        if (referencePair) break;
      }

      // Result memory can legitimately contain more than two rows for one
      // matchId while team aliases converge. Do not let arbitrary insertion
      // order turn a same-score alias row into a false mirror conflict.
      // At least one reciprocal identity+score H/A pair must exist, and every
      // extra row must preserve the score for its H/A orientation. A
      // contradictory extra score therefore remains a hard error.
      const mirrorOk = Boolean(
        referencePair
        && sides.every(side => {
          const reference = side.ha === "H" ? referencePair.home : referencePair.away;
          return Boolean(
            reference
            && safeNum(side.gf) === safeNum(reference.gf)
            && safeNum(side.ga) === safeNum(reference.ga)
          );
        })
      );

      if (!mirrorOk) {
        mirrorConflictCount += 1;
        pushExample(examples.mirrorConflicts, { slug, matchId, sides }, maxExamples);
      }
    }'''
    p.write_text(text[:start] + new_block + text[end:], encoding="utf-8")


def patch_foundation():
    path = "engine-v1/jobs/build-foundation-integrity-report.js"
    replace_once(path, "      history?.clean === true,", "      history?.ok === true,")
    replace_once(
        path,
        '      history?.ok === true ? "history_semantic_warnings_present" : "history_semantic_errors_present"',
        '      "history_semantic_errors_present"',
    )
    replace_once(
        path,
        "  const warnings = [];\n  const expiredResults = Number(history?.resultsMemory?.expiredEntryCount || 0);",
        '''  const warnings = [];
  const semanticWarningCount = Number(history?.issueCounts?.warning || 0);
  if (semanticWarningCount > 0) {
    warnings.push({
      component: "historySemantic",
      reason: "history_semantic_warnings_present",
      count: semanticWarningCount,
      informational: true,
    });
  }

  const expiredResults = Number(history?.resultsMemory?.expiredEntryCount || 0);''',
    )
    replace_once(
        path,
        "      historySemanticMustBeClean: true,",
        '''      historySemanticErrorsBlock: true,
      historySemanticWarningsInformational: true,
      historySemanticMustBeClean: false,''',
    )


def patch_audit_tests():
    p = Path("engine-v1/jobs/audit-history-semantic-integrity.test.js")
    text = p.read_text(encoding="utf-8")
    marker = 'test("multi-side alias rows require a reciprocal pair and consistent orientation scores"'
    if marker in text:
        raise SystemExit("audit regression tests already present")
    text += '''\n\ntest("multi-side alias rows require a reciprocal pair and consistent orientation scores", () => {
  const payload = {
    teams: {
      "Home Club Long": [
        { matchId: "alias-1", date: "2026-08-21T12:00:00Z", opp: "Away", ha: "H", gf: 1, ga: 0, res: "W" }
      ],
      Home: [
        { matchId: "alias-1", date: "2026-08-21T12:00:00Z", opp: "Away", ha: "H", gf: 1, ga: 0, res: "W" }
      ],
      Away: [
        { matchId: "alias-1", date: "2026-08-21T12:00:00Z", opp: "Home", ha: "A", gf: 0, ga: 1, res: "L" }
      ]
    }
  };

  const report = auditResultsMemoryPayload("test.1", payload);
  assert.equal(report.multiSideMatchIdCount, 1);
  assert.equal(report.mirrorConflictCount, 0);
});

test("multi-side alias rows with a contradictory score remain a mirror conflict", () => {
  const payload = {
    teams: {
      "Home Club Long": [
        { matchId: "alias-2", date: "2026-08-21T12:00:00Z", opp: "Away", ha: "H", gf: 2, ga: 0, res: "W" }
      ],
      Home: [
        { matchId: "alias-2", date: "2026-08-21T12:00:00Z", opp: "Away", ha: "H", gf: 1, ga: 0, res: "W" }
      ],
      Away: [
        { matchId: "alias-2", date: "2026-08-21T12:00:00Z", opp: "Home", ha: "A", gf: 0, ga: 1, res: "L" }
      ]
    }
  };

  const report = auditResultsMemoryPayload("test.1", payload);
  assert.equal(report.multiSideMatchIdCount, 1);
  assert.equal(report.mirrorConflictCount, 1);
});\n'''
    p.write_text(text, encoding="utf-8")


def patch_foundation_tests():
    p = Path("engine-v1/tests/foundation-integrity-report.test.js")
    text = p.read_text(encoding="utf-8")
    start = text.index('test("history warnings fail closed for model and publication readiness"')
    end = text.index('\ntest("unsafe standings foundation blocks model readiness"', start)
    old = text[start:end]
    if "report.modelReady, false" not in old:
        raise SystemExit("unexpected foundation warning test shape")
    new = '''test("history warnings stay visible but do not block model or publication readiness", () => {
  const options = cleanOptions({ history: { clean: false, ok: true, issueCounts: { error: 0, warning: 2, info: 0 } } });
  const report = buildFoundationIntegrityReport("2026-08-09", options);
  assert.equal(report.modelReady, true);
  assert.equal(report.publicationReady, true);
  assert.ok(!report.blocked.some(row => row.component === "historySemantic"));
  assert.ok(report.warnings.some(row =>
    row.component === "historySemantic"
    && row.reason === "history_semantic_warnings_present"
    && row.count === 2
    && row.informational === true
  ));
});

test("history semantic errors remain a hard model and publication blocker", () => {
  const options = cleanOptions({ history: { clean: false, ok: false, issueCounts: { error: 1, warning: 0, info: 0 } } });
  const report = buildFoundationIntegrityReport("2026-08-09", options);
  assert.equal(report.modelReady, false);
  assert.equal(report.publicationReady, false);
  assert.ok(report.blocked.some(row =>
    row.component === "historySemantic"
    && row.reason === "history_semantic_errors_present"
  ));
});
'''
    p.write_text(text[:start] + new + text[end:], encoding="utf-8")


patch_audit()
patch_foundation()
patch_audit_tests()
patch_foundation_tests()
print("P3.1-B1 patch applied")
