// Conservative ownership proof for a declared checkpoint DAG.
// Output paths cannot be silently shared, and reading a prior stage output
// requires that precise stage ID as an explicitly hashed dependency.
import {validateGraph} from "./daily-resume-contract.mjs";
export const STAGE20_DAG_OWNERSHIP_SCHEMA="ai-matchlab.daily-stage-dag-ownership.v1";
function check(condition,code){if(!condition)throw Error(code);}
export function validateStage20DAGOutputOwnership(stages) {
  validateGraph(stages);
  const owner=new Map();
  for(const stage of stages) {
    check(stage.id && Array.isArray(stage.inputs) && Array.isArray(stage.outputs),
      "stage20_ownership_shape_invalid");
    for(const p of stage.outputs) {
      check(!owner.has(p),"stage20_output_owned_by_multiple_stages");
      owner.set(p,stage.id);
    }
  }
  for(const stage of stages) {
    const inputs=new Set();
    for(const input of stage.inputs) {
      check(!inputs.has(input),"stage20_duplicate_input");
      inputs.add(input);
      const producer=owner.get(input);
      if(producer) {
        check(producer!==stage.id,"stage20_inplace_output_forbidden");
        check(stage.dependsOn.includes(producer),
          "stage20_unbound_input_producer_dependency");
      }
    }
    // All dependency stages must actually contribute an identified artifact;
    // speculative edges do not make an undeclared data read trustworthy.
    for(const d of stage.dependsOn)
      check(stage.inputs.some(input=>owner.get(input)===d),
        "stage20_dependency_without_declared_input");
  }
  return {schema:STAGE20_DAG_OWNERSHIP_SCHEMA,
    stageCount:stages.length,outputPathCount:owner.size,
    pathOwnershipShapeVerified:true,stageInputDependencyShapeVerified:true,
    // This is static contract shape ONLY, not bytes/source/FT freshness.
    outputBytesVerified:false,sourceCompatibilityVerified:false,
    resumeAuthorized:false,publicationAuthorized:false};
}
