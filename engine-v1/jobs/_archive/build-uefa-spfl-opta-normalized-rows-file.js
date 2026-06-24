#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
};

const scriptFetchOut = getArg("--script-fetch-out");
const mappingOut = getArg("--mapping-out");
const decoderFetchOut = getArg("--decoder-fetch-out");
const outputPath = getArg("--output");
const timeoutMs = Number(getArg("--timeout-ms") || 20000);

if (!scriptFetchOut) throw new Error("missing --script-fetch-out");
if (!mappingOut) throw new Error("missing --mapping-out");
if (!decoderFetchOut) throw new Error("missing --decoder-fetch-out");
if (!outputPath) throw new Error("missing --output");

const scriptFetched = JSON.parse(fs.readFileSync(scriptFetchOut, "utf8"));
const mapping = JSON.parse(fs.readFileSync(mappingOut, "utf8"));
const decoderFetched = JSON.parse(fs.readFileSync(decoderFetchOut, "utf8"));

if (scriptFetched.ok !== true) throw new Error("scriptFetched ok was not true");
if (mapping.ok !== true) throw new Error("mapping ok was not true");
if (decoderFetched.ok !== true) throw new Error("decoderFetched ok was not true");

const asText = (value) => value == null ? "" : String(value);

const runtimeSnap = (scriptFetched.fetchedSourceSnapshots || []).find((row) =>
  row.sourceFamily === "spfl_opta_widget" &&
  /v3\.opta-widgets\.js/i.test(asText(row.finalUrl || row.candidateUrl))
);

if (!runtimeSnap) throw new Error("Missing fetched Opta runtime snapshot");

const runtimeBody = asText(runtimeSnap.rawText || runtimeSnap.plainText);
if (!runtimeBody) throw new Error("Opta runtime body empty");

const extractStringValueNear = (body, key) => {
  const patterns = [
    new RegExp(`${key}\\s*:\\s*"([^"]+)"`, "i"),
    new RegExp(`${key}\\s*:\\s*'([^']+)'`, "i"),
    new RegExp(`\\.${key}\\s*=\\s*"([^"]+)"`, "i"),
    new RegExp(`\\.${key}\\s*=\\s*'([^']+)'`, "i")
  ];

  for (const re of patterns) {
    const m = body.match(re);
    if (m) return m[1];
  }

  return "";
};

const omoUser = extractStringValueNear(runtimeBody, "omo_username");
const omoPsw = extractStringValueNear(runtimeBody, "omo_password");

if (!omoUser || !omoPsw) {
  throw new Error("Could not extract runtime OMO credentials from fetched Opta runtime");
}

