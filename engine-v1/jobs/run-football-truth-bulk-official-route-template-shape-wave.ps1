param(
  [string]$InputPath = "data\football-truth\_diagnostics\strict-l1-to-l2-source-identity-host-family-gate-2026-06-17\strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json",
  [string]$OutPath = "data\football-truth\_diagnostics\bulk-official-route-template-shape-wave-2026-06-17\bulk-official-route-template-shape-wave-2026-06-17.json",
  [int]$MaxRoutesPerSlug = 10
)

$ErrorActionPreference="Stop"
$global:PSNativeCommandUseErrorActionPreference=$false

function ReadText([string]$Path){ if(Test-Path $Path){ try { return Get-Content $Path -Raw -ErrorAction Stop } catch { return "" } }; return "" }
function Clean([string]$s){ return (([string]$s) -replace "<script[\s\S]*?</script>"," " -replace "<style[\s\S]*?</style>"," " -replace "<[^>]+>"," " -replace "&nbsp;"," " -replace "&amp;","&" -replace "&#8211;","-" -replace "\s+"," ").Trim() }
function OriginOf([string]$url,[string]$fallbackHost){ try { $u=[Uri]$url; return "$($u.Scheme)://$($u.Host)" } catch { return "https://$fallbackHost" } }
function HostOf([string]$url){ try { return (([Uri]$url).Host.ToLowerInvariant() -replace "^www\.","") } catch { return "" } }
function SameHost([string]$url,[string]$expectedHost){ $u=HostOf $url; $e=(([string]$expectedHost).ToLowerInvariant() -replace "^www\.",""); return ($u -eq $e -or $u.EndsWith("."+$e)) }
function ResolveUrl([string]$base,[string]$path){ try { return ([Uri]::new([Uri]$base,$path)).AbsoluteUri } catch { return "" } }
function Hits([string]$text,[object[]]$tokens){ $t=([string]$text).ToLowerInvariant(); $h=@(); foreach($x in @($tokens)){ $n=([string]$x).ToLowerInvariant(); if($n -and $t.Contains($n)){ $h += [string]$x } }; return @($h | Select-Object -Unique) }
function CountRx([string]$text,[string]$pattern){ return ([regex]::Matches($text,$pattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::Singleline)).Count }
function AddRoute([System.Collections.Generic.List[string]]$list,[string]$base,[string]$route,[string]$expectedHost){
  $u=if($route -match "^https?://"){ $route } else { ResolveUrl $base $route }
  if([string]::IsNullOrWhiteSpace($u)){ return }
  if(-not (SameHost $u $expectedHost)){ return }
  if($u -match "\.(png|jpg|jpeg|svg|gif|webp|css|js|ico|pdf|zip|woff|woff2)(\?|$)"){ return }
  if(-not $list.Contains($u)){ $list.Add($u) | Out-Null }
}

$terms=@{
  "eng.1"=@("premier league"); "eng.2"=@("championship","efl championship"); "eng.3"=@("league one","efl league one"); "eng.4"=@("league two","efl league two"); "eng.5"=@("national league")
  "ita.1"=@("serie a"); "fra.1"=@("ligue 1"); "por.1"=@("liga portugal","primeira liga"); "por.2"=@("liga portugal 2","segunda liga")
  "bel.1"=@("jupiler pro league","pro league"); "bel.2"=@("challenger pro league"); "sui.1"=@("super league"); "sui.2"=@("challenge league")
  "den.1"=@("superliga"); "den.2"=@("1. division","division"); "irl.1"=@("premier division"); "irl.2"=@("first division")
  "bra.1"=@("serie a","brasileirao","brasileirão"); "bra.2"=@("serie b"); "arg.1"=@("primera division","primera división","liga profesional"); "arg.2"=@("primera nacional")
  "usa.1"=@("major league soccer","mls"); "usa.2"=@("usl championship"); "mex.1"=@("liga mx"); "mex.2"=@("expansion mx","expansión mx")
  "jpn.1"=@("j1 league"); "jpn.2"=@("j2 league"); "kor.1"=@("k league 1"); "kor.2"=@("k league 2"); "chn.1"=@("super league"); "chn.2"=@("league one")
  "aus.1"=@("a-league men","a-league"); "aus.2"=@("national premier leagues","npl"); "ksa.1"=@("saudi pro league","roshn saudi league"); "ksa.2"=@("first division league","yelo league")
  "fin.2"=@("ykkosliiga","ykkönen","ykkonen"); "ned.2"=@("keuken kampioen divisie","eerste divisie"); "chi.1"=@("primera division","primera división"); "chi.2"=@("primera b")
  "col.1"=@("liga betplay","primera a"); "col.2"=@("torneo betplay","primera b"); "per.1"=@("liga 1"); "uru.1"=@("primera division","primera división"); "uru.2"=@("segunda division","segunda división")
}

