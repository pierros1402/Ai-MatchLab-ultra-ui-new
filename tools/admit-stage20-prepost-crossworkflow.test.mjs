import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectPinnedInterworkflowProducer,PINNED_INTERWORKFLOW_PRODUCER as p
} from "./admit-stage20-prepost-crossworkflow.mjs";
const NOW="2026-11-23T15:20:00.000Z";
function fixture() {
  return {
    run:{id:p.runId,run_attempt:p.attempt,repository:{id:p.repositoryId,full_name:p.repository},
      head_repository:{id:p.repositoryId,full_name:p.repository},head_sha:p.commit,
      path:p.workflowPath,event:p.event,status:"completed",conclusion:"success"},
    artifact:{id:p.artifactId,name:p.artifactName,digest:p.digest,expired:false,
      workflow_run:{id:p.runId,repository_id:p.repositoryId,head_sha:p.commit},
      size_in_bytes:5000,created_at:"2026-11-23T14:57:45Z",
      expires_at:"2026-11-24T14:57:45Z"}
  };
}
test("exact pinned synthetic source and artifact are download-admissible only",()=>{
  const {run,artifact}=fixture(),v=inspectPinnedInterworkflowProducer(run,artifact,NOW);
  assert.equal(v.downloadAdmissible,true);
  assert.equal(v.resumeAuthorized,false);
  assert.equal(v.publicationAuthorized,false);
});
test("producer SHA drift denied",()=>{const x=fixture();x.run.head_sha="b".repeat(40);
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,NOW).downloadAdmissible,false);
});
test("foreign repository denied",()=>{const x=fixture();x.run.repository.id=222;
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,NOW).downloadAdmissible,false);
});
test("artifact digest drift denied",()=>{const x=fixture();x.artifact.digest="sha256:"+"0".repeat(64);
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,NOW).downloadAdmissible,false);
});
test("artifact source-run SHA mismatch denied",()=>{const x=fixture();x.artifact.workflow_run.head_sha="a".repeat(40);
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,NOW).downloadAdmissible,false);
});
test("nonterminal source denied",()=>{const x=fixture();x.run.status="in_progress";
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,NOW).downloadAdmissible,false);
});
test("expired and future artifact timestamps denied",()=>{const x=fixture();
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,"2026-11-25T00:00:00Z").downloadAdmissible,false);
  assert.equal(inspectPinnedInterworkflowProducer(x.run,x.artifact,"2026-11-23T10:00:00Z").downloadAdmissible,false);
});
