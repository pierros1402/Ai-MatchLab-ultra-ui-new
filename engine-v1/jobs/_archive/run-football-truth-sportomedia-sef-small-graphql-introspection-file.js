import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-small-graphql-introspection-${today}`);
const outPath = path.join(outDir, `sportomedia-sef-small-graphql-introspection-${today}.json`);
const rowsPath = path.join(outDir, `sportomedia-sef-small-graphql-introspection-rows-${today}.jsonl`);

function rel(p){ return path.relative(root, p).replaceAll("\\", "/"); }
function shaText(s){ return crypto.createHash("sha256").update(String(s ?? "")).digest("hex"); }

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const endpoint = "https://gql.sportomedia.se/graphql";
const query = `query IntrospectionQuery {
  __schema {
    queryType {
      fields {
        name
        args {
          name
          type { kind name ofType { kind name ofType { kind name } } }
        }
      }
    }
  }
}`;

let rows = [];
let fetchStatus = null;
let graphQlErrorCount = 0;
let responseSha256 = null;

if (allowFetch) {
  const body = JSON.stringify({ operationName: "IntrospectionQuery", query, variables: {} });
  const r = spawnSync("curl.exe", [
    "--location", "--ipv4", "--http1.1",
    "--connect-timeout", "5", "--max-time", "18", "--max-filesize", "4000000",
    "--silent", "--show-error",
    "--request", "POST",
    "--header", "Content-Type: application/json",
    "--header", "Origin: https://allsvenskan.se",
    "--header", "Referer: https://allsvenskan.se/tabell",
    "--data", body,
    endpoint
  ], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });

  fetchStatus = r.status;
  responseSha256 = shaText(r.stdout);

  try {
    const json = JSON.parse(r.stdout || "{}");
    graphQlErrorCount = Array.isArray(json.errors) ? json.errors.length : 0;
    const fields = json?.data?.__schema?.queryType?.fields || [];
    rows = fields
      .filter(f => /match|fixture|game|round|schedule|league|season|standing/i.test(f.name))
      .map(f => ({
        fieldName: f.name,
        args: (f.args || []).map(a => ({
          name: a.name,
          type: a.type?.name || a.type?.ofType?.name || a.type?.ofType?.ofType?.name || a.type?.kind || null
        })),
        fixtureCandidate: /match|fixture|game|round|schedule/i.test(f.name),
        standingsCandidate: /standing/i.test(f.name)
      }))
      .sort((a,b) => Number(b.fixtureCandidate) - Number(a.fixtureCandidate) || a.fieldName.localeCompare(b.fieldName));
  } catch (e) {
    blocks.push(`json_parse_failed:${String(e.message || e)}`);
  }
}

if (fetchStatus !== 0) blocks.push(`curl_failed_${fetchStatus}`);
if (graphQlErrorCount > 0) blocks.push(`graphql_errors_${graphQlErrorCount}`);
if (!rows.some(r => r.standingsCandidate)) blocks.push("standings_field_not_seen");
if (!rows.some(r => r.fixtureCandidate)) blocks.push("fixture_candidate_field_not_seen");

const report = {
  status: blocks.length === 0 ? "passed" : "needs_followup",
  runner: "sportomedia_sef_small_graphql_introspection",
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  endpoint,
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: allowFetch ? 1 : 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    fixtureFetchExecutedNowCount: 0,
    restartDateFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    fetchStatus,
    graphQlErrorCount,
    responseSha256,
    selectedFieldCount: rows.length,
    fixtureCandidateFieldCount: rows.filter(r => r.fixtureCandidate).length,
    standingsCandidateFieldCount: rows.filter(r => r.standingsCandidate).length,
    readyForFixtureProbe: rows.some(r => r.fixtureCandidate),
    acceptedNowCount: 0
  },
  rows,
  blocks
};

await fs.writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
await fs.writeFile(rowsPath, rows.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  topRows: rows.slice(0, 30),
  blocks: report.blocks
}, null, 2));

if (blocks.some(b => b.startsWith("curl_failed") || b.startsWith("json_parse_failed"))) process.exitCode = 1;
