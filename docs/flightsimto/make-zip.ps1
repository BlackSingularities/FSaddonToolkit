# Paczka ZIP na flightsim.to: instalator NSIS z wydania na GitHubie + README.txt.
# Użycie: docs/flightsimto/make-zip.ps1 [wersja]   (domyślnie plik VERSION)
param([string]$Version)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Version) { $Version = (Get-Content (Join-Path $root 'VERSION') -Raw).Trim() }
$setup = "FSAddonToolkit_${Version}_x64-setup.exe"
$out = Join-Path $root 'flightsim-paczka'
$stage = Join-Path $out 'zip'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null

gh release download "v$Version" --repo BlackSingularities/FSaddonToolkit --pattern $setup --dir $stage --clobber
if (-not (Test-Path (Join-Path $stage $setup))) { throw "Brak $setup w wydaniu v$Version" }

$pad = ' ' * [Math]::Max(0, $setup.Length - 'README.txt'.Length)
$readme = (Get-Content (Join-Path $PSScriptRoot 'zip-README.txt') -Raw -Encoding UTF8).
  Replace('{VERSION}', $Version).Replace('{SETUP}', $setup).Replace('{PAD}', $pad) -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText((Join-Path $stage 'README.txt'), $readme, (New-Object Text.UTF8Encoding $true))

$zip = Join-Path $out "FSAddonToolkit-$Version.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Copy-Item (Join-Path $PSScriptRoot 'FSAddonToolkit-poster-*.png') $out
Write-Host "ok $zip"
