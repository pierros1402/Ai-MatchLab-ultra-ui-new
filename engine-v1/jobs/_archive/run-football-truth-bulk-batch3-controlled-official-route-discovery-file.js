import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchIndex = 3;
const pad = "003";

const qualityVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-verification-${today}`, `bulk-batch-route-quality-board-batch-${pad}-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-${today}`);
const outPath = path.join(outDir, `bulk-batch3-controlled-official-route-discovery-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch3-controlled-official-route-discovery-rows-${today}.jsonl`);

const targets = [
  { slug: "wal.2", displayName: "Wales Cymru North/South", hosts: ["faw.cymru", "cymrufootball.wales"], terms: ["cymru north", "cymru south", "ardal", "wales"], routeTerms: ["fixture", "fixtures", "table", "standings", "results"], urls: ["https://faw.cymru/cymru-leagues/cymru-north/fixtures", "https://faw.cymru/cymru-leagues/cymru-south/fixtures", "https://cymrufootball.wales/cymru-north/fixtures", "https://cymrufootball.wales/cymru-south/fixtures"] },
  { slug: "nzl.1", displayName: "New Zealand National League", hosts: ["nzfootball.co.nz", "www.nzfootball.co.nz"], terms: ["national league", "new zealand", "nz football"], routeTerms: ["fixtures", "results", "standings", "table"], urls: ["https://www.nzfootball.co.nz/COMPETITIONS/National-League", "https://www.nzfootball.co.nz/fixtures", "https://www.nzfootball.co.nz/results", "https://www.nzfootball.co.nz/"] },
  { slug: "nzl.2", displayName: "New Zealand second tier", hosts: ["nzfootball.co.nz", "www.nzfootball.co.nz"], terms: ["championship", "central league", "northern league", "southern league", "new zealand"], routeTerms: ["fixtures", "results", "standings", "table"], urls: ["https://www.nzfootball.co.nz/fixtures", "https://www.nzfootball.co.nz/results", "https://www.nzfootball.co.nz/COMPETITIONS", "https://www.nzfootball.co.nz/"] },

  { slug: "col.1", displayName: "Colombia Primera A", hosts: ["dimayor.com.co"], terms: ["liga betplay", "primera a", "colombia", "dimayor"], routeTerms: ["posiciones", "fixture", "calendario", "resultados", "tabla"], urls: ["https://dimayor.com.co/liga-betplay-dimayor/", "https://dimayor.com.co/tabla-de-posiciones/", "https://dimayor.com.co/calendario-liga-betplay-dimayor/", "https://dimayor.com.co/"] },
  { slug: "col.2", displayName: "Colombia Primera B", hosts: ["dimayor.com.co"], terms: ["torneo betplay", "primera b", "colombia", "dimayor"], routeTerms: ["posiciones", "fixture", "calendario", "resultados", "tabla"], urls: ["https://dimayor.com.co/torneo-betplay-dimayor/", "https://dimayor.com.co/tabla-de-posiciones-torneo-betplay-dimayor/", "https://dimayor.com.co/calendario-torneo-betplay-dimayor/", "https://dimayor.com.co/"] },
  { slug: "chi.1", displayName: "Chile Primera Division", hosts: ["anfp.cl", "www.anfp.cl"], terms: ["primera division", "primera división", "chile", "anfp"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.anfp.cl/fixture/", "https://www.anfp.cl/estadisticas", "https://www.anfp.cl/campeonato/primera-division", "https://www.anfp.cl/"] },
  { slug: "chi.2", displayName: "Chile Primera B", hosts: ["anfp.cl", "www.anfp.cl"], terms: ["primera b", "ascenso", "chile", "anfp"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.anfp.cl/fixture/", "https://www.anfp.cl/campeonato/primera-b", "https://www.anfp.cl/estadisticas", "https://www.anfp.cl/"] },
  { slug: "ecu.1", displayName: "Ecuador Serie A", hosts: ["ligapro.ec"], terms: ["liga pro", "serie a", "ecuador"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://ligapro.ec/fixture", "https://ligapro.ec/tabla-de-posiciones", "https://ligapro.ec/", "https://ligapro.ec/fixture-de-la-temporada-2025-aprobado-en-consejo-de-presidentes/"] },
  { slug: "ecu.2", displayName: "Ecuador Serie B", hosts: ["fef.ec", "www.fef.ec", "ligapro.ec"], terms: ["serie b", "ecuador", "liga pro"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.fef.ec/competiciones", "https://www.fef.ec/", "https://ligapro.ec/fixture", "https://ligapro.ec/"] },
  { slug: "per.1", displayName: "Peru Liga 1", hosts: ["liga1.pe", "fpf.org.pe", "www.fpf.org.pe"], terms: ["liga 1", "peru", "perú"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://liga1.pe/fixtures", "https://liga1.pe/tabla-de-posiciones", "https://liga1.pe/", "https://fpf.org.pe/"] },
  { slug: "per.2", displayName: "Peru Liga 2", hosts: ["liga2.pe", "fpf.org.pe", "www.fpf.org.pe"], terms: ["liga 2", "peru", "perú"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://liga2.pe/", "https://liga2.pe/fixture", "https://fpf.org.pe/", "https://fpf.org.pe/futbol-profesional/"] },
  { slug: "uru.1", displayName: "Uruguay Primera Division", hosts: ["auf.org.uy"], terms: ["primera division", "primera división", "uruguayo", "uruguay"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://auf.org.uy/fixture", "https://auf.org.uy/campeonato-uruguayo-primera-division/", "https://auf.org.uy/posiciones", "https://auf.org.uy/"] },
  { slug: "uru.2", displayName: "Uruguay Segunda Division", hosts: ["auf.org.uy"], terms: ["segunda division", "segunda división", "uruguay"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://auf.org.uy/segunda-division-profesional/", "https://auf.org.uy/fixture", "https://auf.org.uy/posiciones", "https://auf.org.uy/"] },
  { slug: "par.1", displayName: "Paraguay Primera Division", hosts: ["apf.org.py", "www.apf.org.py"], terms: ["primera division", "primera división", "paraguay", "copa de primera"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.apf.org.py/primera-division", "https://www.apf.org.py/copa-de-primera", "https://www.apf.org.py/fixture", "https://www.apf.org.py/"] },
  { slug: "par.2", displayName: "Paraguay Segunda Division", hosts: ["apf.org.py", "www.apf.org.py"], terms: ["intermedia", "segunda", "paraguay"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.apf.org.py/intermedia", "https://www.apf.org.py/fixture", "https://www.apf.org.py/"] },
  { slug: "bol.1", displayName: "Bolivia Primera Division", hosts: ["fbf.com.bo", "www.fbf.com.bo"], terms: ["division profesional", "división profesional", "bolivia"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.fbf.com.bo/campeonato-division-profesional/", "https://www.fbf.com.bo/", "https://fbf.com.bo/"] },
  { slug: "bol.2", displayName: "Bolivia second division", hosts: ["fbf.com.bo", "www.fbf.com.bo"], terms: ["copa simon bolivar", "copa simón bolívar", "bolivia"], routeTerms: ["fixture", "tabla", "posiciones", "resultados"], urls: ["https://www.fbf.com.bo/copa-simon-bolivar/", "https://www.fbf.com.bo/", "https://fbf.com.bo/"] },
  { slug: "ven.1", displayName: "Venezuela Primera Division", hosts: ["ligafutve.org"], terms: ["liga futve", "primera division", "venezuela"], routeTerms: ["fixture", "tabla", "clasificacion", "clasificación", "resultados"], urls: ["https://ligafutve.org/", "https://ligafutve.org/fixture/", "https://ligafutve.org/clasificacion/"] },
  { slug: "ven.2", displayName: "Venezuela Segunda Division", hosts: ["federacionvenezolanadefutbol.org", "www.federacionvenezolanadefutbol.org", "ligafutve.org"], terms: ["segunda division", "liga futve 2", "venezuela"], routeTerms: ["fixture", "tabla", "clasificacion", "resultados"], urls: ["https://ligafutve.org/", "https://www.federacionvenezolanadefutbol.org/", "https://www.federacionvenezolanadefutbol.org/category/competiciones/"] },

  { slug: "crc.1", displayName: "Costa Rica Primera Division", hosts: ["unafut.com"], terms: ["primera division", "primera división", "costa rica", "unafut"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://www.unafut.com/", "https://www.unafut.com/calendario", "https://www.unafut.com/tabla-de-posiciones"] },
  { slug: "crc.2", displayName: "Costa Rica Liga de Ascenso", hosts: ["ligadeascenso.cr", "www.ligadeascenso.cr", "fedefutbol.com"], terms: ["liga de ascenso", "costa rica"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://ligadeascenso.cr/", "https://www.ligadeascenso.cr/", "https://www.fedefutbol.com/"] },
  { slug: "pan.1", displayName: "Panama LPF", hosts: ["lpf.com.pa", "fepafut.com"], terms: ["lpf", "liga panameña", "panama", "panamá"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://lpf.com.pa/", "https://lpf.com.pa/calendario/", "https://lpf.com.pa/tabla-de-posiciones/", "https://fepafut.com/"] },
  { slug: "pan.2", displayName: "Panama second tier", hosts: ["fepafut.com", "lpf.com.pa"], terms: ["liga prom", "segunda", "panama", "panamá"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://fepafut.com/", "https://lpf.com.pa/", "https://lpf.com.pa/calendario/"] },
  { slug: "hon.1", displayName: "Honduras Liga Nacional", hosts: ["liganacionaldehonduras.com", "fenafuth.org.hn"], terms: ["liga nacional", "honduras"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://liganacionaldehonduras.com/", "https://liganacionaldehonduras.com/tabla-de-posiciones/", "https://fenafuth.org.hn/"] },
  { slug: "hon.2", displayName: "Honduras second tier", hosts: ["fenafuth.org.hn", "liganacionaldeascenso.com"], terms: ["liga de ascenso", "honduras"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://fenafuth.org.hn/", "https://liganacionaldeascenso.com/"] },
  { slug: "slv.1", displayName: "El Salvador Primera Division", hosts: ["primerafutboles.com", "fesfut.org.sv"], terms: ["primera division", "primera división", "el salvador"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://primerafutboles.com/", "https://primerafutboles.com/tabla-de-posiciones/", "https://fesfut.org.sv/"] },
  { slug: "slv.2", displayName: "El Salvador second tier", hosts: ["fesfut.org.sv", "primerafutboles.com"], terms: ["segunda division", "segunda división", "el salvador"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://fesfut.org.sv/", "https://primerafutboles.com/"] },
  { slug: "gua.1", displayName: "Guatemala Liga Nacional", hosts: ["ligagt.org", "fedefutguate.gt"], terms: ["liga nacional", "guatemala"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://ligagt.org/", "https://ligagt.org/calendario", "https://ligagt.org/posiciones", "https://fedefutguate.gt/"] },
  { slug: "gua.2", displayName: "Guatemala Primera Division", hosts: ["primeradivision.com.gt", "fedefutguate.gt"], terms: ["primera division", "primera división", "guatemala"], routeTerms: ["calendario", "tabla", "posiciones", "resultados"], urls: ["https://primeradivision.com.gt/", "https://fedefutguate.gt/"] },

  { slug: "can.1", displayName: "Canada Premier League", hosts: ["canpl.ca", "www.cplsoccer.com"], terms: ["canadian premier league", "canada", "cpl"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://canpl.ca/standings", "https://canpl.ca/schedule", "https://www.cplsoccer.com/standings", "https://www.cplsoccer.com/schedule"] },
  { slug: "can.2", displayName: "Canada second tier", hosts: ["league1canada.ca"], terms: ["league1", "league1 canada", "canada"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://league1canada.ca/standings", "https://league1canada.ca/schedule", "https://league1canada.ca/"] },
  { slug: "ind.1", displayName: "India Super League", hosts: ["indiansuperleague.com", "www.indiansuperleague.com"], terms: ["indian super league", "isl", "india"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://www.indiansuperleague.com/standings", "https://www.indiansuperleague.com/fixtures", "https://www.indiansuperleague.com/results", "https://www.indiansuperleague.com/"] },
  { slug: "ind.2", displayName: "India I-League", hosts: ["the-aiff.com", "www.the-aiff.com"], terms: ["i-league", "india", "aiff"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://www.the-aiff.com/competitions/i-league", "https://www.the-aiff.com/competitions", "https://www.the-aiff.com/"] },
  { slug: "idn.1", displayName: "Indonesia Liga 1", hosts: ["ligaindonesiabaru.com", "www.ligaindonesiabaru.com", "pssi.org"], terms: ["liga 1", "indonesia"], routeTerms: ["standings", "fixtures", "schedule", "results", "klasemen"], urls: ["https://ligaindonesiabaru.com/", "https://ligaindonesiabaru.com/standings", "https://ligaindonesiabaru.com/fixtures", "https://www.pssi.org/"] },
  { slug: "idn.2", displayName: "Indonesia Liga 2", hosts: ["ligaindonesiabaru.com", "www.ligaindonesiabaru.com", "pssi.org"], terms: ["liga 2", "indonesia"], routeTerms: ["standings", "fixtures", "schedule", "results", "klasemen"], urls: ["https://ligaindonesiabaru.com/", "https://ligaindonesiabaru.com/standings", "https://ligaindonesiabaru.com/fixtures", "https://www.pssi.org/"] },
  { slug: "tha.1", displayName: "Thailand League 1", hosts: ["thaileague.co.th"], terms: ["thai league", "t1", "thailand"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://thaileague.co.th/official/t1/standings", "https://thaileague.co.th/official/t1/fixtures", "https://thaileague.co.th/"] },
  { slug: "tha.2", displayName: "Thailand League 2", hosts: ["thaileague.co.th"], terms: ["thai league 2", "t2", "thailand"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://thaileague.co.th/official/t2/standings", "https://thaileague.co.th/official/t2/fixtures", "https://thaileague.co.th/"] },
  { slug: "vie.1", displayName: "Vietnam V.League 1", hosts: ["vpf.vn", "vff.org.vn"], terms: ["v.league 1", "vleague 1", "vietnam"], routeTerms: ["standings", "fixtures", "schedule", "results", "bang xep hang"], urls: ["https://vpf.vn/", "https://vpf.vn/bang-xep-hang/", "https://vpf.vn/lich-thi-dau/", "https://vff.org.vn/"] },
  { slug: "vie.2", displayName: "Vietnam V.League 2", hosts: ["vpf.vn", "vff.org.vn"], terms: ["v.league 2", "vleague 2", "hạng nhất", "vietnam"], routeTerms: ["standings", "fixtures", "schedule", "results", "bang xep hang"], urls: ["https://vpf.vn/", "https://vpf.vn/bang-xep-hang/", "https://vpf.vn/lich-thi-dau/", "https://vff.org.vn/"] },
  { slug: "mys.1", displayName: "Malaysia Super League", hosts: ["malaysianfootballleague.com", "www.malaysianfootballleague.com", "fam.org.my"], terms: ["super league", "malaysia", "mfl"], routeTerms: ["standings", "fixtures", "schedule", "results"], urls: ["https://www.malaysianfootballleague.com/fixtures/", "https://www.malaysianfootballleague.com/standings/", "https://www.malaysianfootballleague.com/", "https://fam.org.my/"] }
];

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(m?.[1] || "").slice(0, 180);
}

function countTermHits(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.filter(term => lower.includes(String(term).toLowerCase()));
}

function countRegex(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

async function fetchWithTimeout(url, timeoutMs = 16000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +batch3-controlled-official-route-discovery)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

function scoreFetch(target, fetchRow, html) {
  const sample = stripHtml(html).slice(0, 50000);
  const combined = `${fetchRow.url} ${fetchRow.finalUrl} ${fetchRow.title} ${sample}`;
  const finalHost = fetchRow.finalHost;
  const normalizedTargetHosts = target.hosts.map(host => String(host || "").toLowerCase().replace(/^www\./, ""));
  const hostAllowed = normalizedTargetHosts.some(host => finalHost === host || finalHost.endsWith(`.${host}`));
  const competitionTermHits = countTermHits(combined, target.terms);
  const routeTermHits = countTermHits(combined, target.routeTerms);
  const tableCount = countRegex(html, /<table\b/gi);
  const trCount = countRegex(html, /<tr\b/gi);
  const apiHintCount = countRegex(html, /standings|fixtures|schedule|results|posiciones|clasificacion|tabla|fixture|matches|competition|season|round|table|klasemen|bang-xep-hang/gi);
  const challengeText = `${fetchRow.title} ${html.slice(0, 12000)} ${fetchRow.finalUrl}`;
  const hasChallenge = /just a moment|are you not a robot|showcaptcha|access denied|forbidden/i.test(challengeText) || (/cf-chl|cloudflare/i.test(challengeText) && /challenge|captcha|checking your browser/i.test(challengeText));

  let score = 0;
  if (hostAllowed) score += 80;
  if ((fetchRow.fetchStatus ?? 0) >= 200 && (fetchRow.fetchStatus ?? 0) < 400) score += 45;
  score += competitionTermHits.length * 35;
  score += routeTermHits.length * 25;
  if (tableCount >= 1 && trCount >= 8) score += 60;
  if (apiHintCount >= 10) score += 30;
  if (apiHintCount >= 30) score += 25;
  if (/standings|posiciones|clasificacion|tabla|klasemen|bang-xep-hang/i.test(combined)) score += 35;
  if (/fixtures|fixture|schedule|calendario|results|resultados/i.test(combined)) score += 25;
  if (hasChallenge) score -= 90;
  if (!hostAllowed) score -= 150;
  if ((fetchRow.fetchStatus ?? 0) >= 400) score -= 30;

  return { score, hostAllowed, competitionTermHits, routeTermHits, tableCount, trCount, apiHintCount, hasChallenge };
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const qualityVerification = JSON.parse(await fs.readFile(qualityVerificationPath, "utf8"));
if (qualityVerification.status !== "passed") blocks.push("route_quality_verification_not_passed");
if (qualityVerification.verified?.batchIndex !== 3) blocks.push("route_quality_batch_not_3");
if (qualityVerification.verified?.needsControlledOfficialRouteDiscoveryCount !== 40) blocks.push("route_quality_not_all_discovery");

const expectedSlugs = [...qualityVerification.verified.rejectedOrNeedsDiscoverySlugs].sort();
const targetSlugs = targets.map(target => target.slug).sort();
if (JSON.stringify(expectedSlugs) !== JSON.stringify(targetSlugs)) blocks.push("target_slug_set_mismatch");

const rows = [];
let attemptedFetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let targetIndex = 0;
  for (const target of targets) {
    targetIndex += 1;
    const fetchRows = [];

    for (let i = 0; i < target.urls.length; i++) {
      const url = target.urls[i];
      attemptedFetchCount += 1;
      console.log(`[${targetIndex}/${targets.length}] ${target.slug} [${i + 1}/${target.urls.length}] ${url}`);

      const startedAt = new Date().toISOString();
      const fetched = await fetchWithTimeout(url, 16000);
      const endedAt = new Date().toISOString();
      const html = fetched.text || "";
      const finalUrl = fetched.response?.url || url;

      const base = {
        url,
        finalUrl,
        finalHost: hostOf(finalUrl),
        fetchStatus: fetched.response?.status ?? null,
        contentType: fetched.response?.headers?.get("content-type") || null,
        title: titleOf(html),
        bodyLength: html.length,
        bodySha256: html ? shaText(html) : null,
        fetchError: fetched.error,
        timedOut: fetched.timedOut,
        startedAt,
        endedAt
      };

      const scored = scoreFetch(target, base, html);
      fetchRows.push({ ...base, ...scored });
    }

    const sorted = [...fetchRows].sort((a, b) => b.score - a.score || (b.bodyLength ?? 0) - (a.bodyLength ?? 0));
    const selected = sorted[0] || null;

    const discoveryStatus =
      selected && selected.score >= 185 && selected.hostAllowed && !selected.hasChallenge && (selected.fetchStatus >= 200 && selected.fetchStatus < 400)
        ? "controlled_official_route_candidate_passed"
        : selected && selected.score >= 110 && selected.hostAllowed
          ? "controlled_official_route_candidate_needs_review"
          : "controlled_official_route_candidate_not_found";

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      batchIndex,
      discoveryStatus,
      selectedUrl: selected?.url ?? null,
      selectedFinalUrl: selected?.finalUrl ?? null,
      selectedHost: selected?.finalHost ?? null,
      selectedTitle: selected?.title ?? null,
      selectedScore: selected?.score ?? null,
      selectedFetchStatus: selected?.fetchStatus ?? null,
      selectedCompetitionTermHits: selected?.competitionTermHits ?? [],
      selectedRouteTermHits: selected?.routeTermHits ?? [],
      selectedTableCount: selected?.tableCount ?? 0,
      selectedTrCount: selected?.trCount ?? 0,
      selectedApiHintCount: selected?.apiHintCount ?? 0,
      selectedHasChallenge: selected?.hasChallenge ?? null,
      fetches: fetchRows,
      acceptedNow: false,
      routeClaimMadeNow: false,
      familyClaimMadeNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch3_controlled_official_route_discovery",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  qualityVerificationPath: rel(qualityVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: attemptedFetchCount,
    controlledOfficialRouteDiscoveryFetchExecutedNowCount: attemptedFetchCount,
    providerFetchExecutedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: targets.length,
    attemptedFetchCount,
    passedCount: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed").length,
    needsReviewCount: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_needs_review").length,
    notFoundCount: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_not_found").length,
    passedSlugs: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed").map(row => row.slug),
    needsReviewSlugs: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_needs_review").map(row => row.slug),
    notFoundSlugs: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_not_found").map(row => row.slug),
    acceptedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteAllowedNow: false,
    lifecycleWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify diagnostic; passed route candidates require identity/surface verification before extraction"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    discoveryStatus: row.discoveryStatus,
    selectedUrl: row.selectedUrl,
    selectedFinalUrl: row.selectedFinalUrl,
    selectedHost: row.selectedHost,
    selectedTitle: row.selectedTitle,
    selectedScore: row.selectedScore,
    selectedFetchStatus: row.selectedFetchStatus,
    selectedCompetitionTermHits: row.selectedCompetitionTermHits,
    selectedRouteTermHits: row.selectedRouteTermHits,
    selectedTableCount: row.selectedTableCount,
    selectedTrCount: row.selectedTrCount,
    selectedApiHintCount: row.selectedApiHintCount,
    selectedHasChallenge: row.selectedHasChallenge
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
