param(
  [string]$InputPath = "data\football-truth\_diagnostics\strict-l3-route-contract-review-board-2026-06-17\strict-l3-route-contract-review-board-2026-06-17.json",
  [string]$OutPath = "data\football-truth\_diagnostics\controlled-l3-route-selection-fetch-gate-2026-06-17\controlled-l3-route-selection-fetch-gate-2026-06-17.json"
)

$ErrorActionPreference="Stop"
$global:PSNativeCommandUseErrorActionPreference=$false

function ReadText([string]$Path){
  if(Test-Path $Path){
    try { return Get-Content $Path -Raw -ErrorAction Stop } catch { return "" }
  }
  return ""
}
function Clean([string]$s){
  return (([string]$s) -replace "<script[\s\S]*?</script>"," " -replace "<style[\s\S]*?</style>"," " -replace "<[^>]+>"," " -replace "&nbsp;"," " -replace "&amp;","&" -replace "&#8211;","-" -replace "\s+"," ").Trim()
}
function GetHost([string]$Url){
  try { return ([Uri]$Url).Host.ToLowerInvariant() -replace "^www\.","" } catch { return "" }
}
function SameHost([string]$Url,[string]$ExpectedHost){
  $u=GetHost $Url
  $e=(([string]$ExpectedHost).ToLowerInvariant() -replace "^www\.","")
  return ($u -eq $e -or $u.EndsWith("."+$e))
}
function ResolveHref([string]$Base,[string]$Href){
  if([string]::IsNullOrWhiteSpace($Href)){ return "" }
  if($Href.StartsWith("#") -or $Href.StartsWith("mailto:") -or $Href.StartsWith("tel:") -or $Href.StartsWith("javascript:")){ return "" }
  try { return ([Uri]::new([Uri]$Base,$Href)).AbsoluteUri } catch { return "" }
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
  "fra.1"=@("ligue 1")
  "por.1"=@("liga portugal","primeira liga")
  "arg.1"=@("primera division","primera división","liga profesional")
  "usa.1"=@("major league soccer","mls")
  "jpn.1"=@("j1 league")
  "ned.2"=@("keuken kampioen divisie","eerste divisie")
  "por.2"=@("liga portugal 2","segunda liga")
  "den.2"=@("1. division","division")
  "usa.2"=@("usl championship")
  "jpn.2"=@("j2 league")
  "chi.1"=@("primera division","primera división")
  "col.1"=@("liga betplay","primera a")
  "col.2"=@("torneo betplay","primera b")
}

$routeTokens=@(
  "standings","standing","table","tables","fixtures","fixture","results","result","matches","match","schedule","calendar",
  "classification","classement","classifica","classificação","classificacao","posiciones","tabla","calendario","resultados",
  "stilling","kampe","program","tabelle","stats","rankings","competitions","competition"
)

$rejectTokens=@(
  "news","video","videos","shop","store","tickets","ticketing","hospitality","sponsor","partners","privacy","terms",
  "cookie","login","register","account","media","gallery","photos","newsletter","about","contact","careers","foundation",
  "academy","women","esports","fantasy"
)

$j=Get-Content $InputPath -Raw | ConvertFrom-Json
$outRoot=[IO.Path]::GetDirectoryName($OutPath)
$snapshotDir=Join-Path $outRoot "snapshots"
New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null

$routeSelectionStatuses=@("L3_family_page_needs_route_selection","L3_identity_page_needs_contract_route_selection")
$routeRows=@($j.rows | Where-Object { $_.strictRouteContractReviewStatus -in $routeSelectionStatuses })
$carryReady=@($j.rows | Where-Object { $_.strictRouteContractReviewStatus -eq "L3_strict_route_contract_ready_for_shape_probe" })

$selectedRows=@()
$fetchRows=@()
$i=0

