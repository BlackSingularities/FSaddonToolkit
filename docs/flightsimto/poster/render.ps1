# Renderuje plakat flightsim.to w 1920x1080 i 3840x2160 przez headless Edge.
$ErrorActionPreference = 'Continue'  # Edge pisze komunikaty na stderr
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Split-Path -Parent $here
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$url = 'file:///' + ((Join-Path $here 'poster.html') -replace '\\', '/')
$profile = Join-Path $env:TEMP 'fsat-poster-edge'
foreach ($s in @(@{ f = 1; n = '1920x1080' }, @{ f = 2; n = '3840x2160' })) {
  $png = Join-Path $out "FSAddonToolkit-poster-$($s.n).png"
  & $edge --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" `
    --allow-file-access-from-files --virtual-time-budget=8000 `
    --window-size=1920,1080 --force-device-scale-factor=$($s.f) `
    --screenshot="$png" $url | Out-Null
  Write-Host "ok $png"
}
