param(
  [string]$InputPath = "data\football-truth\_diagnostics\controlled-l2-to-l3-source-contract-fetch-gate-fixed-2026-06-17\controlled-l2-to-l3-source-contract-fetch-gate-fixed-2026-06-17.json",
  [string]$OutPath = "data\football-truth\_diagnostics\strict-l3-route-contract-review-board-2026-06-17\strict-l3-route-contract-review-board-2026-06-17.json"
)

$ErrorActionPreference="Stop"

function ReadText([string]$Path){
  if(Test-Path $Path){
    try { return Get-Content $Path -Raw -ErrorAction Stop } catch { return "" }
  }
  return ""
}
function Clean([string]$s){
  return (([string]$s) -replace "<script[\s\S]*?</script>"," " -replace "<style[\s\S]*?</style>"," " -replace "<[^>]+>"," " -replace "&nbsp;"," " -replace "&amp;","&" -replace "\s+"," ").Trim()
}
function FirstMatch([string]$text,[string]$pattern){
  $m=[regex]::Match($text,$pattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::Singleline)
  if($m.Success){ return (Clean $m.Groups[1].Value) }
  return ""
}
function ContainsAny([string]$hay,[object[]]$needles){
  $h=([string]$hay).ToLowerInvariant()
  $hits=@()
  foreach($n in @($needles)){
    $x=([string]$n).ToLowerInvariant()
    if($x -and $h.Contains($x)){ $hits += [string]$n }
  }
  return @($hits | Select-Object -Unique)
}

$expectedTerms=@{
  "eng.1"=@("premier league")
  "eng.2"=@("championship","efl championship")
  "eng.3"=@("league one","efl league one")
  "eng.4"=@("league two","efl league two")
  "eng.5"=@("national league")
  "ita.1"=@("serie a")
  "fra.1"=@("ligue 1")
  "por.1"=@("liga portugal","primeira liga")
  "por.2"=@("liga portugal 2","segunda liga")
  "bel.1"=@("jupiler pro league","pro league")
  "bel.2"=@("challenger pro league")
  "sui.1"=@("super league")
  "sui.2"=@("challenge league")
  "den.1"=@("superliga")
  "den.2"=@("1. division","division")
  "irl.1"=@("premier division")
  "irl.2"=@("first division")
  "bra.1"=@("serie a","brasileirao","brasileirão")
  "bra.2"=@("serie b")
  "arg.1"=@("primera division","primera división","liga profesional")
  "arg.2"=@("primera nacional")
  "usa.1"=@("major league soccer","mls")
  "usa.2"=@("usl championship")
  "mex.1"=@("liga mx")
  "mex.2"=@("expansion mx","expansión mx")
  "jpn.1"=@("j1 league")
  "jpn.2"=@("j2 league")
  "kor.1"=@("k league 1")
  "kor.2"=@("k league 2")
  "chn.1"=@("super league")
  "chn.2"=@("league one")
  "aus.1"=@("a-league men","a-league")
  "aus.2"=@("national premier leagues","npl")
  "ksa.1"=@("saudi pro league","roshn saudi league")
  "ksa.2"=@("first division league","yelo league")
  "fin.2"=@("ykkosliiga","ykkönen","ykkonen")
  "ned.2"=@("keuken kampioen divisie","eerste divisie")
  "chi.1"=@("primera division","primera división")
  "chi.2"=@("primera b")
  "col.1"=@("liga betplay","primera a")
  "col.2"=@("torneo betplay","primera b")
  "per.1"=@("liga 1")
  "uru.1"=@("primera division","primera división")
  "uru.2"=@("segunda division","segunda división")
}

$routeTokens=@(
  "standings","standing","table","tables","fixtures","fixture","results","result","matches","match","schedule","calendar",
  "stilling","tabell","klassment","classement","classifica","classificação","classificacao","posiciones","tabla","fixture",
  "competitions","competition","stats","rankings"
)

$j=Get-Content $InputPath -Raw | ConvertFrom-Json
$rows=@()

