#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="00097c36ca858f6262322736a382f2619d59875a"
REPAIR_DAY="2026-09-13"
CURRENT_DAY="2026-09-15"
RELEASE_BRANCH="release/20260915-verified-final-canonical-convergence-v1"
TMP_WORKFLOW=".github/workflows/tmp-verified-final-canonical-convergence-20260915.yml"
TMP_SCRIPT="tools/tmp-verified-final-canonical-convergence-20260915.sh"

echo "=== VERIFY BRANCH SCOPE ==="
BAD="$(git diff --name-only "$BASE_SHA"..HEAD | grep -Ev '^(\.github/workflows/tmp-verified-final-canonical-convergence-20260915\.yml|tools/tmp-verified-final-canonical-convergence-20260915\.sh|engine-v1/jobs/promote-verified-final-truth-to-canonical-day\.js|engine-v1/tests/verified-final-canonical-convergence\.test\.js|engine-v1/tests/daily-history-verified-final-convergence\.test\.js)$' || true)"
if [ -n "$BAD" ]; then echo "$BAD"; exit 1; fi

echo "=== WIRE RECENT HISTORY CONVERGENCE ==="
python - <<'PY'
from pathlib import Path
p=Path('engine-v1/jobs/run-daily-cycle.js')
s=p.read_text(encoding='utf-8')
a='import { applyResultsTruthToCanonicalDay } from "./apply-results-truth-to-canonical-day.js";\n'
if s.count(a)!=1: raise SystemExit(f'import anchor count {s.count(a)}')
s=s.replace(a,a+'import { promoteVerifiedFinalTruthToCanonicalDay } from "./promote-verified-final-truth-to-canonical-day.js";\n',1)
old='''        const sweep = applyResultsTruthToCanonicalDay(day);
        syncCanonicalFixturesToJsonDbDay(day);
        const readiness = auditFinalizationReadinessDay(day);
'''
new='''        const sweep = applyResultsTruthToCanonicalDay(day);
        syncCanonicalFixturesToJsonDbDay(day);
        let readiness = auditFinalizationReadinessDay(day);
'''
if s.count(old)!=1: raise SystemExit(f'readiness anchor count {s.count(old)}')
s=s.replace(old,new,1)
anchor='        const historyParitySummary = summarizeHistoryTruthParity(historyParity);\n'
if s.count(anchor)!=1: raise SystemExit(f'summary anchor count {s.count(anchor)}')
block='''        let verifiedFinalCanonicalConvergence = null;
        let verifiedFinalCanonicalConvergenceAttempted = false;

        if (
          Array.isArray(historyParity?.errors) &&
          historyParity.errors.some(error =>
            error?.reason === "verified_final_canonical_nonterminal"
          )
        ) {
          verifiedFinalCanonicalConvergenceAttempted = true;
          verifiedFinalCanonicalConvergence =
            promoteVerifiedFinalTruthToCanonicalDay(day, { write: true });

          if (verifiedFinalCanonicalConvergence?.ok !== true) {
            throw new Error(
              `verified_final_canonical_convergence_failed:${day}:${verifiedFinalCanonicalConvergence?.reason || "unknown"}`
            );
          }

          if (Number(verifiedFinalCanonicalConvergence?.promotedRows || 0) > 0) {
            syncCanonicalFixturesToJsonDbDay(day);
            readiness = auditFinalizationReadinessDay(day);
          }

          historyParity = buildHistoryDayFromTruth(day);
        }

'''
s=s.replace(anchor,block+anchor,1)
old2='''          historyTruthRefreshAttempted,
          historyTruthRefreshStatus,
          historyParity: historyParitySummary,
'''
new2='''          historyTruthRefreshAttempted,
          historyTruthRefreshStatus,
          verifiedFinalCanonicalConvergenceAttempted,
          verifiedFinalCanonicalConvergenceOk:
            verifiedFinalCanonicalConvergence?.ok ?? null,
          verifiedFinalCanonicalPromotedRows:
            verifiedFinalCanonicalConvergence?.promotedRows ?? 0,
          verifiedFinalCanonicalRejectedRows:
            verifiedFinalCanonicalConvergence?.rejectedRows ?? 0,
          verifiedFinalCanonicalByReason:
            verifiedFinalCanonicalConvergence?.byReason || {},
          historyParity: historyParitySummary,
'''
if s.count(old2)!=1: raise SystemExit(f'diagnostics anchor count {s.count(old2)}')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')
PY

node --check engine-v1/jobs/promote-verified-final-truth-to-canonical-day.js
node --check engine-v1/jobs/run-daily-cycle.js
node --check engine-v1/tests/verified-final-canonical-convergence.test.js
node --check engine-v1/tests/daily-history-verified-final-convergence.test.js
git diff --check

