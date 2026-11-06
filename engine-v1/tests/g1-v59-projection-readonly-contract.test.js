
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const producer=fs.readFileSync(
  path.resolve(here,"../jobs/build-value-plan-comparison-day.js"),"utf8"
);

test("G1 V59 production refresh requires explicit write authorization",()=>{
  const functionStart=producer.indexOf(
    "export function buildValuePlanComparisonDay("
  );
  assert.ok(functionStart>=0);
  const body=producer.slice(functionStart);
  const guard=body.indexOf("if(options.write===true){");
  const refresh=body.indexOf(
    "const result=refreshUnifiedProductionProjection(dayKey);"
  );
  const readOnly=body.indexOf(
    "}else if(fs.existsSync(productionFile)){"
  );
  assert.ok(guard>=0 && refresh>guard && readOnly>refresh);
  assert.equal(
    body.slice(functionStart===-1?0:0,guard).includes(
      "refreshUnifiedProductionProjection(dayKey)"
    ),false
  );
  assert.match(
    body.slice(readOnly,readOnly+220),
    /readVerifiedProductionPlan\(productionFile,dayKey\)/
  );
});
