param(
  [Parameter(Mandatory=$true)][string]$Mdloader,
  [Parameter(Mandatory=$true)][string]$Firmware,
  [Parameter(Mandatory=$true)][string]$Backup,
  [int]$TimeoutSeconds = 180
)
$ErrorActionPreference = 'Stop'
$expectedFirmwareSha = 'DB4654161DB9A02706ABEA3E5D022D57051CD9FF2D5959122906E082373199D6'

$fwSha = (Get-FileHash $Firmware -Algorithm SHA256).Hash
Write-Output "FIRMWARE_SHA256=$fwSha"
if ($fwSha -ne $expectedFirmwareSha) { throw "firmware SHA-256 mismatch, aborting before any device action" }

# Wait for exactly one bootloader device.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$listed = $null
while ((Get-Date) -lt $deadline) {
  $listOut = (& $Mdloader --list 2>&1 | Out-String)
  $ports = [regex]::Matches($listOut, 'Device port:\s*\S+')
  if ($ports.Count -gt 1) { throw "mdloader lists $($ports.Count) devices, aborting (expected exactly 1)" }
  if ($ports.Count -eq 1) { $listed = $listOut; break }
  Start-Sleep -Seconds 2
}
if (-not $listed) { throw "no bootloader device appeared within $TimeoutSeconds s" }
Write-Output '--- mdloader --list ---'
Write-Output $listed.Trim()

# Backup (read-only on the device).
$uploadOut = (& $Mdloader --first --upload $Backup --addr 0x4000 --size 0x10000 2>&1 | Out-String)
Write-Output '--- mdloader --upload ---'
Write-Output $uploadOut.Trim()
if ($uploadOut -notmatch 'SAMD51J18A') { throw "unexpected or missing MCU id in upload output, aborting before --download" }

$item = Get-Item $Backup
$backupSha = (Get-FileHash $Backup -Algorithm SHA256).Hash
Write-Output "BACKUP_PATH=$($item.FullName)"
Write-Output "BACKUP_SIZE=$($item.Length)"
Write-Output "BACKUP_SHA256=$backupSha"
if ($item.Length -ne 0x10000) { throw "backup size $($item.Length) != 65536, aborting before --download" }
if ($backupSha -eq 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') { throw "backup is empty, aborting" }
Write-Output 'STAGE1_OK'
