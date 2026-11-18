# Elevated USB recovery for the L10's CH340 when it fails enumeration.
# Usage (elevated): powershell -ExecutionPolicy Bypass -File tools\l10_usb_recover.ps1
#                    [-ResetParentHub] [-Port COM4]
# Without -ResetParentHub it only rescans and removes the failed node.
# -ResetParentHub also cycles the internal hub, which drops every device behind it
# (Kraken Z, Lian Li display) for a few seconds.
param(
    [string]$FailedInstanceId = 'USB\VID_0000&PID_0004\6&12436B34&0&2',
    [string]$ParentHub = 'USB\VID_1A40&PID_0101\5&13de0221&0&5',
    [string]$Port = 'COM4',
    [switch]$ResetParentHub
)

$ErrorActionPreference = 'Continue'
$log = Join-Path $env:TEMP 'l10_usb_recover.log'
Start-Transcript -Path $log -Force | Out-Null

$current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Not elevated.'
    Stop-Transcript | Out-Null
    exit 2
}

function Show-State($label) {
    Write-Host "--- $label"
    Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -like '*VID_1A86*' -or $_.FriendlyName -like '*Unknown USB*' } |
        Select-Object Status, Problem, FriendlyName, InstanceId | Format-Table -AutoSize | Out-String | Write-Host
}

Show-State 'before'

Write-Host 'pnputil /scan-devices'
pnputil /scan-devices
Start-Sleep -Seconds 3

if (Get-PnpDevice -InstanceId $FailedInstanceId -ErrorAction SilentlyContinue) {
    Write-Host "pnputil /remove-device $FailedInstanceId"
    pnputil /remove-device $FailedInstanceId
    Start-Sleep -Seconds 3
    pnputil /scan-devices
    Start-Sleep -Seconds 5
}

Show-State 'after node reset'

if (-not (Get-PnpDevice -PresentOnly -InstanceId 'USB\VID_1A86&PID_8042\<serial>' -ErrorAction SilentlyContinue) -and $ResetParentHub) {
    $lhm = Get-Process LibreHardwareMonitor* -ErrorAction SilentlyContinue
    if ($lhm) {
        Write-Host "LibreHardwareMonitor is running (pid $($lhm.Id -join ',')). Close it first - it blocks PnP removal of the hub."
    } else {
        # Disable-PnpDevice fails on hubs ("Generic failure"); pnputil restart is the supported path.
        Write-Host "Restarting parent hub $ParentHub"
        pnputil /restart-device $ParentHub
        Start-Sleep -Seconds 8
        Show-State 'after hub restart'
    }
}

$ch340 = Get-PnpDevice -PresentOnly -InstanceId 'USB\VID_1A86&PID_8042\<serial>' -ErrorAction SilentlyContinue
if ($ch340 -and $ch340.Status -eq 'OK') {
    Write-Host "CH340 enumerated. Handshaking on $Port ..."
    $reset = Join-Path $PSScriptRoot 'l10_reset.py'
    if (Test-Path $reset) { python $reset $Port --no-pulse }
} else {
    Write-Host 'CH340 still not enumerated. Replug the L10 USB cable or cycle the hub with -ResetParentHub.'
}

Stop-Transcript | Out-Null
Write-Host "Log: $log"
