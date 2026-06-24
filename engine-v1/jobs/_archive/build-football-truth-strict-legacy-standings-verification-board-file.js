import fs from "node:fs";
import path from "node:path";

const standingsDir = path.join("data","standings");
const historyPath = path.join("data","history","2025-2026.json");
const outDir = path.join("data","football-truth","_diagnostics","strict-legacy-standings-verification-board-2026-06-17");
const outPath = path.join(outDir,"strict-legacy-standings-verification-board-2026-06-17.json");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(v){ return String(v??"").replace(/\s+/g," ").trim(); }
function norm(v){ return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,""); }
function n(v){ const x=Number(v); return Number.isFinite(x) ? x : null; }
function statusIsTerminal(s){ return /FULL|FT|FINAL/i.test(String(s??"")); }

const history = fs.existsSync(historyPath) ? readJson(historyPath) : {days:[]};
const matches = [];
for(const d of history.days || []){
  for(const r of d.rows || []){
    if(statusIsTerminal(r.status) && r.scoreHome !== undefined && r.scoreAway !== undefined){
      matches.push(r);
    }
  }
}

function recomputeHistoryTable(slug){
  const mrows = matches.filter(m => m.leagueSlug === slug);
  const table = new Map();
  function row(team){
    if(!table.has(team)) table.set(team,{teamName:team,played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,goalDiff:0,points:0});
    return table.get(team);
  }
  for(const m of mrows){
    const h=row(m.homeTeam), a=row(m.awayTeam);
    const gh=Number(m.scoreHome), ga=Number(m.scoreAway);
    h.played++; a.played++;
    h.goalsFor += gh; h.goalsAgainst += ga;
    a.goalsFor += ga; a.goalsAgainst += gh;
    if(gh>ga){ h.wins++; a.losses++; h.points += 3; }
    else if(gh<ga){ a.wins++; h.losses++; a.points += 3; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }
  for(const r of table.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  return {matchCount:mrows.length, teams:[...table.values()]};
}

function rowArithmeticIssues(row){
  const issues=[];
  const played=n(row.played), wins=n(row.wins ?? row.won), draws=n(row.draws ?? row.drawn), losses=n(row.losses ?? row.lost);
  const gf=n(row.goalsFor), ga=n(row.goalsAgainst), gd=n(row.goalDiff ?? row.goalDifference), points=n(row.points);
  if(played===null || wins===null || draws===null || losses===null || gf===null || ga===null || points===null) issues.push("missing_required_numeric_fields");
  if(played!==null && wins!==null && draws!==null && losses!==null && played !== wins+draws+losses) issues.push("played_not_equal_wins_draws_losses");
  if(gd!==null && gf!==null && ga!==null && gd !== gf-ga) issues.push("goal_diff_mismatch");
  if(points!==null && wins!==null && draws!==null && points < wins*3+draws-12) issues.push("points_lower_than_basic_formula_allowing_deductions");
  if(points!==null && wins!==null && draws!==null && points > wins*3+draws+6) issues.push("points_higher_than_basic_formula_allowing_bonus_margin");
  return issues;
}

function verifyFile(file){
  const p=path.join(standingsDir,file);
  const slug=file.replace(/\.json$/,"");
  const j=readJson(p);
  const rows=Array.isArray(j.table) ? j.table : [];
  const issues=[];
  const sourceAudit=Array.isArray(j.sourceAudit) ? j.sourceAudit : [];
  const confidence=n(j.confidence) ?? 0;
  const completeness=n(j.completeness) ?? 0;

  if(rows.length===0) issues.push("empty_table");
  if(confidence < 0.9) issues.push("confidence_below_0_9");
  if(completeness < 1) issues.push("completeness_below_1");
  if(!sourceAudit.some(x => x.type==="local_truth_history" && x.ok===true)) issues.push("missing_ok_local_truth_history");
  if(!sourceAudit.some(x => x.type==="existing_artifact" && x.ok===true)) issues.push("missing_ok_existing_artifact");
  if(!sourceAudit.some(x => x.type==="validation" && x.ok===true)) issues.push("missing_ok_validation_audit");

  const names=rows.map(r=>clean(r.teamName ?? r.team ?? r.name)).filter(Boolean);
  const positions=rows.map(r=>n(r.position ?? r.rank)).filter(x=>x!==null);
  const duplicateTeams=names.filter((t,i)=>names.indexOf(t)!==i);
  const duplicatePositions=positions.filter((t,i)=>positions.indexOf(t)!==i);
  if(new Set(names).size !== rows.length) issues.push("duplicate_or_missing_team_names");
  if(new Set(positions).size !== rows.length) issues.push("duplicate_or_missing_positions");

  let arithmeticIssueRows=0;
  for(const r of rows) if(rowArithmeticIssues(r).length) arithmeticIssueRows++;
  if(arithmeticIssueRows>0) issues.push("row_arithmetic_issues");

  const hist = recomputeHistoryTable(slug);
  const histByNorm = new Map(hist.teams.map(t=>[norm(t.teamName),t]));
  let matchedHistoryTeams=0, missingInHistory=0, statMismatchRows=0;
  for(const r of rows){
    const teamName=clean(r.teamName ?? r.team ?? r.name);
    const hr=histByNorm.get(norm(teamName));
    if(!hr){ missingInHistory++; continue; }
    matchedHistoryTeams++;
    const fields=["played","wins","draws","losses","goalsFor","goalsAgainst","points"];
    let mismatch=false;
    for(const f of fields){
      const rv=n(r[f] ?? (f==="wins"?r.won:f==="draws"?r.drawn:f==="losses"?r.lost:undefined));
      if(rv!==null && rv !== hr[f]) mismatch=true;
    }
    const gd=n(r.goalDiff ?? r.goalDifference);
    if(gd!==null && gd !== hr.goalDiff) mismatch=true;
    if(mismatch) statMismatchRows++;
  }

  if(hist.matchCount===0) issues.push("no_terminal_history_matches_for_reconciliation");
  if(missingInHistory>0) issues.push("standing_team_missing_in_history");
  if(statMismatchRows>0) issues.push("standing_stats_do_not_reconcile_with_history");

  const phaseSummary = j.phaseSummary ?? {};
  const hasPhaseAmbiguity = phaseSummary.hasPhaseTables === true || (Array.isArray(phaseSummary.phaseKeys) && phaseSummary.phaseKeys.length>1);
  if(hasPhaseAmbiguity) issues.push("phase_ambiguity_requires_manual_policy");

  let verificationStatus;
  if(rows.length===0 || confidence<0.9 || completeness<1) verificationStatus="blocked_low_confidence_or_empty";
  else if(missingInHistory>0 || statMismatchRows>0 || hasPhaseAmbiguity) verificationStatus="blocked_needs_reconciliation_or_phase_review";
  else if(arithmeticIssueRows>0) verificationStatus="blocked_row_arithmetic_review";
  else verificationStatus="verified_promotable_candidate";

  return {
    competitionSlug:slug,
    file:path.relative(".",p),
    rowCount:rows.length,
    confidence,
    completeness,
    sourceAudit,
    historyMatchCount:hist.matchCount,
    historyTeamCount:hist.teams.length,
    matchedHistoryTeams,
    missingInHistory,
    statMismatchRows,
    arithmeticIssueRows,
    duplicateTeamCount:duplicateTeams.length,
    duplicatePositionCount:duplicatePositions.length,
    verificationStatus,
    issues:[...new Set(issues)],
    sampleRows:rows.slice(0,3)
  };
}

const files = fs.existsSync(standingsDir) ? fs.readdirSync(standingsDir).filter(f=>f.endsWith(".json")).sort() : [];
const rows = files.map(verifyFile);
const statusCounts = rows.reduce((a,r)=>{a[r.verificationStatus]=(a[r.verificationStatus]||0)+1;return a;},{});
const issueCounts = {};
for(const r of rows) for(const i of r.issues) issueCounts[i]=(issueCounts[i]||0)+1;

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  rows,
  summary:{
    status:"passed",
    standingsFileCount:rows.length,
    nonEmptyStandingFileCount:rows.filter(r=>r.rowCount>0).length,
    verifiedPromotableCandidateCount:rows.filter(r=>r.verificationStatus==="verified_promotable_candidate").length,
    blockedCount:rows.filter(r=>r.verificationStatus!=="verified_promotable_candidate").length,
    statusCounts,
    issueCounts,
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  policy:{
    noCanonicalWriteFromThisBoard:true,
    verifiedPromotableStillRequiresExplicitApproval:true,
    blockedRowsMustNotBePromoted:true
  }
};

writeJson(outPath,output);
console.log(JSON.stringify(output.summary,null,2));
console.log(JSON.stringify(rows.filter(r=>r.verificationStatus==="verified_promotable_candidate").map(r=>({competitionSlug:r.competitionSlug,rowCount:r.rowCount,historyMatchCount:r.historyMatchCount})),null,2));
