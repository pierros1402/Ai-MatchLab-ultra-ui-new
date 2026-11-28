import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { buildProviderFixtureCoverage } from "../core/provider-fixture-coverage.js";
import { discoverProviderCompetitionsDay } from "./discover-provider-competitions-day.js";
import { resolveDataPath } from "../storage/data-root.js";

const read = file => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};
const files = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort() : [];

// Independent provider read only. Never writes canonical truth or publication.
export async function auditProviderFixtureIdentityDay(dayKey = athensDayKey()) {
  const discovery = await discoverProviderCompetitionsDay(dayKey, { write: false });
  const canonicalDirectory = resolveDataPath("canonical-fixtures", dayKey);
  const snapshotDirectory = resolveDataPath("deploy-snapshots", dayKey);
  const detailsDirectory = path.join(snapshotDirectory, "details");
  const report = buildProviderFixtureCoverage({
    dayKey,
    discovery: discovery.artifact || { ok: false, dayKey },
    canonicalFixtures: files(canonicalDirectory)
      .flatMap(f => read(path.join(canonicalDirectory, f))?.fixtures || []),
    publishedFixtures: read(path.join(snapshotDirectory, "fixtures.json"))?.fixtures || [],
    publishedDetails: files(detailsDirectory).map(f => {
      const detail = read(path.join(detailsDirectory, f));
      return detail && { ...detail, fileCanonicalId: path.basename(f, ".json") };
    }).filter(Boolean)
  });
  report.sourceSha = process.env.GITHUB_SHA || null;
  return { report, discovery: discovery.artifact };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dayKey = process.argv[2] || athensDayKey();
  const outputDirectory = process.argv[3];
  if (!outputDirectory) throw new Error("audit_output_directory_required");
  const result = await auditProviderFixtureIdentityDay(dayKey);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "provider-fixture-coverage.json"), JSON.stringify(result.report, null, 2));
  fs.writeFileSync(path.join(outputDirectory, "competition-discovery.json"), JSON.stringify(result.discovery, null, 2));
  const reasons = {};
  for (const issue of result.report.issues) reasons[issue.reasonCode] = (reasons[issue.reasonCode] || 0) + 1;
  console.log(JSON.stringify({ dayKey, ok: result.report.ok, summary: result.report.summary,
    reasons, sampleIssues: result.report.issues.slice(0, 20) }, null, 2));
}