const findMatchingBrace = (text, openIndex) => {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (lineComment) {
      if (ch === "\n" || ch === "\r") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
};

const extractWebpackModuleBody = (bundle, marker) => {
  const markerIndex = bundle.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing module marker: ${marker}`);

  const openIndex = bundle.indexOf("{", markerIndex);
  if (openIndex < 0) throw new Error(`Missing module open brace: ${marker}`);

  const closeIndex = findMatchingBrace(bundle, openIndex);
  if (closeIndex < 0) throw new Error(`Missing module close brace: ${marker}`);

  return bundle.slice(openIndex + 1, closeIndex);
};

const teajsModuleBody = extractWebpackModuleBody(
  runtimeBody,
  '"./manual_vendor/teajs/jquery.teajs-2.23.js"'
);

const loadTeaDecrypt = () => {
  const jquery = { fn: {} };
  const module = { exports: {} };
  const fakeRequire = () => jquery;
  const fakeWindow = { jQuery: jquery, $: jquery };

  const fn = new Function("e", "t", "n", "jQuery", "$", "window", teajsModuleBody);
  fn(module, module.exports, fakeRequire, jquery, jquery, fakeWindow);

  const decrypt = jquery?.teajs?.decrypt;
  if (typeof decrypt !== "function") throw new Error("Could not expose jquery.teajs.decrypt");

  return decrypt;
};

const decrypt = loadTeaDecrypt();
const key = "P!Fgob$*LKDF D)(F IDD&P?/";

const fetchText = async (url, referer = "https://spfl.co.uk/") => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/javascript, application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-GB,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": referer,
        "Origin": "https://spfl.co.uk",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
      },
      redirect: "follow",
      signal: controller.signal
    });

    const rawText = await response.text();
    clearTimeout(timer);

    return {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      finalUrl: response.url,
      rawText
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      status: 0,
      ok: false,
      contentType: "",
      finalUrl: "",
      rawText: "",
      error: String(error?.message || error)
    };
  }
};

class BinReader {
  constructor(binaryString) {
    this.buf = Buffer.alloc(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      this.buf[i] = binaryString.charCodeAt(i) & 255;
    }
    this._offset = 0;
    this._littleEndian = false;
  }

  tell() { return this._offset; }

  getInt8(offset) {
    if (offset !== undefined) this._offset = offset;
    const value = this.buf.readInt8(this._offset);
    this._offset += 1;
    return value;
  }

  getUint8(offset) {
    if (offset !== undefined) this._offset = offset;
    const value = this.buf.readUInt8(this._offset);
    this._offset += 1;
    return value;
  }

  getInt16(offset, littleEndian = this._littleEndian) {
    if (offset !== undefined) this._offset = offset;
    const value = littleEndian ? this.buf.readInt16LE(this._offset) : this.buf.readInt16BE(this._offset);
    this._offset += 2;
    return value;
  }

  getUint16(offset, littleEndian = this._littleEndian) {
    if (offset !== undefined) this._offset = offset;
    const value = littleEndian ? this.buf.readUInt16LE(this._offset) : this.buf.readUInt16BE(this._offset);
    this._offset += 2;
    return value;
  }

  getInt32(offset, littleEndian = this._littleEndian) {
    if (offset !== undefined) this._offset = offset;
    const value = littleEndian ? this.buf.readInt32LE(this._offset) : this.buf.readInt32BE(this._offset);
    this._offset += 4;
    return value;
  }

  getUint32(offset, littleEndian = this._littleEndian) {
    if (offset !== undefined) this._offset = offset;
    const value = littleEndian ? this.buf.readUInt32LE(this._offset) : this.buf.readUInt32BE(this._offset);
    this._offset += 4;
    return value;
  }

  getInt64(offset, littleEndian = this._littleEndian) {
    if (offset !== undefined) this._offset = offset;
    const value = littleEndian ? this.buf.readBigInt64LE(this._offset) : this.buf.readBigInt64BE(this._offset);
    this._offset += 8;
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : String(value);
  }
}

const createOptaStub = () => ({
  bin: {},
  _: {
    times: (count, fn) => {
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(fn(i));
      return out;
    },
    each: (obj, fn) => {
      if (Array.isArray(obj)) return obj.forEach((value, index) => fn(value, index));
      Object.keys(obj || {}).forEach((key) => fn(obj[key], key));
    }
  },
  binary: new Proxy({
    remap: new Proxy({
      f1Period: (value) => value,
      f1EventPeriod: (value) => value,
      f1MatchStatus: (value) => value,
      f1MatchType: (value) => value,
      f1ResultStatus: (value) => value,
      f1GroupName: (value) => value,
      f1GroupKey: (value) => value
    }, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (value) => value;
      }
    }),
    getGroup: (value) => String(value),
    getGroupKey: (value) => String(value),
    getGroupName: (value) => String(value),
    getPeriod: (value) => value,
    getPeriodName: (value) => String(value),
    getMatchStatus: (value) => value,
    getMatchType: (value) => value
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (value) => value;
    }
  })
});

const executeDecoderScript = (scriptText, Opta) => {
  const modules = {};
  const cache = {};

  const requireFn = (id) => {
    if (cache[id]) return cache[id].exports;
    if (!modules[id]) throw new Error(`Missing webpack module: ${id}`);

    const module = { exports: {} };
    cache[id] = module;
    modules[id](module, module.exports, requireFn);
    return module.exports;
  };

  requireFn.d = (exports, definition) => {
    for (const key of Object.keys(definition)) {
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: definition[key]
      });
    }
  };

  const windowStub = {
    webpackChunkOptaWidgetsV3: {
      push(chunk) {
        Object.assign(modules, chunk[1] || {});
        const runtime = chunk[2];
        if (typeof runtime === "function") runtime(requireFn);
      }
    }
  };

  new Function("window", "Opta", scriptText)(windowStub, Opta);
};

const decoderScripts = {};
for (const row of decoderFetched.decoderRows || []) {
  if (!row.decoderUrl || !row.decoderName) continue;
  const fetched = await fetchText(row.decoderUrl, "https://spfl.co.uk/");
  if (fetched.status !== 200) throw new Error(`Failed to fetch decoder ${row.decoderName}: ${fetched.status}`);
  decoderScripts[row.decoderName] = fetched.rawText;
}

const Opta = createOptaStub();

for (const [decoderName, scriptText] of Object.entries(decoderScripts)) {
  executeDecoderScript(scriptText, Opta);
  if (typeof Opta.bin[decoderName] !== "function") {
    throw new Error(`Decoder did not register Opta.bin.${decoderName}`);
  }
}

const buildFeedUrl = ({ comp, season, feedType }) =>
  `https://omo.akamai.opta.net/auth/competition.php?feed_type=${encodeURIComponent(feedType)}` +
  `&competition=${encodeURIComponent(comp)}` +
  `&season_id=${encodeURIComponent(season)}` +
  `&user=${encodeURIComponent(omoUser)}` +
  `&psw=${encodeURIComponent(omoPsw)}`;

const decodePacked = (rawText, expectedBaseName) => {
  const parsed = JSON.parse(rawText);
  const data = asText(parsed.data);
  const encryptedBinaryString = Buffer.from(data, "base64").toString("latin1");
  const decryptedString = asText(decrypt(encryptedBinaryString, key));
  const reader = new BinReader(decryptedString);
  reader._littleEndian = false;

  const firstByte = reader.getInt8();
  const decoderName = `${expectedBaseName}_${firstByte}`;
  const decoder = Opta.bin[decoderName];

  if (typeof decoder !== "function") throw new Error(`Missing decoder function ${decoderName}`);

  const decoded = decoder(reader);

  return {
    firstByte,
    decoderName,
    decoded,
    finalOffset: reader.tell(),
    byteLength: reader.buf.length
  };
};

const toIsoFromUnix = (value) => {
  if (value == null || value === "" || Number(value) === 0) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
};

const normalizeMatch = ({ competition, sourceUrl, match }) => {
  const home = match.home || (match.team || []).find((team) => team.side === "home") || null;
  const away = match.away || (match.team || []).find((team) => team.side === "away") || null;

  const hasHomeScore = home?.score !== null && home?.score !== undefined;
  const hasAwayScore = away?.score !== null && away?.score !== undefined;
  const isFinished = hasHomeScore && hasAwayScore && Number(match.period_id) >= 4;

  return {
    competition,
    providerFamily: "spfl_opta_widget",
    sourceFamily: "spfl_opta_widget",
    sourceUrl,
    sourceMatchId: String(match.id),
    matchday: match.matchday ?? null,
    status: isFinished ? "finished" : "scheduled",
    kickoff: toIsoFromUnix(match.date || match.dt),
    homeTeamId: home?.id != null ? String(home.id) : "",
    awayTeamId: away?.id != null ? String(away.id) : "",
    homeScore: hasHomeScore ? Number(home.score) : null,
    awayScore: hasAwayScore ? Number(away.score) : null,
    venueId: match.venue_id != null ? String(match.venue_id) : "",
    periodId: match.period_id ?? null,
    resultType: match.result_type ?? null,
    raw: match
  };
};

const latestStandingsRows = ({ competition, decoded }) => {
  const matchdays = Array.isArray(decoded.matchdays) ? decoded.matchdays : [];
  let selected = null;
  let selectedIndex = -1;
  let selectedPlayedSum = -1;

  for (let i = 0; i < matchdays.length; i += 1) {
    const groups = matchdays[i]?.undefined?.groups || [];
    const teams = groups.flatMap((group) => group.teams || []);
    const playedSum = teams.reduce((sum, team) => sum + Number(team.total_played || 0), 0);

    if (playedSum >= selectedPlayedSum) {
      selected = teams;
      selectedIndex = i;
      selectedPlayedSum = playedSum;
    }
  }

  return (selected || []).map((team) => ({
    competition,
    providerFamily: "spfl_opta_widget",
    sourceFamily: "spfl_opta_widget",
    source: "f36",
    matchdayIndex: selectedIndex + 1,
    teamId: String(team.id),
    position: team.position ?? null,
    played: team.total_played ?? null,
    won: team.total_won ?? null,
    drawn: team.total_drawn ?? null,
    lost: team.total_lost ?? null,
    goalsFor: team.total_for ?? null,
    goalsAgainst: team.total_against ?? null,
    points: team.total_points ?? null,
    pointsDeduction: team.points_deduction ?? 0,
    raw: team
  }));
};

const mapped = mapping.summary?.byCompetition || {};
const competitions = [
  {
    competition: "sco.1",
    comp: String(mapped["sco.1"]?.competitionId || ""),
    season: String(mapped["sco.1"]?.seasonId || ""),
    referer: "https://spfl.co.uk/league/premiership/fixtures"
  },
  {
    competition: "sco.2",
    comp: String(mapped["sco.2"]?.competitionId || ""),
    season: String(mapped["sco.2"]?.seasonId || ""),
    referer: "https://spfl.co.uk/league/championship/fixtures"
  }
];

for (const c of competitions) {
  if (!c.comp || !c.season) throw new Error(`Missing comp/season for ${c.competition}`);
}

const fixtureRows = [];
const resultRows = [];
const standingsRows = [];
const feedSummaries = [];

for (const c of competitions) {
  const matchUrl = buildFeedUrl({ ...c, feedType: "f1_packed" });
  const standingsUrl = buildFeedUrl({ ...c, feedType: "f36_packed" });

  const matchFetched = await fetchText(matchUrl, c.referer);
  const standingsFetched = await fetchText(standingsUrl, c.referer);

  if (matchFetched.status !== 200) throw new Error(`${c.competition} f1_packed status ${matchFetched.status}`);
  if (standingsFetched.status !== 200) throw new Error(`${c.competition} f36_packed status ${standingsFetched.status}`);

  const matchDecoded = decodePacked(matchFetched.rawText, "f1");
  const standingsDecoded = decodePacked(standingsFetched.rawText, "f36");

  if (matchDecoded.finalOffset !== matchDecoded.byteLength) {
    throw new Error(`${c.competition} f1 decoder did not consume full payload`);
  }

  if (standingsDecoded.finalOffset !== standingsDecoded.byteLength) {
    throw new Error(`${c.competition} f36 decoder did not consume full payload`);
  }

  const matches = matchDecoded.decoded.matches || [];
  const normalizedMatches = matches.map((match) =>
    normalizeMatch({
      competition: c.competition,
      sourceUrl: c.referer,
      match
    })
  );

  fixtureRows.push(...normalizedMatches);
  resultRows.push(...normalizedMatches.filter((row) => row.status === "finished"));
  standingsRows.push(...latestStandingsRows({ competition: c.competition, decoded: standingsDecoded.decoded }));

  feedSummaries.push({
    competition: c.competition,
    competitionId: Number(c.comp),
    seasonId: Number(c.season),
    f1: {
      decoderName: matchDecoded.decoderName,
      fixtureCount: matchDecoded.decoded.fixture_count,
      matchRows: matches.length,
      finishedRows: normalizedMatches.filter((row) => row.status === "finished").length,
      scheduledRows: normalizedMatches.filter((row) => row.status === "scheduled").length
    },
    f36: {
      decoderName: standingsDecoded.decoderName,
      matchdayCount: standingsDecoded.decoded.matchdays?.length || 0,
      latestStandingsRows: standingsRows.filter((row) => row.competition === c.competition).length
    }
  });
}

const byCompetition = {};
for (const c of competitions) {
  byCompetition[c.competition] = {
    fixtures: fixtureRows.filter((row) => row.competition === c.competition).length,
    results: resultRows.filter((row) => row.competition === c.competition).length,
    scheduled: fixtureRows.filter((row) => row.competition === c.competition && row.status === "scheduled").length,
    standingsRows: standingsRows.filter((row) => row.competition === c.competition).length
  };
}

const output = {
  ok: true,
  job: "build-uefa-spfl-opta-normalized-rows-file",
  mode: "source_fetch_decode_normalize_spfl_official_opta_f1_f36",
  generatedAt: new Date().toISOString(),
  summary: {
    competitionCount: competitions.length,
    fixtureRowCount: fixtureRows.length,
    resultRowCount: resultRows.length,
    scheduledRowCount: fixtureRows.filter((row) => row.status === "scheduled").length,
    standingsRowCount: standingsRows.length,
    byCompetition,
    feedSummaries,
    sourceFetch: true,
    controlledFetch: true,
    noSearch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  },
  fixtureRows,
  resultRows,
  standingsRows,
  guarantees: {
    sourceFetch: true,
    controlledFetch: true,
    noSearch: true,
    usesOnlyFetchedOptaRuntimeCommittedMappingAndFetchedDecoderNames: true,
    outputDoesNotPrintCredentialQueryValues: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    diagnosticOnly: true
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");

console.log(JSON.stringify({
  ok: output.ok,
  output: outputPath,
  summary: output.summary,
  guarantees: output.guarantees
}, null, 2));