foreach($r in @($j.rows)){
  $slug=[string]$r.competitionSlug
  $url=[string]$r.url
  $effectiveUrl=[string]$r.effectiveUrl
  $body=ReadText ([string]$r.snapshotBody)
  $plain=Clean $body
  $lowerBody=$plain.ToLowerInvariant()
  $title=FirstMatch $body "<title[^>]*>(.*?)</title>"
  $ogTitle=FirstMatch $body "<meta[^>]+property=['""]og:title['""][^>]+content=['""]([^'""]+)['""][^>]*>"
  if(-not $ogTitle){ $ogTitle=FirstMatch $body "<meta[^>]+content=['""]([^'""]+)['""][^>]+property=['""]og:title['""][^>]*>" }
  $h1=FirstMatch $body "<h1[^>]*>(.*?)</h1>"
  $strongZone=($url+" "+$effectiveUrl+" "+$title+" "+$ogTitle+" "+$h1+" "+$plain.Substring(0,[Math]::Min(8000,$plain.Length))).ToLowerInvariant()
  $routeZone=($url+" "+$effectiveUrl+" "+$title+" "+$ogTitle+" "+$h1).ToLowerInvariant()

  $terms=@($expectedTerms[$slug])
  $identityStrongHits=ContainsAny $strongZone $terms
  $identityRouteHits=ContainsAny $routeZone $terms
  $routeTokenHits=ContainsAny $routeZone $routeTokens
  $bodyContractHits=ContainsAny $lowerBody @("standings","table","fixtures","results","matches","schedule","competition","season","clubs","teams","api","json","graphql")
  $urlPath="/"
  try { $urlPath=([Uri]$url).AbsolutePath } catch {}
  $isHomepage=($urlPath -eq "/" -or [string]::IsNullOrWhiteSpace($urlPath))
  $priorStatus=[string]$r.sourceContractGateStatus

  $status = if($priorStatus -ne "L3_source_contract_candidate_requires_review"){
    "blocked_prior_l2_to_l3_gate"
  } elseif($identityRouteHits.Count -eq 0 -and $identityStrongHits.Count -eq 0){
    "blocked_route_identity_missing"
  } elseif($identityRouteHits.Count -eq 0 -and $isHomepage){
    "L3_family_page_needs_route_selection"
  } elseif($identityRouteHits.Count -eq 0){
    "blocked_route_league_mismatch_or_generic"
  } elseif($routeTokenHits.Count -eq 0){
    "L3_identity_page_needs_contract_route_selection"
  } elseif($bodyContractHits.Count -lt 2){
    "blocked_insufficient_contract_signals"
  } else {
    "L3_strict_route_contract_ready_for_shape_probe"
  }

  $rows += [pscustomobject]@{
    competitionSlug=$slug
    host=$r.host
    httpCode=$r.httpCode
    priorSourceContractGateStatus=$priorStatus
    strictRouteContractReviewStatus=$status
    url=$url
    effectiveUrl=$effectiveUrl
    title=$title
    ogTitle=$ogTitle
    h1=$h1
    isHomepage=$isHomepage
    expectedIdentityTerms=$terms
    identityStrongHits=$identityStrongHits
    identityRouteHits=$identityRouteHits
    routeTokenHits=$routeTokenHits
    bodyContractHits=$bodyContractHits
    snapshotBody=$r.snapshotBody
    standingsShapeProbeAllowed=($status -eq "L3_strict_route_contract_ready_for_shape_probe")
    standingsExtractionAllowed=$false
    canonicalCandidateWriteAllowed=$false
    productionTruthAllowed=$false
  }
}

$summary=[pscustomobject]@{
  status="passed"
  inputRowCount=@($j.rows).Count
  priorL3CandidateCount=@($j.rows | Where-Object {$_.sourceContractGateStatus -eq "L3_source_contract_candidate_requires_review"}).Count
  strictRouteContractReadyCount=@($rows | Where-Object {$_.strictRouteContractReviewStatus -eq "L3_strict_route_contract_ready_for_shape_probe"}).Count
  familyOrIdentityPageNeedsRouteSelectionCount=@($rows | Where-Object {$_.strictRouteContractReviewStatus -in @("L3_family_page_needs_route_selection","L3_identity_page_needs_contract_route_selection")}).Count
  blockedCount=@($rows | Where-Object {$_.strictRouteContractReviewStatus -notin @("L3_strict_route_contract_ready_for_shape_probe","L3_family_page_needs_route_selection","L3_identity_page_needs_contract_route_selection")}).Count
  statusCounts=($rows | Group-Object strictRouteContractReviewStatus | ForEach-Object {[pscustomobject]@{status=$_.Name;count=$_.Count}})
  readySlugs=@($rows | Where-Object {$_.strictRouteContractReviewStatus -eq "L3_strict_route_contract_ready_for_shape_probe"} | Select-Object -ExpandProperty competitionSlug)
  routeSelectionSlugs=@($rows | Where-Object {$_.strictRouteContractReviewStatus -in @("L3_family_page_needs_route_selection","L3_identity_page_needs_contract_route_selection")} | Select-Object -ExpandProperty competitionSlug)
  blockedSlugs=@($rows | Where-Object {$_.strictRouteContractReviewStatus -notin @("L3_strict_route_contract_ready_for_shape_probe","L3_family_page_needs_route_selection","L3_identity_page_needs_contract_route_selection")} | Select-Object -ExpandProperty competitionSlug)
  fetchExecutedNowCount=0
  searchExecutedNowCount=0
  broadSearchExecutedNowCount=0
  standingsExtractionExecutedNowCount=0
  canonicalWriteExecutedNowCount=0
  productionWriteExecutedNowCount=0
  truthAssertionExecutedNowCount=0
}

$out=[pscustomobject]@{
  generatedAtUtc=(Get-Date).ToUniversalTime().ToString("o")
  status="passed"
  inputPath=$InputPath
  summary=$summary
  rows=$rows
  policy=[pscustomobject]@{
    localSnapshotReviewOnly=$true
    noFetch=$true
    noSearch=$true
    noStandingsExtraction=$true
    noCanonicalCandidateWrite=$true
    noProductionTruth=$true
    readyOnlyAllowsShapeProbeNotExtraction=$true
  }
}

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($OutPath)) | Out-Null
$out | ConvertTo-Json -Depth 80 | Set-Content $OutPath -Encoding utf8
$summary | ConvertTo-Json -Depth 20