$specific=@{
  "eng.1"=@("/tables","/fixtures","/results")
  "eng.2"=@("/competitions/sky-bet-championship/table","/competitions/sky-bet-championship/fixtures","/competitions/sky-bet-championship/results")
  "eng.3"=@("/competitions/sky-bet-league-one/table","/competitions/sky-bet-league-one/fixtures","/competitions/sky-bet-league-one/results")
  "eng.4"=@("/competitions/sky-bet-league-two/table","/competitions/sky-bet-league-two/fixtures","/competitions/sky-bet-league-two/results")
  "eng.5"=@("/tables","/fixtures","/results")
  "ita.1"=@("/en/serie-a/league-table","/en/serie-a/calendar-and-results","/it/serie-a/classifica")
  "fra.1"=@("/standings","/calendar","/competitions/ligue1mcdonalds/standings","/competitions/ligue1mcdonalds/calendar")
  "por.1"=@("/pt/liga/classificacao","/en/standings","/pt/liga/calendario","/en/fixtures")
  "por.2"=@("/pt/liga2/classificacao","/en/liga-portugal-2/standings","/pt/liga2/calendario")
  "bel.1"=@("/en/jpl/standings","/en/jpl/calendar","/nl/jpl/klassement")
  "bel.2"=@("/en/cpl/standings","/en/cpl/calendar","/nl/cpl/klassement")
  "sui.1"=@("/matchcenter/super-league/table","/matchcenter/super-league/results","/matchcenter/super-league/fixtures")
  "sui.2"=@("/matchcenter/challenge-league/table","/matchcenter/challenge-league/results","/matchcenter/challenge-league/fixtures")
  "den.1"=@("/stilling","/kampe","/resultater")
  "den.2"=@("/1-division/stilling","/1-division/kampe","/turneringer/1-division")
  "irl.1"=@("/standings","/matches","/fixtures","/results")
  "irl.2"=@("/standings","/matches","/fixtures","/results")
  "bra.1"=@("/competicoes/brasileiro-serie-a/tabela","/competicoes/brasileiro-serie-a/jogos")
  "bra.2"=@("/competicoes/brasileiro-serie-b/tabela","/competicoes/brasileiro-serie-b/jogos")
  "arg.1"=@("/es/torneo/liga-profesional","/es/competicion/primera-division","/es/Calendario")
  "arg.2"=@("/es/torneo/primera-nacional","/es/competicion/primera-nacional","/es/Calendario")
  "usa.1"=@("/standings","/schedule/scores","/competitions/index")
  "usa.2"=@("/league/standings","/standings","/league/schedule","/scores")
  "mex.1"=@("/cancha/tablas/tablaGeneralClasificacion/sp/1","/cancha/calendario")
  "mex.2"=@("/cancha/tablas/tablaGeneralClasificacion/sp/2","/cancha/calendario")
  "jpn.1"=@("/en/standings/j1/","/en/matches/j1/","/en/results/j1/")
  "jpn.2"=@("/en/standings/j2/","/en/matches/j2/","/en/results/j2/")
  "kor.1"=@("/competition/teamRank.do","/competition/schedule.do")
  "kor.2"=@("/competition/teamRank.do","/competition/schedule.do")
  "chn.1"=@("/en/competitions/csl/standings","/en/competitions/csl/schedule")
  "chn.2"=@("/en/competitions/league-one/standings","/en/competitions/league-one/schedule")
  "aus.1"=@("/a-league-men/fixtures","/a-league-men/results","/a-league-men/standings")
  "aus.2"=@("/national-premier-leagues/fixtures","/national-premier-leagues/results","/national-premier-leagues/standings")
  "ksa.1"=@("/standings","/fixtures","/results")
  "ksa.2"=@("/competitions/yelo-league/standings","/competitions/yelo-league/fixtures")
  "fin.2"=@("/matches","/tables","/competition")
  "ned.2"=@("/stand","/programma","/uitslagen","/competitieprogramma")
  "chi.1"=@("/campeonato-primera","/estadisticas","/fixture","/tabla-de-posiciones")
  "chi.2"=@("/campeonato-ascenso","/estadisticas","/fixture","/tabla-de-posiciones")
  "col.1"=@("/liga-betplay-dimayor/tabla-de-posiciones","/liga-betplay-dimayor/fixture","/calendario-2025-2/")
  "col.2"=@("/torneo-betplay-dimayor/tabla-de-posiciones","/torneo-betplay-dimayor/fixture","/calendario-2025-2/")
  "per.1"=@("/resultados","/tabla-de-posiciones","/fixture")
  "uru.1"=@("/es/competitions/primera-division/standings","/es/competitions/primera-division/fixtures")
  "uru.2"=@("/es/competitions/segunda-division/standings","/es/competitions/segunda-division/fixtures")
}