foreach($r in $routeRows){
  $i++
  $slug=[string]$r.competitionSlug
  $sourceHost=[string]$r.host
  $base=if([string]::IsNullOrWhiteSpace([string]$r.effectiveUrl)){[string]$r.url}else{[string]$r.effectiveUrl}
  $body=ReadText ([string]$r.snapshotBody)
  $terms=@($expectedTerms[$slug])
  $candidateObjs=@()

  $anchorPattern='<a\b[^>]*href\s*=\s*["''](?<href>[^"'']+)["''][^>]*>(?<text>.*?)</a>'
  $anchorMatches=[regex]::Matches($body,$anchorPattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::Singleline)
  foreach($m in $anchorMatches){
    $href=[string]$m.Groups["href"].Value
    $anchorText=Clean ([string]$m.Groups["text"].Value)
    $u=ResolveHref $base $href
    if(-not $u){ continue }
    if(-not (SameHost $u $sourceHost)){ continue }
    if($u -match "\.(png|jpg|jpeg|svg|gif|webp|css|js|ico|pdf|zip|woff|woff2)(\?|$)"){ continue }

    $combined=($u+" "+$anchorText).ToLowerInvariant()
    $routeHits=ContainsAny $combined $routeTokens
    $identityHits=ContainsAny $combined $terms
    $rejectHits=ContainsAny $combined $rejectTokens

    $score=0
    if($routeHits.Count -gt 0){ $score += 70 + (10*$routeHits.Count) }
    if($identityHits.Count -gt 0){ $score += 50 + (15*$identityHits.Count) }
    if($u -match "/(standings|table|fixtures|results|matches|schedule|calendar|competitions|competition|stats|rankings|tabla|resultados|calendario|classement|classifica|classificacao|classificação|stilling)(/|$|\?)"){ $score += 35 }
    if($u -match "/$"){ $score -= 15 }
    if($rejectHits.Count -gt 0){ $score -= 70 }
    if($routeHits.Count -eq 0){ $score -= 40 }

    if($score -ge 50){
      $candidateObjs += [pscustomobject]@{
        competitionSlug=$slug
        sourceHost=$sourceHost
        url=$u
        anchorText=$anchorText
        score=$score
        routeHits=$routeHits
        identityHits=$identityHits
        rejectHits=$rejectHits
      }
    }
  }

  $absolutePattern='https?://[^\s"'']+'
  foreach($m in [regex]::Matches($body,$absolutePattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase)){
    $u=([string]$m.Value).TrimEnd(".",";",",",")","]","}")
    if(-not (SameHost $u $sourceHost)){ continue }
    if($u -match "\.(png|jpg|jpeg|svg|gif|webp|css|js|ico|pdf|zip|woff|woff2)(\?|$)"){ continue }
    $combined=$u.ToLowerInvariant()
    $routeHits=ContainsAny $combined $routeTokens
    $identityHits=ContainsAny $combined $terms
    $rejectHits=ContainsAny $combined $rejectTokens
    $score=0
    if($routeHits.Count -gt 0){ $score += 70 + (10*$routeHits.Count) }
    if($identityHits.Count -gt 0){ $score += 40 + (15*$identityHits.Count) }
    if($rejectHits.Count -gt 0){ $score -= 70 }
    if($routeHits.Count -eq 0){ $score -= 45 }
    if($score -ge 50){
      $candidateObjs += [pscustomobject]@{
        competitionSlug=$slug
        sourceHost=$sourceHost
        url=$u
        anchorText=""
        score=$score
        routeHits=$routeHits
        identityHits=$identityHits
        rejectHits=$rejectHits
      }
    }
  }

  $byUrl=@{}
  foreach($c in $candidateObjs){
    if(-not $byUrl.ContainsKey($c.url) -or $c.score -gt $byUrl[$c.url].score){
      $byUrl[$c.url]=$c
    }
  }
  $top=@($byUrl.Values | Sort-Object -Property @{Expression={$_.score};Descending=$true}, @{Expression={$_.url};Ascending=$true} | Select-Object -First 3)

  $selectedRows += [pscustomobject]@{
    competitionSlug=$slug
    sourceStatus=$r.strictRouteContractReviewStatus
    host=$sourceHost
    sourceUrl=$r.url
    candidateCount=@($byUrl.Values).Count
    selectedCandidateCount=$top.Count
    selectedCandidates=$top
  }

  $rank=0
  foreach($c in $top){
    $rank++
    $safe=($slug.Replace(".","_")+"_r"+$rank)
    $bodyPath=Join-Path $snapshotDir "$safe.body.txt"
    $metaPath=Join-Path $snapshotDir "$safe.meta.txt"
    $errPath=Join-Path $snapshotDir "$safe.err.txt"
    "fetch route $i/$($routeRows.Count) rank $rank $slug $($c.url)"
    $curlArgs=@("--location","--silent","--show-error","--max-time","18","--connect-timeout","7","--compressed","--user-agent","football-truth-route-selection-gate/1.0","--output",$bodyPath,"--write-out","%{http_code}`t%{content_type}`t%{url_effective}",$c.url)
    $stdout = & curl.exe @curlArgs 2>&1
    $exit=$LASTEXITCODE
    $stdoutText=($stdout | Out-String)
    if($exit -eq 0){
      $stdoutText | Set-Content $metaPath -Encoding utf8
      "" | Set-Content $errPath -Encoding utf8
    } else {
      "" | Set-Content $metaPath -Encoding utf8
      $stdoutText | Set-Content $errPath -Encoding utf8
    }

    $meta=ReadText $metaPath
    $parts=$meta.Trim() -split "`t"
    $httpCode=0
    if($parts.Count -ge 1 -and $parts[0] -match "^\d{3}$"){ $httpCode=[int]$parts[0] }
    $contentType=if($parts.Count -ge 2){$parts[1]}else{""}
    $effectiveUrl=if($parts.Count -ge 3){$parts[2]}else{""}
    $routeBody=ReadText $bodyPath
    $plain=Clean $routeBody
    $strongZone=($c.url+" "+$effectiveUrl+" "+$plain.Substring(0,[Math]::Min(12000,$plain.Length))).ToLowerInvariant()
    $identityHits=ContainsAny $strongZone $terms
    $routeHits=ContainsAny ($c.url+" "+$effectiveUrl+" "+$plain.Substring(0,[Math]::Min(6000,$plain.Length))) $routeTokens
    $contractHits=ContainsAny $strongZone @("standings","table","fixtures","results","matches","schedule","competition","season","clubs","teams","api","json","graphql","calendar")

    $status=if($exit -ne 0 -or $httpCode -lt 200 -or $httpCode -ge 300){
      "blocked_route_candidate_fetch_not_2xx"
    } elseif($routeHits.Count -eq 0){
      "blocked_selected_route_no_route_token"
    } elseif($identityHits.Count -eq 0){
      "selected_route_fetched_needs_manual_identity_review"
    } elseif($contractHits.Count -lt 2){
      "blocked_selected_route_insufficient_contract_signals"
    } else {
      "L3_selected_route_contract_ready_for_shape_probe"
    }

    $fetchRows += [pscustomobject]@{
      competitionSlug=$slug
      rank=$rank
      url=$c.url
      effectiveUrl=$effectiveUrl
      host=$sourceHost
      score=$c.score
      httpCode=$httpCode
      curlExitCode=$exit
      contentType=$contentType
      sourceRouteHits=$c.routeHits
      sourceIdentityHits=$c.identityHits
      fetchedIdentityHits=$identityHits
      fetchedRouteHits=$routeHits
      fetchedContractHits=$contractHits
      routeSelectionFetchStatus=$status
      snapshotBody=$bodyPath
      snapshotMeta=$metaPath
      snapshotErr=$errPath
      standingsShapeProbeAllowed=($status -eq "L3_selected_route_contract_ready_for_shape_probe")
      standingsExtractionAllowed=$false
      canonicalCandidateWriteAllowed=$false
      productionTruthAllowed=$false
    }
  }
}