echo "=== TARGETED TESTS ==="
node --test engine-v1/tests/verified-final-canonical-convergence.test.js engine-v1/tests/daily-history-verified-final-convergence.test.js engine-v1/tests/history-truth-convergence.test.js engine-v1/tests/daily-history-catchup-h2h-scope.test.js engine-v1/tests/daily-terminal-writeback-order.test.js engine-v1/tests/non-played-state-contract.test.js

echo "=== FULL ENGINE REGRESSION ==="
node --test engine-v1/tests/*.test.js

echo "=== PROTECT VALUE BYTES ==="
git ls-files 'data/value/**' 'data/value-plans/**' 'data/value-comparison/**' 'data/deploy-snapshots/*/value.json' 'data/deploy-snapshots/*/value-audit.json' | sort -u | while read -r f; do test -n "$f" && sha256sum "$f"; done > /tmp/value-before.sha256

echo "=== VERIFY PRE-REPAIR HISTORY PARITY ==="
node --input-type=module <<'NODE'
import { buildHistoryDayFromTruth } from './engine-v1/jobs/append-finalized-day-to-history.js';
const r=buildHistoryDayFromTruth('2026-09-13');
const e=Array.isArray(r.errors)?r.errors:[];
if(r.ok!==false||r.acceptedRows!==410||e.length!==1||e[0].reason!=='verified_final_canonical_nonterminal'||e[0].matchId!=='cid_cafconfed_rukinzo_durbancity_20260913') throw new Error(JSON.stringify(r));
console.log(JSON.stringify({acceptedRows:r.acceptedRows,error:e[0]},null,2));
NODE

echo "=== APPLY EXACT VERIFIED-FINAL CANONICAL CONVERGENCE ==="
node engine-v1/jobs/promote-verified-final-truth-to-canonical-day.js --date="$REPAIR_DAY" --dry-run > /tmp/convergence-dry.json
node engine-v1/jobs/promote-verified-final-truth-to-canonical-day.js --date="$REPAIR_DAY" > /tmp/convergence-write.json
node --input-type=module <<'NODE'
import fs from 'node:fs';
import { buildHistoryDayFromTruth } from './engine-v1/jobs/append-finalized-day-to-history.js';
for(const f of ['/tmp/convergence-dry.json','/tmp/convergence-write.json']){
  const x=JSON.parse(fs.readFileSync(f,'utf8'));
  if(x.ok!==true||x.promotedRows!==1||x.promoted?.[0]?.matchId!=='cid_cafconfed_rukinzo_durbancity_20260913'||x.promoted?.[0]?.score!=='1-2') throw new Error(JSON.stringify(x));
}
const r=buildHistoryDayFromTruth('2026-09-13');
if(r.ok!==true||r.acceptedRows!==411||r.canonicalPlayedFinalCount!==411||r.verifiedFinalCount!==411) throw new Error(JSON.stringify(r));
NODE

echo "=== APPEND HISTORY AND REBUILD FOUNDATIONS ==="
node --input-type=module <<'NODE'
import { appendFinalizedDayToHistory } from './engine-v1/jobs/append-finalized-day-to-history.js';
import { buildHistoryReport } from './engine-v1/jobs/build-history-report.js';
import { rebuildIndexesForSeason } from './engine-v1/jobs/rebuild-indexes-for-season.js';
import { rebuildH2HFoundationFromCurrentHistory } from './engine-v1/jobs/rebuild-h2h-foundation-from-current-history.js';
import { buildStandingsDay } from './engine-v1/jobs/build-standings-day.js';
import { auditStandingsFoundation } from './engine-v1/jobs/audit-standings-foundation.js';
import { buildModelPriors } from './engine-v1/jobs/build-model-priors.js';
import { validateHistoryIndexFoundationSync, validateH2HFoundationSync, validateModelPriorsFoundationSync } from './engine-v1/core/derived-history-foundation.js';
const season='2026-2027';
const a=await appendFinalizedDayToHistory('2026-09-13');
if(a?.ok!==true||a?.rowsWritten!==411) throw new Error('append:'+JSON.stringify(a));
const report=buildHistoryReport(season);
if(report?.byDay?.['2026-09-13']!==411) throw new Error('report:'+JSON.stringify(report));
const idx=await rebuildIndexesForSeason('2026-09-13');
const idxv=validateHistoryIndexFoundationSync(season);
if(idx?.ok!==true||idxv?.ok!==true) throw new Error('indexes:'+JSON.stringify({idx,idxv}));
const h=rebuildH2HFoundationFromCurrentHistory();
const hv=validateH2HFoundationSync();
if(h?.ok!==true||hv?.ok!==true) throw new Error('h2h:'+JSON.stringify({h,hv}));
const st=await buildStandingsDay('2026-09-15',[],{season});
const sta=auditStandingsFoundation({season});
if(st?.ok!==true||sta?.ok!==true) throw new Error('standings:'+JSON.stringify({st,sta}));
const mp=await buildModelPriors({targetSeason:season});
const mpv=validateModelPriorsFoundationSync(season);
if(mp?.ok!==true||mpv?.ok!==true) throw new Error('priors:'+JSON.stringify({mp,mpv}));
console.log(JSON.stringify({historyRows:a.rowsWritten,indexes:idx.ok,h2h:h.ok,standings:st.ok,priors:mp.ok},null,2));
NODE

echo "=== FINAL INVARIANTS ==="
git ls-files 'data/value/**' 'data/value-plans/**' 'data/value-comparison/**' 'data/deploy-snapshots/*/value.json' 'data/deploy-snapshots/*/value-audit.json' | sort -u | while read -r f; do test -n "$f" && sha256sum "$f"; done > /tmp/value-after.sha256
diff -u /tmp/value-before.sha256 /tmp/value-after.sha256
node --input-type=module <<'NODE'
import fs from 'node:fs';
import { buildHistoryDayFromTruth } from './engine-v1/jobs/append-finalized-day-to-history.js';
const c=JSON.parse(fs.readFileSync('data/canonical-fixtures/2026-09-13/caf.confed.json','utf8'));
const row=c.fixtures.find(x=>x.canonicalId==='cid_cafconfed_rukinzo_durbancity_20260913');
if(!row||row.status!=='FT'||row.scoreHome!==1||row.scoreAway!==2) throw new Error(JSON.stringify(row));
if(row?.verifiedFinalCanonicalConvergence?.guarantees?.heuristicIdentity!==false||row?.verifiedFinalCanonicalConvergence?.guarantees?.elapsedTimeInference!==false) throw new Error('unsafe guarantees');
const p=buildHistoryDayFromTruth('2026-09-13');
if(p.ok!==true||p.acceptedRows!==411) throw new Error(JSON.stringify(p));
const r=JSON.parse(fs.readFileSync('data/history/2026-2027.report.json','utf8'));
if(r.byDay?.['2026-09-13']!==411) throw new Error(JSON.stringify(r.byDay));
NODE
git diff --check

echo "=== VERIFY WRITE SET ==="
BAD="$(git status --porcelain | sed -E 's/^.. //' | sed -E 's#^"|"$##' | grep -Ev '^(\.github/workflows/tmp-verified-final-canonical-convergence-20260915\.yml$|tools/tmp-verified-final-canonical-convergence-20260915\.sh$|engine-v1/jobs/promote-verified-final-truth-to-canonical-day\.js$|engine-v1/jobs/run-daily-cycle\.js$|engine-v1/tests/verified-final-canonical-convergence\.test\.js$|engine-v1/tests/daily-history-verified-final-convergence\.test\.js$|data/canonical-fixtures/2026-09-13/caf\.confed\.json$|data/history/2026-2027(\.report)?\.json$|data/history-index/|data/h2h/|data/h2h-foundation/|data/standings/|data/model-priors/)' || true)"
if [ -n "$BAD" ]; then echo "$BAD"; exit 1; fi
REMOTE="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
test "$REMOTE" = "$BASE_SHA"

echo "=== BUILD CLEAN RELEASE COMMIT ==="
git reset --mixed "$BASE_SHA"
rm -f "$TMP_WORKFLOW" "$TMP_SCRIPT"
git add engine-v1/jobs/promote-verified-final-truth-to-canonical-day.js engine-v1/jobs/run-daily-cycle.js engine-v1/tests/verified-final-canonical-convergence.test.js engine-v1/tests/daily-history-verified-final-convergence.test.js data/canonical-fixtures/2026-09-13/caf.confed.json data/history/2026-2027.json data/history/2026-2027.report.json data/history-index data/h2h data/h2h-foundation data/standings data/model-priors
test -z "$(git diff --cached --name-only | grep -E '^(data/value/|data/value-plans/|data/value-comparison/|data/deploy-snapshots/.*/value(-audit)?\.json$)' || true)"
git diff --cached --check
git config user.name matchlab-repair
git config user.email matchlab-repair@users.noreply.github.com
git commit -m "Converge verified final truth into recent history"
RELEASE_SHA="$(git rev-parse HEAD)"
RELEASE_TREE="$(git rev-parse HEAD^{tree})"
test "$(git rev-parse HEAD^)" = "$BASE_SHA"
REMOTE="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
test "$REMOTE" = "$BASE_SHA"
git push origin "$RELEASE_SHA:refs/heads/$RELEASE_BRANCH"
printf '{"baseSha":"%s","releaseSha":"%s","releaseTree":"%s","repairDay":"%s","historyRows":411,"exactProviderIdentity":true,"heuristicIdentity":false,"elapsedTimeInference":false,"valueBytesUnchanged":true,"mainUpdatedByWorkflow":false}\n' "$BASE_SHA" "$RELEASE_SHA" "$RELEASE_TREE" "$REPAIR_DAY" > /tmp/release-evidence.json
cat /tmp/release-evidence.json