$generic=@("/standings","/standing","/table","/tables","/fixtures","/fixture","/results","/matches","/schedule","/calendar","/competition","/competitions","/stats","/rankings")
$standingsTokens=@("standings","standing","table","tables","classification","classement","classifica","classificação","classificacao","posiciones","tabla","ranking","rankings","stilling","klassement","stand")
$rowStatTokens=@("played","pld","mp","matches played","won","drawn","lost","goals for","goals against","goal difference","gd","points","pts","puntos","punten","v","e","d")
$rejectTokens=@("news","video","shop","tickets","privacy","terms","cookie","login","register","account","media","gallery","newsletter","about","contact","women","academy","foundation","sponsor","partner")

$j=Get-Content $InputPath -Raw | ConvertFrom-Json
$l2=@($j.rows | Where-Object {$_.sourceIdentityGateStatus -eq "L2_source_identity_verified_host_family_only"})
$outRoot=[IO.Path]::GetDirectoryName($OutPath)
$snapshotDir=Join-Path $outRoot "snapshots"
New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null

$plannedRows=@()
$fetchRows=@()
$slugIndex=0

foreach($r in $l2){
  $slugIndex++
  $slug=[string]$r.competitionSlug
  $sourceHost=[string]$r.bestMatchedEvidence.host
  $seedUrl=[string]$r.bestMatchedEvidence.url
  if([string]::IsNullOrWhiteSpace($seedUrl)){ $seedUrl="https://$sourceHost" }
  $base=OriginOf $seedUrl $sourceHost
  $candidateList=New-Object 'System.Collections.Generic.List[string]'

  foreach($route in @($specific[$slug])){ AddRoute $candidateList $base $route $sourceHost }
  AddRoute $candidateList $base $seedUrl $sourceHost
  foreach($route in $generic){ AddRoute $candidateList $base $route $sourceHost }

  $routes=@($candidateList | Select-Object -First $MaxRoutesPerSlug)
  $plannedRows += [pscustomobject]@{ competitionSlug=$slug; host=$sourceHost; seedUrl=$seedUrl; plannedRouteCount=$routes.Count; routes=$routes }

  $rank=0
  foreach($url in $routes){
    $rank++
    $safe=($slug.Replace(".","_")+"_r"+$rank)
    $bodyPath=Join-Path $snapshotDir "$safe.body.txt"
    $metaPath=Join-Path $snapshotDir "$safe.meta.txt"
    $errPath=Join-Path $snapshotDir "$safe.err.txt"
    "fetch slug $slugIndex/$($l2.Count) route $rank/$($routes.Count) $slug $url"

    $curlArgs=@("--location","--silent","--show-error","--max-time","10","--connect-timeout","4","--compressed","--user-agent","football-truth-bulk-route-template-shape/1.0","--output",$bodyPath,"--write-out","%{http_code}`t%{content_type}`t%{url_effective}",$url)
    $curlOldEap=$ErrorActionPreference
    $ErrorActionPreference="Continue"
    $stdout = & curl.exe @curlArgs 2> $errPath
    $exit=$LASTEXITCODE
    $ErrorActionPreference=$curlOldEap
    $stdoutText=($stdout | Out-String)
    if($exit -eq 0){
      $stdoutText | Set-Content $metaPath -Encoding UTF8
      "" | Set-Content $errPath -Encoding UTF8
    } else {
      "" | Set-Content $metaPath -Encoding UTF8
      if(-not (Test-Path $errPath)){ $stdoutText | Set-Content $errPath -Encoding UTF8 }
    }

    $meta=ReadText $metaPath
    $parts=$meta.Trim() -split "`t"
    $httpCode=0
    if($parts.Count -ge 1 -and $parts[0] -match "^\d{3}$"){ $httpCode=[int]$parts[0] }
    $contentType=if($parts.Count -ge 2){$parts[1]}else{""}
    $effectiveUrl=if($parts.Count -ge 3){$parts[2]}else{""}

    $body=ReadText $bodyPath
    $plain=Clean $body
    $routeZone=($url+" "+$effectiveUrl).ToLowerInvariant()
    $headZone=($routeZone+" "+$plain.Substring(0,[Math]::Min(20000,$plain.Length))).ToLowerInvariant()

    $identityHits=Hits $headZone @($terms[$slug])
    $standingsHits=Hits $headZone $standingsTokens
    $statHits=Hits $headZone $rowStatTokens
    $rejectHits=Hits $routeZone $rejectTokens
    $tableTagCount=CountRx $body "<table\b"
    $trCount=CountRx $body "<tr\b"
    $jsonTableHints=CountRx $body '"(standings|standing|table|rank|position|points|played|won|drawn|lost|goalDifference|goalsFor|goalsAgainst|team|club)"\s*:'
    $htmlBytes=[Text.Encoding]::UTF8.GetByteCount($body)

    $shapeScore=0
    if($httpCode -ge 200 -and $httpCode -lt 300){ $shapeScore += 10 }
    if($identityHits.Count -gt 0){ $shapeScore += 30 + (10*$identityHits.Count) }
    if($standingsHits.Count -gt 0){ $shapeScore += 45 + (8*$standingsHits.Count) }
    if($statHits.Count -ge 3){ $shapeScore += 40 } elseif($statHits.Count -gt 0){ $shapeScore += 8*$statHits.Count }
    if($tableTagCount -gt 0){ $shapeScore += 35 }
    if($trCount -ge 8){ $shapeScore += 30 }
    if($jsonTableHints -ge 5){ $shapeScore += 45 }
    if($rejectHits.Count -gt 0){ $shapeScore -= 80 }
    if($htmlBytes -lt 800){ $shapeScore -= 35 }

    $status=if($exit -ne 0 -or $httpCode -lt 200 -or $httpCode -ge 300){
      "blocked_fetch_not_2xx"
    } elseif($rejectHits.Count -gt 0){
      "blocked_rejected_route_kind"
    } elseif($standingsHits.Count -eq 0 -and $tableTagCount -eq 0 -and $jsonTableHints -lt 3){
      "blocked_no_standings_shape_signal"
    } elseif($shapeScore -ge 115 -and (($statHits.Count -ge 3) -or $tableTagCount -gt 0 -or $jsonTableHints -ge 5)){
      "L4_bulk_route_template_shape_candidate_requires_parser_contract"
    } else {
      "blocked_insufficient_shape_score"
    }

    $saveBody=$status -eq "L4_bulk_route_template_shape_candidate_requires_parser_contract"
    if(-not $saveBody){
      Remove-Item -Force $bodyPath -ErrorAction SilentlyContinue
      Remove-Item -Force $metaPath -ErrorAction SilentlyContinue
      Remove-Item -Force $errPath -ErrorAction SilentlyContinue
      $bodyPath=$null; $metaPath=$null; $errPath=$null
    }

    $fetchRows += [pscustomobject]@{
      competitionSlug=$slug
      rank=$rank
      host=$sourceHost
      url=$url
      effectiveUrl=$effectiveUrl
      httpCode=$httpCode
      curlExitCode=$exit
      contentType=$contentType
      htmlBytes=$htmlBytes
      identityHits=$identityHits
      standingsHits=$standingsHits
      statHits=$statHits
      rejectHits=$rejectHits
      tableTagCount=$tableTagCount
      trCount=$trCount
      jsonTableHints=$jsonTableHints
      shapeScore=$shapeScore
      bulkRouteShapeStatus=$status
      snapshotBody=$bodyPath
      snapshotMeta=$metaPath
      snapshotErr=$errPath
      parserContractAllowed=($status -eq "L4_bulk_route_template_shape_candidate_requires_parser_contract")
      standingsExtractionAllowed=$false
      canonicalCandidateWriteAllowed=$false
      productionTruthAllowed=$false
    }
  }
}

