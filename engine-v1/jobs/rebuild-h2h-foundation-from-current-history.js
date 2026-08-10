/**
 * Rebuild production H2H artifacts from the current history store and bind
 * them to an explicit derived-history foundation artifact.
 *
 * The H2H JSON files alone are not publication-ready: Details validates
 * data/h2h-foundation/current.json against both current history and H2H output.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import {
  buildH2HArtifactsFromHistory,
  materializeH2HArtifacts,
} from "./rebuild-h2h-index-from-identity-resolved-history.js";
import {
  writeH2HFoundationSync,
  validateH2HFoundationSync,
} from "../core/derived-history-foundation.js";

const __filename = fileURLToPath(import.meta.url);

export function loadCurrentHistoryDocuments(historyRoot = resolveDataPath("history")) {
  if (!fs.existsSync(historyRoot)) return [];
  const docs = [];
  for (const name of fs.readdirSync(historyRoot)
    .filter(name => /^\d{4}-\d{4}\.json$/u.test(name))
    .sort()) {
    const file = path.join(historyRoot, name);
    docs.push(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  return docs;
}

export function rebuildH2HFoundationFromCurrentHistory({
  historyDocuments = null,
  outputRoot = resolveDataPath("h2h"),
  writeFoundation = true,
} = {}) {
  const docs = Array.isArray(historyDocuments)
    ? historyDocuments
    : loadCurrentHistoryDocuments();
  if (!docs.length) throw new Error("h2h_current_history_documents_missing");

  const build = buildH2HArtifactsFromHistory({ historyDocuments: docs });
  if (!build?.ok) throw new Error(`h2h_current_history_build_failed:${JSON.stringify(build)}`);

  const materialized = materializeH2HArtifacts({
    build,
    outputRoot,
    replace: true,
  });
  if (!materialized?.ok) throw new Error(`h2h_current_history_materialize_failed:${JSON.stringify(materialized)}`);

  let foundation = null;
  let validation = null;
  if (writeFoundation) {
    if (path.resolve(outputRoot) !== path.resolve(resolveDataPath("h2h"))) {
      throw new Error("h2h_foundation_requires_production_output_root");
    }
    foundation = writeH2HFoundationSync();
    validation = validateH2HFoundationSync();
    if (!validation?.ok) {
      throw new Error(`h2h_foundation_validation_failed:${validation?.reason || "unknown"}`);
    }
  }

  return {
    ok: true,
    status: "PASS_H2H_CURRENT_HISTORY_FOUNDATION_REBUILT",
    historyDocumentCount: docs.length,
    artifactCount: build.artifactCount ?? build.artifacts?.length ?? 0,
    materialized,
    foundation,
    validation,
  };
}

function parseArgs(argv) {
  return {
    noFoundation: argv.includes("--no-foundation"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = rebuildH2HFoundationFromCurrentHistory({
      writeFoundation: !args.noFoundation,
    });
    console.log(JSON.stringify({
      ok: result.ok,
      status: result.status,
      historyDocumentCount: result.historyDocumentCount,
      artifactCount: result.artifactCount,
      foundationFingerprint: result.foundation?.foundationFingerprint || null,
      validationOk: result.validation?.ok ?? null,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
    process.exitCode = 1;
  }
}
