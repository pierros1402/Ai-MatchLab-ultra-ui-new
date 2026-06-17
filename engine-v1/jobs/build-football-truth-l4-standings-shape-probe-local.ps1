param(
  [string]$StrictReviewPath = "data\football-truth\_diagnostics\strict-l3-route-contract-review-board-2026-06-17\strict-l3-route-contract-review-board-2026-06-17.json",
  [string]$RouteSelectionPath = "data\football-truth\_diagnostics\controlled-l3-route-selection-fetch-gate-2026-06-17\controlled-l3-route-selection-fetch-gate-2026-06-17.json",
  [string]$OutPath = "data\football-truth\_diagnostics\l4-standings-shape-probe-local-2026-06-17\l4-standings-shape-probe-local-2026-06-17.json"
)

$ErrorActionPreference="Stop"

function ReadText([string]$Path){
  if(Test-Path $Path){
    try { return Get-Content $Path -Raw -ErrorAction Stop } catch { return "" }
  }
  return ""
}
function Clean([string]$s){
  return (([string]$s) -replace "<script[\s\S]*?</script>"," " -replace "<style[\s\S]*?</style>"," " -replace "<[^>]+>"," " -replace "&nbsp;"," " -replace "&amp;","&" -replace "&#8211;","-" -replace "\s+"," ").Trim()
}
function ContainsToken([string]$text,[object[]]$tokens){
  $t=([string]$text).ToLowerInvariant()
  $hits=@()
  foreach($x in @($tokens)){
    $n=([string]$x).ToLowerInvariant()
    if($n -and $t.Contains($n)){ $hits += [string]$x }
  }
  return @($hits | Select-Object -Unique)
}
function CountRegex([string]$text,[string]$pattern){
  return ([regex]::Matches($text,$pattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::Singleline)).Count
}

$strict=Get-Content $StrictReviewPath -Raw | ConvertFrom-Json
$route=Get-Content $RouteSelectionPath -Raw | ConvertFrom-Json

$candidates=@()

foreach($r in @($strict.rows | Where-Object {$_.strictRouteContractReviewStatus -eq "L3_strict_route_contract_ready_for_shape_probe"})){
  $candidates += [pscustomobject]@{
    source="strict_review_carry_forward"
    competitionSlug=$r.competitionSlug
    host=$r.host
    url=$r.url
    effectiveUrl=$r.effectiveUrl
    snapshotBody=$r.snapshotBody
    routeStatus=$r.strictRouteContractReviewStatus
  }
}

foreach($r in @($route.fetchRows | Where-Object {$_.routeSelectionFetchStatus -eq "L3_selected_route_contract_ready_for_shape_probe"})){
  $candidates += [pscustomobject]@{
    source="route_selection"
    competitionSlug=$r.competitionSlug
    host=$r.host
    url=$r.url
    effectiveUrl=$r.effectiveUrl
    snapshotBody=$r.snapshotBody
    routeStatus=$r.routeSelectionFetchStatus
  }
}

$standingsTokens=@("standings","standing","table","tables","classification","classement","classifica","classificação","classificacao","posiciones","tabla","ranking","rankings","stilling")
$rowStatTokens=@("played","pld","matches played","mp","won","drawn","lost","goals for","goals against","goal difference","gd","points","pts","pts.","puntos","punten","v","e","d")
$badRouteTokens=@("news","video","shop","tickets","fixture news","calendar news","preview","report")