$newReadySlugs=@($fetchRows | Where-Object {$_.routeSelectionFetchStatus -eq "L3_selected_route_contract_ready_for_shape_probe"} | Select-Object -ExpandProperty competitionSlug -Unique)
$carryReadySlugs=@($carryReady | Select-Object -ExpandProperty competitionSlug)
$combinedReadySlugs=@($carryReadySlugs + $newReadySlugs | Select-Object -Unique)

$summary=[pscustomobject]@{
  status="passed"
  inputRowCount=@($j.rows).Count
  carryForwardStrictReadyCount=$carryReady.Count
  routeSelectionInputCount=$routeRows.Count
  routeSelectionWithCandidateCount=@($selectedRows | Where-Object {$_.selectedCandidateCount -gt 0}).Count
  routeCandidateFetchExecutedCount=$fetchRows.Count
  newlySelectedRouteReadyCount=$newReadySlugs.Count
  combinedShapeProbeEligibleCount=$combinedReadySlugs.Count
  carryForwardReadySlugs=$carryReadySlugs
  newlySelectedRouteReadySlugs=$newReadySlugs
  combinedShapeProbeEligibleSlugs=$combinedReadySlugs
  fetchStatusCounts=($fetchRows | Group-Object routeSelectionFetchStatus | ForEach-Object {[pscustomobject]@{status=$_.Name;count=$_.Count}})
  routeSelectionWithoutCandidates=@($selectedRows | Where-Object {$_.selectedCandidateCount -eq 0} | Select-Object -ExpandProperty competitionSlug)
  fetchExecutedNowCount=$fetchRows.Count
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
  selectedRows=$selectedRows
  fetchRows=$fetchRows
  carryForwardReadyRows=$carryReady
  policy=[pscustomobject]@{
    routeSelectionFromOfficialFetchedPagesOnly=$true
    noSearch=$true
    noStandingsExtraction=$true
    noCanonicalCandidateWrite=$true
    noProductionTruth=$true
    readyOnlyAllowsShapeProbeNotExtraction=$true
  }
}

$out | ConvertTo-Json -Depth 90 | Set-Content $OutPath -Encoding utf8
$summary | ConvertTo-Json -Depth 30

