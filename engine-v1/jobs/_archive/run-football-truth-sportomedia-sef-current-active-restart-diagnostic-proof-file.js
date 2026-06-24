import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const endpoint = "https://gql.sportomedia.se/graphql";

const introspectionPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-small-graphql-introspection-${today}`, `sportomedia-sef-small-graphql-introspection-${today}.json`);
const outDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-${today}`);
const outPath = path.join(outDir, `sportomedia-sef-current-active-restart-diagnostic-proof-${today}.json`);
const rowsPath = path.join(outDir, `sportomedia-sef-current-active-restart-diagnostic-proof-rows-${today}.jsonl`);

const targets = [
  { slug:"swe.1", league:"Allsvenskan", configLeagueName:"allsvenskan", sourceUrl:"https://allsvenskan.se/tabell", signals:["Malmö FF","Hammarby","AIK","Djurgården","Mjällby","Elfsborg"] },
  { slug:"swe.2", league:"Superettan", configLeagueName:"superettan", sourceUrl:"https://superettan.se/tabell", signals:["Degerfors","Öster","Landskrona","Helsingborg","Sandviken","Brage"] }
];

const standingsQuery = `query StandingsForLeague($configLeagueName:String!,$configSeasonStartYear:Int!,$type:String!){standingsForLeague(configLeagueName:$configLeagueName,configSeasonStartYear:$configSeasonStartYear,type:$type){standings{teamAbbrv borderType teamName position previousPosition stats{value name} teamId}}}`;
const matchesQuery = `query MatchesForLeague($configLeagueName:String!,$configSeasonStartYear:Int!,$startDate:String!,$endDate:String!){matchesForLeague(configLeagueName:$configLeagueName,configSeasonStartYear:$configSeasonStartYear,startDate:$startDate,endDate:$endDate){matches{id configLeagueName configSeasonStartYear leagueName arenaName round startDate status extendedStatus homeTeamAbbrv homeTeamName homeTeamNameFormatted homeTeamScore visitingTeamAbbrv visitingTeamName visitingTeamNameFormatted visitingTeamScore}}}`;