$bestBySlug=@{}
foreach($row in $fetchRows){
  $slug=[string]$row.competitionSlug
  if(-not $bestBySlug.ContainsKey($slug) -or $row.shapeScore -gt $bestBySlug[$slug].shapeScore){
    $bestBySlug[$slug]=$row
  }
}
$bestRows=@($bestBySlug.Values | Sort-Object competitionSlug)
$shapeRows=@($fetchRows | Where-Object {$_.bulkRouteShapeStatus -eq "L4_bulk_route_template_shape_candidate_requires_parser_contract"})
$shapeSlugs=@($shapeRows | Select-Object -ExpandProperty competitionSlug -Unique)

$summary=[pscustomobject]@{
  status="passed"
  inputL2SlugCount=$l2.Count
  plannedRouteCount=($plannedRows | Measure-Object -Property plannedRouteCount -Sum).Sum
  fetchExecutedNowCount=$fetchRows.Count
  fetched2xxCount=@($fetchRows | Where-Object {$_.httpCode -ge 200 -and $_.httpCode -lt 300}).Count
  l4ShapeCandidateRouteCount=$shapeRows.Count
  l4ShapeCandidateSlugCount=$shapeSlugs.Count
  l4ShapeCandidateSlugs=$shapeSlugs
  bestRowsByStatus=($bestRows | Group-Object bulkRouteShapeStatus | ForEach-Object {[pscustomobject]@{status=$_.Name;count=$_.Count}})
  fetchRowsByStatus=($fetchRows | Group-Object bulkRouteShapeStatus | ForEach-Object {[pscustomobject]@{status=$_.Name;count=$_.Count}})
  httpCodeCounts=($fetchRows | Group-Object httpCode | Sort-Object Name | ForEach-Object {[pscustomobject]@{httpCode=$_.Name;count=$_.Count}})
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
  plannedRows=$plannedRows
  fetchRows=$fetchRows
  bestRows=$bestRows
  policy=[pscustomobject]@{
    officialHostTemplateFetchOnly=$true
    noSearch=$true
    noStandingsExtraction=$true
    noCanonicalCandidateWrite=$true
    noProductionTruth=$true
    nextAllowedAction="bulk_parser_contract_discovery_for_l4_shape_candidates"
  }
}

$out | ConvertTo-Json -Depth 100 | Set-Content $OutPath -Encoding UTF8
$summary | ConvertTo-Json -Depth 40



