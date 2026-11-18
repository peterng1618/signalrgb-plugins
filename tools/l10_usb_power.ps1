#Requires -Version 5.1
<#
.SYNOPSIS
    Turn off USB selective suspend for the L10's CH340 and its parent hub, then recover the device.

.DESCRIPTION
    The CH340 wedge shows up after idle: every serial write times out and only a USB
    re-enumeration clears it. Windows has USB selective suspend enabled on this box
    (AC and DC = 1) and on the internal hub, so the port can be suspended and the
    CH340 clone does not always resume cleanly.

    Elevated. Applies:
      - power plan: USB selective suspend = Disabled (AC and DC)
      - per-device power management off for the hub and the CH340
      - optional -Recover: runs tools/l10_reenumerate.ps1 afterwards

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\l10_usb_power.ps1 -Recover
#>
param(
    [string]$Ch340 = 'USB\VID_1A86&PID_8042\<serial>',
    [string]$Hub = 'USB\VID_1A40&PID_0101\5&13de0221&0&5',
    [switch]$Recover
)

$ErrorActionPreference = 'Continue'

$current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'Not elevated. Open an elevated PowerShell and run this script again.'
    exit 2
}

$subgroup = '2a737441-1930-4402-8d77-b2bebba308a3'  # USB settings
$setting = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'   # USB selective suspend

Write-Host 'Power plan: USB selective suspend -> Disabled (AC and DC)'
powercfg /setacvalueindex SCHEME_CURRENT $subgroup $setting 0
powercfg /setdcvalueindex SCHEME_CURRENT $subgroup $setting 0
powercfg /setactive SCHEME_CURRENT
powercfg /query SCHEME_CURRENT $subgroup $setting | Select-String 'Power Setting Index'

foreach ($instance in @($Hub, $Ch340)) {
    $entity = Get-CimInstance -Namespace root\wmi -ClassName MSPower_DeviceEnable -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceName -like "$instance*" }
    if (-not $entity) {
        Write-Host "No MSPower_DeviceEnable entry for $instance (already off or not exposed)."
        continue
    }
    foreach ($e in $entity) {
        $e.Enable = $false
        Set-CimInstance -InputObject $e -ErrorAction SilentlyContinue
        Write-Host "Disabled device power management: $($e.InstanceName)"
    }
}

if ($Recover) {
    $reenum = Join-Path $PSScriptRoot 'l10_reenumerate.ps1'
    if (Test-Path $reenum) {
        & $reenum
        exit $LASTEXITCODE
    }
    Write-Warning "Re-enumeration helper not found: $reenum"
}

Write-Host 'Done. Reboot is not required; the settings apply now.'
