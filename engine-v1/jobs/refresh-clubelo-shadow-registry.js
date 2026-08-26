import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

const SOURCE_URL = "https://clubelo.com/Ranking";

function clean(value) {
  return String(value ?? "").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function writeBufferAtomic(filePath, bytes) {
  ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filePath);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

export function parseClubEloTop100(html) {
  const source = String(html || "");
  const rowPattern = /<tr><td class="l"><a href="\/([A-Z]{3})"><img\b[^>]*><\/a>\s*<span class="min481"><small>\s*(\d+)\s*<\/small><\/span>\s*<a href="\/([^"?#]+)"><span class="NonAst">([^<]*)<\/span><span class="Ast">([^<]*)<\/span><\/a><\/td><td class="r">(\d{3,4})<\/td><\/tr>/gu;
  const byRank = new Map();
  let match;
  while ((match = rowPattern.exec(source)) !== null) {
    const rank = Number(match[2]);
    if (rank < 1 || rank > 100) continue;
    const row = {
      rank,
      federation: match[1],
      slug: decodeHtml(match[3]),
      code: decodeHtml(match[4]),
      name: decodeHtml(match[5]),
      elo: Number(match[6])
    };
    assert(!byRank.has(rank), `clubelo_duplicate_rank:${rank}`);
    byRank.set(rank, row);
  }
  const rows = Array.from(byRank.values()).sort((left, right) => left.rank - right.rank);
  assert(rows.length === 100, `clubelo_top100_count_invalid:${rows.length}`);
  rows.forEach((row, index) => {
    assert(row.rank === index + 1, `clubelo_rank_sequence_invalid:${row.rank}`);
    assert(row.slug && row.federation && Number.isFinite(row.elo), `clubelo_row_invalid:${row.rank}`);
  });
  assert(new Set(rows.map(row => row.slug)).size === 100, "clubelo_duplicate_top100_slug");
  const snapshotAsOf = source.match(/<h1><a href="\/(\d{4}-\d{2}-\d{2})\/Ranking">/u)?.[1] || null;
  const pageCreatedOn = source.match(/Page created on ([^<]+)\.<\/small>/u)?.[1] || null;
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(clean(snapshotAsOf)), "clubelo_snapshot_as_of_missing");
  return { rows, snapshotAsOf, pageCreatedOn };
}

function registryKey(slug, federation) {
  return `${clean(slug)}\u001f${clean(federation)}`;
}

export function applyClubEloSnapshotToRegistry({ registry, parsed, retrievedUtc, rawSha256, sourceUrl = SOURCE_URL }) {
  assert(Number.isFinite(Date.parse(retrievedUtc)), "clubelo_retrieved_utc_invalid");
  assert(registry?.accounting?.total === 48 && Array.isArray(registry.registry) && registry.registry.length === 48, "identity_registry_not_verified_48");
  const rowsByKey = new Map(parsed.rows.map(row => [registryKey(row.slug, row.federation), row]));
  const missing = [];
  const updatedRows = registry.registry.map(identity => {
    assert(identity.federationAgreement === true, `identity_federation_unverified:${identity.projectId}`);
    const row = rowsByKey.get(registryKey(identity.clubeloSlug, identity.clubeloFederation));
    if (!row) {
      missing.push({ projectId: identity.projectId, slug: identity.clubeloSlug, federation: identity.clubeloFederation });
      return identity;
    }
    return {
      ...identity,
      clubeloName: row.name,
      clubeloElo: row.elo,
      clubeloRank: row.rank,
      eloRetrievedAt: retrievedUtc,
      eloSnapshotAsOf: parsed.snapshotAsOf,
      eloRawSha256: rawSha256
    };
  });
  return {
    ...registry,
    source: {
      ...registry.source,
      sourceUrl,
      latestRefreshRetrievedAt: retrievedUtc,
      latestRefreshSnapshotAsOf: parsed.snapshotAsOf,
      latestRefreshPageCreatedOn: parsed.pageCreatedOn,
      latestRefreshRawSha256: rawSha256,
      latestRefreshCoverage: {
        verifiedRegistryTotal: registry.registry.length,
        updated: registry.registry.length - missing.length,
        retainedWithPreviousSnapshot: missing.length,
        missing: missing.map(item => item.slug).sort()
      }
    },
    registry: updatedRows
  };
}

