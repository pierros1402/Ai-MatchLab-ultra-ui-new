param(
  [string]$InputPath = "data\football-truth\_diagnostics\league-only-source-identity-local-evidence-wave-ps-bounded-2026-06-17\league-only-source-identity-local-evidence-wave-ps-bounded-2026-06-17.json",
  [string]$OutPath = "data\football-truth\_diagnostics\strict-l1-to-l2-source-identity-host-family-gate-2026-06-17\strict-l1-to-l2-source-identity-host-family-gate-2026-06-17.json"
)

$ErrorActionPreference="Stop"

function HostsMatch([string]$actual, [object[]]$expected){
  if([string]::IsNullOrWhiteSpace($actual)){ return $false }
  $a=$actual.ToLowerInvariant()
  foreach($e in $expected){
    $h=([string]$e).ToLowerInvariant()
    if($a -eq $h -or $a.EndsWith("."+$h)){ return $true }
  }
  return $false
}

$expectedHosts=@{
  "eng.1"=@("premierleague.com")
  "eng.2"=@("efl.com")
  "eng.3"=@("efl.com")
  "eng.4"=@("efl.com")
  "eng.5"=@("nationalleague.org.uk")
  "ita.1"=@("legaseriea.it")
  "fra.1"=@("ligue1.com","lfp.fr")
  "fra.2"=@("ligue2.fr","lfp.fr")
  "por.1"=@("ligaportugal.pt")
  "por.2"=@("ligaportugal.pt")
  "bel.1"=@("proleague.be")
  "bel.2"=@("proleague.be")
  "sui.1"=@("sfl.ch")
  "sui.2"=@("sfl.ch")
  "den.1"=@("superliga.dk")
  "den.2"=@("divisionsforeningen.dk","dbu.dk")
  "irl.1"=@("leagueofireland.ie","fai.ie")
  "irl.2"=@("leagueofireland.ie","fai.ie")
  "bra.1"=@("cbf.com.br")
  "bra.2"=@("cbf.com.br")
  "arg.1"=@("afa.com.ar")
  "arg.2"=@("afa.com.ar")
  "usa.1"=@("mlssoccer.com")
  "usa.2"=@("uslsoccer.com","ussoccer.com")
  "mex.1"=@("ligamx.net")
  "mex.2"=@("ligamx.net")
  "jpn.1"=@("jleague.co","jleague.jp")
  "jpn.2"=@("jleague.co","jleague.jp")
  "kor.1"=@("kleague.com")
  "kor.2"=@("kleague.com")
  "chn.1"=@("thecfa.cn")
  "chn.2"=@("thecfa.cn")
  "aus.1"=@("aleagues.com.au")
  "aus.2"=@("footballaustralia.com.au","aleagues.com.au")
  "ksa.1"=@("spl.com.sa")
  "ksa.2"=@("saff.com.sa")
  "fin.2"=@("palloliitto.fi")
  "ned.2"=@("keukenkampioendivisie.nl","knvb.nl")
  "chi.1"=@("anfp.cl")
  "chi.2"=@("anfp.cl")
  "col.1"=@("dimayor.com.co")
  "col.2"=@("dimayor.com.co")
  "per.1"=@("liga1.pe","fpf.org.pe")
  "per.2"=@("fpf.org.pe")
  "uru.1"=@("auf.org.uy")
  "uru.2"=@("auf.org.uy")
}

$j=Get-Content $InputPath -Raw | ConvertFrom-Json
$rows=@()

foreach($r in @($j.rows)){
  $slug=[string]$r.competitionSlug
  $expected=@($expectedHosts[$slug])
  $evidence=@($r.evidence)
  $matching=@()
  foreach($e in $evidence){
    if(HostsMatch ([string]$e.host) $expected){
      $matching += $e
    }
  }

  $status = if($expected.Count -eq 0){
    "blocked_no_slug_specific_expected_host_policy"
  } elseif($matching.Count -gt 0){
    "L2_source_identity_verified_host_family_only"
  } else {
    "blocked_l1_host_family_mismatch"
  }

  $rows += [pscustomobject]@{
    competitionSlug=$slug
    lane=$r.lane
    l1EvidenceCount=$r.evidenceCount
    expectedHosts=$expected
    matchedExpectedHostEvidenceCount=$matching.Count
    sourceIdentityGateStatus=$status
    bestMatchedEvidence=if($matching.Count){$matching[0]}else{$null}
    allEvidence=$evidence
    extractionContractStatus="L3_not_verified"
    standingsExtractionAllowed=$false
    canonicalCandidateWriteAllowed=$false
    productionTruthAllowed=$false
  }
}

$summary=[pscustomobject]@{
  status="passed"
  inputL1RowCount=@($j.rows).Count
  l2VerifiedHostFamilyOnlyCount=@($rows | Where-Object {$_.sourceIdentityGateStatus -eq "L2_source_identity_verified_host_family_only"}).Count
  blockedCount=@($rows | Where-Object {$_.sourceIdentityGateStatus -ne "L2_source_identity_verified_host_family_only"}).Count
  statusCounts=($rows | Group-Object sourceIdentityGateStatus | ForEach-Object { [pscustomobject]@{ status=$_.Name; count=$_.Count } })
  l2Slugs=@($rows | Where-Object {$_.sourceIdentityGateStatus -eq "L2_source_identity_verified_host_family_only"} | Select-Object -ExpandProperty competitionSlug)
  blockedSlugs=@($rows | Where-Object {$_.sourceIdentityGateStatus -ne "L2_source_identity_verified_host_family_only"} | Select-Object -ExpandProperty competitionSlug)
  fetchExecutedNowCount=0
  searchExecutedNowCount=0
  broadSearchExecutedNowCount=0
  canonicalWriteExecutedNowCount=0
  productionWriteExecutedNowCount=0
  truthAssertionExecutedNowCount=0
}

$out=[pscustomObject]@{
  generatedAtUtc=(Get-Date).ToUniversalTime().ToString("o")
  status="passed"
  inputPath=$InputPath
  summary=$summary
  rows=$rows
  policy=[pscustomobject]@{
    l2HostFamilyOnlyIsNotExtractionContract=$true
    noExtraction=$true
    noCanonicalCandidateWrite=$true
    noProductionTruth=$true
    nextAllowedAction="L3_extraction_contract_discovery_for_L2_only"
  }
}

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($OutPath)) | Out-Null
$out | ConvertTo-Json -Depth 80 | Set-Content $OutPath -Encoding utf8
$summary | ConvertTo-Json -Depth 20