$rows=@()
foreach($c in $candidates){
  $body=ReadText ([string]$c.snapshotBody)
  $plain=Clean $body
  $routeText=(([string]$c.url)+" "+([string]$c.effectiveUrl)).ToLowerInvariant()
  $headText=($routeText+" "+$plain.Substring(0,[Math]::Min(16000,$plain.Length))).ToLowerInvariant()

  $standingsHits=ContainsToken $headText $standingsTokens
  $rowStatHits=ContainsToken $headText $rowStatTokens
  $badHits=ContainsToken $routeText $badRouteTokens

  $tableTagCount=CountRegex $body "<table\b"
  $trCount=CountRegex $body "<tr\b"
  $jsonTableHints=CountRegex $body '"(standings|standing|table|rank|position|points|played|won|drawn|lost|goalDifference|goalsFor|goalsAgainst)"\s*:'
  $teamLikeRows=CountRegex $plain '\b\d{1,2}\s+[\p{L}\p{N} .''\-]{3,60}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+[-+]?\d{1,3}\s+\d{1,3}\b'
  $rankPositionHints=CountRegex $plain "\b(pos|position|rank|#|club|team|teams|played|points|pts|gd)\b"
  $htmlBytes=[Text.Encoding]::UTF8.GetByteCount($body)

  $shapeScore=0
  if($standingsHits.Count -gt 0){ $shapeScore += 40 + (10*$standingsHits.Count) }
  if($rowStatHits.Count -ge 3){ $shapeScore += 45 }
  elseif($rowStatHits.Count -gt 0){ $shapeScore += 10*$rowStatHits.Count }
  if($tableTagCount -gt 0){ $shapeScore += 35 }
  if($trCount -ge 8){ $shapeScore += 35 }
  if($jsonTableHints -ge 5){ $shapeScore += 45 }
  if($teamLikeRows -ge 8){ $shapeScore += 60 }
  if($rankPositionHints -ge 4){ $shapeScore += 20 }
  if($badHits.Count -gt 0){ $shapeScore -= 80 }
  if($htmlBytes -lt 1000){ $shapeScore -= 40 }

  $status=if($badHits.Count -gt 0){
    "blocked_bad_route_news_or_commercial"
  } elseif($standingsHits.Count -eq 0 -and $tableTagCount -eq 0 -and $jsonTableHints -lt 3){
    "blocked_no_standings_table_signal"
  } elseif($shapeScore -ge 110 -and (($rowStatHits.Count -ge 3) -or $tableTagCount -gt 0 -or $jsonTableHints -ge 5 -or $teamLikeRows -ge 8)){
    "L4_standings_shape_candidate_requires_parser_contract"
  } else {
    "blocked_insufficient_standings_shape"
  }

  $rows += [pscustomobject]@{
    competitionSlug=$c.competitionSlug
    source=$c.source
    host=$c.host
    url=$c.url
    effectiveUrl=$c.effectiveUrl
    routeStatus=$c.routeStatus
    htmlBytes=$htmlBytes
    standingsHits=$standingsHits
    rowStatHits=$rowStatHits
    badRouteHits=$badHits
    tableTagCount=$tableTagCount
    trCount=$trCount
    jsonTableHints=$jsonTableHints
    teamLikeRows=$teamLikeRows
    rankPositionHints=$rankPositionHints
    shapeScore=$shapeScore
    standingsShapeProbeStatus=$status
    snapshotBody=$c.snapshotBody
    parserContractAllowed=($status -eq "L4_standings_shape_candidate_requires_parser_contract")
    standingsExtractionAllowed=$false
    canonicalCandidateWriteAllowed=$false
    productionTruthAllowed=$false
  }
}

$bestBySlug=@{}
foreach($r in $rows){
  $slug=[string]$r.competitionSlug
  if(-not $bestBySlug.ContainsKey($slug) -or $r.shapeScore -gt $bestBySlug[$slug].shapeScore){
    $bestBySlug[$slug]=$r
  }
}
$bestRows=@($bestBySlug.Values | Sort-Object competitionSlug)

$summary=[pscustomobject]@{
  status="passed"
  inputCandidateRouteCount=$candidates.Count
  inputCandidateSlugCount=@($candidates | Select-Object -ExpandProperty competitionSlug -Unique).Count
  l4ShapeCandidateRouteCount=@($rows | Where-Object {$_.standingsShapeProbeStatus -eq "L4_standings_shape_candidate_requires_parser_contract"}).Count
  l4ShapeCandidateSlugCount=@($bestRows | Where-Object {$_.standingsShapeProbeStatus -eq "L4_standings_shape_candidate_requires_parser_contract"}).Count
  bestRowsByStatus=($bestRows | Group-Object standingsShapeProbeStatus | ForEach-Object {[pscustomobject]@{status=$_.Name;count=$_.Count}})
  routeRowsByStatus=($rows | Group-Object standingsShapeProbeStatus | ForEach-Object {[pscustomobject]@{status=$_.Name;count=$_.Count}})
  l4ShapeCandidateSlugs=@($bestRows | Where-Object {$_.standingsShapeProbeStatus -eq "L4_standings_shape_candidate_requires_parser_contract"} | Select-Object -ExpandProperty competitionSlug)
  blockedOrInsufficientSlugs=@($bestRows | Where-Object {$_.standingsShapeProbeStatus -ne "L4_standings_shape_candidate_requires_parser_contract"} | Select-Object -ExpandProperty competitionSlug)
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
  strictReviewPath=$StrictReviewPath
  routeSelectionPath=$RouteSelectionPath
  summary=$summary
  rows=$rows
  bestRows=$bestRows
  policy=[pscustomobject]@{
    localSnapshotsOnly=$true
    noFetch=$true
    noSearch=$true
    noStandingsExtraction=$true
    noCanonicalCandidateWrite=$true
    noProductionTruth=$true
    l4OnlyAllowsParserContractBuildNotCandidateRows=$true
  }
}

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($OutPath)) | Out-Null
$out | ConvertTo-Json -Depth 90 | Set-Content $OutPath -Encoding utf8
$summary | ConvertTo-Json -Depth 30
