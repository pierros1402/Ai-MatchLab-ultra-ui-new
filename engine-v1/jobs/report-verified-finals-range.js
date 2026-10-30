import { auditVerifiedFinalsRange } from "./audit-verified-finals-range.js";

// Read-only CLI. Exit nonzero when source days are absent, invalid or conflicting.
// No files are created or changed; operators retain the JSON output as evidence.
const [fromDay,throughDay]=process.argv.slice(2);
if (!fromDay || !throughDay) {
  console.error("usage: node engine-v1/jobs/report-verified-finals-range.js YYYY-MM-DD YYYY-MM-DD");
  process.exitCode=2;
} else {
  try {
    const result=auditVerifiedFinalsRange({root:process.cwd(),fromDay,throughDay});
    console.log(JSON.stringify(result,null,2));
    if (!result.ok) process.exitCode=1;
  } catch(error) {
    console.error(JSON.stringify({ok:false,readOnly:true,error:String(error?.message||error)}));
    process.exitCode=2;
  }
}
