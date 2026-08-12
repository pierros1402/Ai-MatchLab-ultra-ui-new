from pathlib import Path

workflow_path = Path('.github/workflows/daily-deploy-snapshot.yml')
test_path = Path('engine-v1/tests/daily-snapshot-final-live-refresh.test.js')

workflow = workflow_path.read_text(encoding='utf-8')
workflow_anchor = '''      - name: Refresh final authoritative live status\n        if: env.SKIP_BUILD != 'true'\n        run: node ./engine-v1/jobs/run-live-status-refresh-day.js "$DAY_KEY"\n\n      - name: Rebuild details after final live refresh\n'''
workflow_replacement = '''      - name: Refresh final authoritative live status\n        if: env.SKIP_BUILD != 'true'\n        run: node ./engine-v1/jobs/run-live-status-refresh-day.js "$DAY_KEY"\n\n      # The live refresh mutates canonical truth. Re-sync the runtime fixture DB\n      # immediately so details/snapshot overlays cannot combine the new canonical\n      # state with a stale pre-refresh runtime status envelope.\n      - name: Resync canonical fixtures after final live refresh\n        if: env.SKIP_BUILD != 'true'\n        run: node ./engine-v1/jobs/sync-canonical-fixtures-to-json-db-day.js "$DAY_KEY"\n\n      - name: Rebuild details after final live refresh\n'''
if workflow.count(workflow_anchor) != 1:
    raise SystemExit(f'workflow anchor count={workflow.count(workflow_anchor)}')
workflow = workflow.replace(workflow_anchor, workflow_replacement, 1)
workflow_path.write_text(workflow, encoding='utf-8')

test = test_path.read_text(encoding='utf-8')
test_anchor = '''    const details =\n      workflow.indexOf(\n        "- name: Rebuild details after final live refresh"\n      );\n\n    const exportStep =\n'''
test_replacement = '''    const resync =\n      workflow.indexOf(\n        "- name: Resync canonical fixtures after final live refresh"\n      );\n\n    const details =\n      workflow.indexOf(\n        "- name: Rebuild details after final live refresh"\n      );\n\n    const exportStep =\n'''
if test.count(test_anchor) != 1:
    raise SystemExit(f'test anchor 1 count={test.count(test_anchor)}')
test = test.replace(test_anchor, test_replacement, 1)

assert_anchor = '''    assert.ok(live >= 0);\n    assert.ok(details > live);\n    assert.ok(exportStep > details);\n'''
assert_replacement = '''    assert.ok(live >= 0);\n    assert.ok(resync > live);\n    assert.ok(details > resync);\n    assert.ok(exportStep > details);\n'''
if test.count(assert_anchor) != 1:
    raise SystemExit(f'test anchor 2 count={test.count(assert_anchor)}')
test = test.replace(assert_anchor, assert_replacement, 1)

regex_anchor = '''    assert.match(\n      workflow,\n      /build-details-day\\.js "\\$DAY_KEY" --rebuild/\n    );\n'''
regex_replacement = '''    assert.match(\n      workflow,\n      /sync-canonical-fixtures-to-json-db-day\\.js "\\$DAY_KEY"/\n    );\n\n    assert.match(\n      workflow,\n      /build-details-day\\.js "\\$DAY_KEY" --rebuild/\n    );\n'''
if test.count(regex_anchor) != 1:
    raise SystemExit(f'test anchor 3 count={test.count(regex_anchor)}')
test = test.replace(regex_anchor, regex_replacement, 1)
test_path.write_text(test, encoding='utf-8')

print('Applied final-live canonical/runtime resync patch')