export async function refreshClubEloShadowRegistry(options) {
  const dayKey = clean(options.dayKey);
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(dayKey), `invalid_day_key:${dayKey}`);
  const registryFile = options.registryFile;
  const snapshotDir = options.snapshotDir || resolveDataPath("plan-c-shadow", "clubelo-snapshots");
  const auditFile = options.auditFile || resolveDataPath("plan-c-shadow", "clubelo-refresh", "_audit", `${dayKey}.json`);
  assert(registryFile && fs.existsSync(registryFile), "identity_registry_missing");
  const timeoutMs = Number(options.timeoutMs ?? 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await (options.fetchImpl || fetch)(SOURCE_URL, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "AI-MatchLab-Plan-C-Shadow/1.0" }
    });
  } finally {
    clearTimeout(timeout);
  }
  assert(response?.ok === true, `clubelo_http_status:${response?.status ?? "unknown"}`);
  const contentType = clean(response.headers?.get?.("content-type"));
  assert(contentType.toLowerCase().includes("text/html"), `clubelo_content_type_invalid:${contentType}`);
  const html = await response.text();
  const rawBytes = Buffer.from(html, "utf8");
  assert(rawBytes.length > 100000, `clubelo_response_too_small:${rawBytes.length}`);
  const retrievedUtc = clean(options.retrievedUtc || new Date().toISOString());
  const parsed = parseClubEloTop100(html);
  const rawSha256 = sha256(rawBytes);
  const registry = readJson(registryFile);
  const updatedRegistry = applyClubEloSnapshotToRegistry({
    registry,
    parsed,
    retrievedUtc,
    rawSha256,
    sourceUrl: clean(response.url) || SOURCE_URL
  });
  const token = retrievedUtc.replace(/[-:.]/gu, "");
  const rawRelative = `${token}-${rawSha256.slice(0, 16)}.html.gz`;
  const parsedRelative = `${token}-${rawSha256.slice(0, 16)}.top100.json`;
  const rawFile = path.join(snapshotDir, rawRelative);
  const parsedFile = path.join(snapshotDir, parsedRelative);
  writeBufferAtomic(rawFile, zlib.gzipSync(rawBytes, { level: 9 }));
  writeJsonAtomic(parsedFile, {
    schema: "ai-matchlab.clubelo-shadow-top100.v1",
    sourceUrl: SOURCE_URL,
    finalUrl: clean(response.url) || SOURCE_URL,
    retrievedUtc,
    snapshotAsOf: parsed.snapshotAsOf,
    pageCreatedOn: parsed.pageCreatedOn,
    rawSha256,
    rawBytes: rawBytes.length,
    count: parsed.rows.length,
    rows: parsed.rows
  });
  writeJsonAtomic(registryFile, updatedRegistry);
  const audit = {
    schema: "ai-matchlab.clubelo-shadow-refresh-audit.v1",
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    mode: "SHADOW",
    productionEligible: false,
    sourceUrl: SOURCE_URL,
    finalUrl: clean(response.url) || SOURCE_URL,
    httpStatus: response.status,
    contentType,
    retrievedUtc,
    snapshotAsOf: parsed.snapshotAsOf,
    pageCreatedOn: parsed.pageCreatedOn,
    rawSha256,
    rawBytes: rawBytes.length,
    rawSnapshot: path.posix.join("data", "plan-c-shadow", "clubelo-snapshots", rawRelative),
    parsedSnapshot: path.posix.join("data", "plan-c-shadow", "clubelo-snapshots", parsedRelative),
    parsedCount: parsed.rows.length,
    registryCount: updatedRegistry.registry.length,
    registryRefreshCoverage: updatedRegistry.source.latestRefreshCoverage,
    registrySha256: sha256(fs.readFileSync(registryFile)),
    officialPlansUnaffected: true
  };
  writeJsonAtomic(auditFile, audit);
  return { registry: updatedRegistry, parsed, audit, rawFile, parsedFile, auditFile };
}

export function writeClubEloRefreshFailureAudit({ dayKey, auditFile, error }) {
  const payload = {
    schema: "ai-matchlab.clubelo-shadow-refresh-audit.v1",
    ok: false,
    date: clean(dayKey),
    generatedAt: new Date().toISOString(),
    mode: "SHADOW",
    productionEligible: false,
    sourceUrl: SOURCE_URL,
    status: "SOURCE_UNAVAILABLE_OR_CONTRACT_INVALID",
    error: clean(error?.message || error),
    action: "RETAIN_LAST_VERIFIED_REGISTRY",
    officialPlansUnaffected: true
  };
  writeJsonAtomic(auditFile, payload);
  return payload;
}

export function parseClubEloRefreshCli(argv = process.argv.slice(2)) {
  const out = { dayKey: null, registryFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = clean(argv[index]);
    if (!out.dayKey && /^\d{4}-\d{2}-\d{2}$/u.test(arg)) { out.dayKey = arg; continue; }
    const next = () => { index += 1; const value = clean(argv[index]); if (!value) throw new Error(`missing_value_for:${arg}`); return value; };
    if (arg === "--registry") out.registryFile = next();
    else if (arg === "--snapshot-dir") out.snapshotDir = next();
    else if (arg === "--audit") out.auditFile = next();
    else if (arg === "--timeout-ms") out.timeoutMs = Number(next());
    else throw new Error(`unknown_argument:${arg}`);
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseClubEloRefreshCli();
  const auditFile = args.auditFile || resolveDataPath("plan-c-shadow", "clubelo-refresh", "_audit", `${clean(args.dayKey)}.json`);
  try {
    assert(args.dayKey, "missing_day_key");
    assert(args.registryFile, "missing_registry");
    const result = await refreshClubEloShadowRegistry({ ...args, auditFile });
    console.log(JSON.stringify({ ok: true, mode: "SHADOW", date: args.dayKey, retrievedUtc: result.audit.retrievedUtc, snapshotAsOf: result.audit.snapshotAsOf, count: result.audit.parsedCount }, null, 2));
  } catch (error) {
    writeClubEloRefreshFailureAudit({ dayKey: args.dayKey, auditFile, error });
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}
