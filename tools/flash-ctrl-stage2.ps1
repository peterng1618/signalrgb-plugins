param(
  [Parameter(Mandatory=$true)][string]$Mdloader,
  [Parameter(Mandatory=$true)][string]$Firmware,
  [Parameter(Mandatory=$true)][string]$Verifier
)
$ErrorActionPreference = 'Stop'
$expectedFirmwareSha = 'DB4654161DB9A02706ABEA3E5D022D57051CD9FF2D5959122906E082373199D6'

$fwSha = (Get-FileHash $Firmware -Algorithm SHA256).Hash
if ($fwSha -ne $expectedFirmwareSha) { throw "firmware SHA-256 mismatch, aborting" }
Write-Output "FIRMWARE_SHA256=$fwSha"

$listOut = (& $Mdloader --list 2>&1 | Out-String)
$ports = [regex]::Matches($listOut, 'Device port:\s*\S+')
Write-Output '--- mdloader --list (pre-download) ---'
Write-Output $listOut.Trim()
if ($ports.Count -ne 1) { throw "expected exactly 1 bootloader device, found $($ports.Count), aborting" }

$dl = (& $Mdloader --first --download $Firmware --restart 2>&1 | Out-String)
Write-Output '--- mdloader --download --restart ---'
Write-Output $dl.Trim()
if ($dl -notmatch 'Writing firmware\.\.\. Complete!') { throw "mdloader did not report a complete write" }
if ($dl -notmatch 'SAMD51J18A') { throw "mdloader reported an unexpected MCU id" }

# Wait for the application firmware to re-enumerate.
$deadline = (Get-Date).AddSeconds(60)
$verifierOut = $null
while ((Get-Date) -lt $deadline) {
  $verifierOut = (& python $Verifier 2>&1 | Out-String)
  if ($verifierOut -match 'PASS') { break }
  Start-Sleep -Seconds 2
}
Write-Output '--- post-flash verifier ---'
Write-Output $verifierOut.Trim()
if ($verifierOut -notmatch 'PASS') { throw "post-flash verification failed" }
Write-Output 'STAGE2_OK'
