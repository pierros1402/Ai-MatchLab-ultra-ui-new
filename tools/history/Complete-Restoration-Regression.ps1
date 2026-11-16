# Runs verification only. Never runs restoration, history append or derivation.
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$CheckpointZip = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\AIML_HISTORY_REMAINING_RESULT_20261116-073225.zip'
if (-not (Test-Path -LiteralPath $CheckpointZip -PathType Leaf)) { throw 'CHECKPOINT_ZIP_MISSING_FROM_DOWNLOADS' }
$ResultRoot = Join-Path ([IO.Path]::GetTempPath()) ('AIML_FINAL_REGRESSION_' + [guid]::NewGuid().ToString('N'))
$CheckpointRoot = Join-Path $ResultRoot 'checkpoint'
New-Item -ItemType Directory -Path $ResultRoot | Out-Null
Expand-Archive -LiteralPath $CheckpointZip -DestinationPath $CheckpointRoot
$Manifest = Get-Content -LiteralPath (Join-Path $CheckpointRoot 'RESULT_SHA256_MANIFEST.json') -Raw | ConvertFrom-Json
if ($Manifest.Count -ne 41) { throw 'EXACT_41_CHECKPOINT_FILES_REQUIRED' }
foreach ($Entry in $Manifest) {
    $Target = [IO.Path]::GetFullPath((Join-Path $CheckpointRoot $Entry.path))
    if (-not $Target.StartsWith($CheckpointRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'MANIFEST_PATH_OUTSIDE_CHECKPOINT' }
    if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Entry.sha256) { throw "CHECKPOINT_HASH_FAILED: $($Entry.path)" }
}
Push-Location -LiteralPath $ProjectRoot
try {
    & node (Join-Path $PSScriptRoot 'run-restoration-final-regression.mjs') $CheckpointRoot (Join-Path $ResultRoot 'regression')
    $RegressionExit = $LASTEXITCODE
    & node (Join-Path $PSScriptRoot 'verify-restoration-final-readback.mjs') $CheckpointRoot 'C:\workspace\AIML_HISTORY_FINAL_20261116\bundle\protection' (Join-Path $ResultRoot 'final-readback.json')
    if ($LASTEXITCODE -ne 0) { throw 'POST_REGRESSION_READBACK_FAILED' }
    if ($RegressionExit -ne 0) { throw 'REGRESSION_NOT_ALL_PASS_SEE_LOGS' }
    Write-Host 'FINAL_REGRESSION=PASS'
} finally {
    Pop-Location
    $ResultZip = Join-Path ([Environment]::GetFolderPath('UserProfile')) ('Downloads\AIML_FINAL_REGRESSION_RESULT_' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
    $Outputs = @('regression', 'final-readback.json') | ForEach-Object { Join-Path $ResultRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
    if ($Outputs.Count -gt 0) { Compress-Archive -Path $Outputs -DestinationPath $ResultZip -CompressionLevel Optimal }
    Write-Host "RESULT_ZIP=$ResultZip"
}