function rel(p){ return path.relative(root,p).replaceAll("\\","/"); }
function shaText(s){ return crypto.createHash("sha256").update(String(s ?? "")).digest("hex"); }
function norm(s){ return String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function addDays(date, days){ const d=new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
function statMap(stats){ const m={}; for(const s of Array.isArray(stats)?stats:[]) if(s?.name!==undefined)m[String(s.name)]=s.value; return m; }
function rowFromStanding(r){ const s=statMap(r.stats); const gf=Number(s.gf??0), ga=Number(s.ga??0); return {rank:Number(r.position??0),team:String(r.teamName??""),played:Number(s.gp??0),wins:Number(s.w??0),draws:Number(s.t??0),losses:Number(s.l??0),goalsFor:gf,goalsAgainst:ga,goalDifference:gf-ga,points:Number(s.pts??0)}; }
function rowFromMatch(r){ return {id:r.id??null,round:r.round??null,startDate:String(r.startDate??""),status:r.status??null,extendedStatus:r.extendedStatus??null,homeTeam:String(r.homeTeamNameFormatted??r.homeTeamName??""),awayTeam:String(r.visitingTeamNameFormatted??r.visitingTeamName??""),homeScore:r.homeTeamScore??null,awayScore:r.visitingTeamScore??null,arenaName:r.arenaName??null,leagueName:r.leagueName??null}; }

function post({query,variables,origin,referer,operationName}) {
  const body = JSON.stringify({operationName,query,variables});
  const r = spawnSync("curl.exe", ["--location","--ipv4","--http1.1","--connect-timeout","5","--max-time","18","--max-filesize","4000000","--silent","--show-error","--request","POST","--header","Content-Type: application/json","--header",`Origin: ${origin}`,"--header",`Referer: ${referer}`,"--data",body,endpoint], {cwd:root,encoding:"utf8",maxBuffer:1024*1024*8});
  let json=null, parseError=null;
  try { json=JSON.parse(r.stdout||"{}"); } catch(e){ parseError=String(e.message||e); }
  return {status:r.status,stderr:r.stderr||"",parseError,json,payloadSha256:shaText(body),responseSha256:shaText(r.stdout)};
}

function validateStandings(rows, target) {
  const blocks=[];
  if(rows.length!==16) blocks.push("standing_row_count_not_16");
  const text=rows.map(r=>r.team).join(" ");
  const hits=target.signals.filter(s=>norm(text).includes(norm(s)));
  if(hits.length<4) blocks.push("team_signal_minimum_failed");
  for(const r of rows){
    if(r.played!==r.wins+r.draws+r.losses) blocks.push("played_arithmetic_failed");
    if(r.points!==r.wins*3+r.draws) blocks.push("points_arithmetic_failed");
    if(r.goalDifference!==r.goalsFor-r.goalsAgainst) blocks.push("gd_arithmetic_failed");
  }
  return {passed:blocks.length===0, blocks:[...new Set(blocks)], teamSignalHits:hits, maxPlayed:Math.max(0,...rows.map(r=>r.played||0))};
}

function selectRestart(fixtures) {
  const future = fixtures
    .filter(f => /^\d{4}-\d{2}-\d{2}/.test(f.startDate) && f.startDate.slice(0,10) > today)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const restartDate = future[0]?.startDate?.slice(0,10) || null;
  return {restartDate, nextFixturePollNotBefore: restartDate ? addDays(restartDate,-7) : null, futureFixtureCount: future.length, firstFutureFixtures: future.slice(0,5)};
}

await fs.mkdir(outDir,{recursive:true});
const blocks=[];
if(!allowFetch) blocks.push("missing_allow_fetch");

const intro = JSON.parse(await fs.readFile(introspectionPath,"utf8"));
if(intro.status!=="passed") blocks.push("introspection_not_passed");
if(!intro.rows?.some(r=>r.fieldName==="matchesForLeague")) blocks.push("matchesForLeague_not_in_introspection");
if(!intro.rows?.some(r=>r.fieldName==="standingsForLeague")) blocks.push("standingsForLeague_not_in_introspection");

const proofRows=[];
const attempts=[];

if(allowFetch && blocks.length===0){
  for(const t of targets){
    const origin = new URL(t.sourceUrl).origin;

    const standingsResp = post({operationName:"StandingsForLeague",query:standingsQuery,variables:{configLeagueName:t.configLeagueName,configSeasonStartYear:2026,type:"total"},origin,referer:t.sourceUrl});
    const standingsRaw = standingsResp.json?.data?.standingsForLeague?.standings || [];
    const standingRows = Array.isArray(standingsRaw) ? standingsRaw.map(rowFromStanding) : [];
    const standingValidation = validateStandings(standingRows,t);

    const fixturesResp = post({operationName:"MatchesForLeague",query:matchesQuery,variables:{configLeagueName:t.configLeagueName,configSeasonStartYear:2026,startDate:"2026-01-01",endDate:"2026-12-31"},origin,referer:t.sourceUrl});
    const fixturesRaw = fixturesResp.json?.data?.matchesForLeague?.matches || [];
    const fixtureRows = Array.isArray(fixturesRaw) ? fixturesRaw.map(rowFromMatch).filter(r=>r.startDate) : [];
    const restart = selectRestart(fixtureRows);

    const fixtureBlocks=[];
    if(fixtureRows.length===0) fixtureBlocks.push("fixture_rows_empty");
    if(!restart.restartDate) fixtureBlocks.push("restart_date_not_found");
    if(fixturesResp.json?.errors?.length) fixtureBlocks.push("fixture_graphql_errors");
    if(fixturesResp.parseError) fixtureBlocks.push("fixture_parse_error");

    attempts.push({slug:t.slug,operationName:"StandingsForLeague",status:standingsResp.status,parseError:standingsResp.parseError,graphQlErrorCount:standingsResp.json?.errors?.length||0,rowCount:standingRows.length,responseSha256:standingsResp.responseSha256,validationPassed:standingValidation.passed,validationBlocks:standingValidation.blocks});
    attempts.push({slug:t.slug,operationName:"MatchesForLeague",status:fixturesResp.status,parseError:fixturesResp.parseError,graphQlErrorCount:fixturesResp.json?.errors?.length||0,rowCount:fixtureRows.length,responseSha256:fixturesResp.responseSha256,validationPassed:fixtureBlocks.length===0,validationBlocks:fixtureBlocks});

    proofRows.push({
      slug:t.slug, league:t.league, sourceFamily:"sportomedia_sef",
      seasonScope:"current_active", seasonLabel:"2026", sourceUrl:t.sourceUrl,
      standings:{extractedRowCount:standingRows.length, rows:standingRows, validation:{...standingValidation,responseSha256:standingsResp.responseSha256}},
      fixtures:{extractedRowCount:fixtureRows.length, firstFixtures:fixtureRows.slice(0,8), lastFixtures:fixtureRows.slice(-8), validation:{passed:fixtureBlocks.length===0,blocks:fixtureBlocks,responseSha256:fixturesResp.responseSha256}},
      restartDate:restart.restartDate,
      nextFixturePollNotBefore:restart.nextFixturePollNotBefore,
      futureFixtureCount:restart.futureFixtureCount,
      firstFutureFixtures:restart.firstFutureFixtures,
      lifecycleSchedulerCandidate:{
        lifecycleState: restart.restartDate ? "current_active_in_scheduled_break" : "current_active_unknown_restart",
        requiredDateField:"restartDate",
        restartDate:restart.restartDate,
        nextFixturePollNotBefore:restart.nextFixturePollNotBefore,
        fixturePollingMode:"suppress_daily_fixture_search_until_not_before_date"
      },
      acceptedNow:false, acceptanceAllowedNow:false, reviewOnly:true
    });
  }
}

const passedRows = proofRows.filter(r=>r.standings.validation.passed && r.fixtures.validation.passed && r.restartDate).length;
const report = {
  status: blocks.length===0 && passedRows===2 ? "passed" : "needs_followup",
  runner:"sportomedia_sef_current_active_restart_diagnostic_proof",
  output:rel(outPath), rowsOutput:rel(rowsPath), endpoint,
  guardrails:{searchExecutedNowCount:0,fetchExecutedNowCount:attempts.length,providerFetchExecutedNowCount:0,standingsFetchExecutedNowCount:attempts.filter(a=>a.operationName==="StandingsForLeague").length,fixtureFetchExecutedNowCount:attempts.filter(a=>a.operationName==="MatchesForLeague").length,restartDateFetchExecutedNowCount:attempts.filter(a=>a.operationName==="MatchesForLeague").length,canonicalWriteExecutedNowCount:0,lifecycleWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,rawPayloadCommitted:false,fullRawPayloadWritten:false},
  summary:{targetCount:2,targetSlugs:targets.map(t=>t.slug),seasonScope:"current_active",seasonLabel:"2026",passedRowCount:passedRows,failedRowCount:2-passedRows,requestAttemptCount:attempts.length,restartDates:Object.fromEntries(proofRows.map(r=>[r.slug,r.restartDate])),nextFixturePollNotBefore:Object.fromEntries(proofRows.map(r=>[r.slug,r.nextFixturePollNotBefore])),acceptedNowCount:0,productionWriteAllowedNow:false,truthAssertionAllowedNow:false},
  attempts, rows:proofRows, blocks
};

await fs.writeFile(outPath, JSON.stringify(report,null,2)+"\n","utf8");
await fs.writeFile(rowsPath, proofRows.map(r=>JSON.stringify(r)).join("\n")+"\n","utf8");

console.log(JSON.stringify({status:report.status,output:report.output,rowsOutput:report.rowsOutput,guardrails:report.guardrails,summary:report.summary,attempts:report.attempts,rows:report.rows.map(r=>({slug:r.slug,league:r.league,standingsRows:r.standings.extractedRowCount,fixtureRows:r.fixtures.extractedRowCount,restartDate:r.restartDate,nextFixturePollNotBefore:r.nextFixturePollNotBefore,futureFixtureCount:r.futureFixtureCount,firstFutureFixtures:r.firstFutureFixtures,lifecycleSchedulerCandidate:r.lifecycleSchedulerCandidate})),blocks:report.blocks},null,2));

if(blocks.some(b=>b==="missing_allow_fetch"||b==="introspection_not_passed")) process.exitCode=1;


