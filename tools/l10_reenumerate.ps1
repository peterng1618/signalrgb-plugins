#Requires -Version 5.1
<#
.SYNOPSIS
    Re-enumerate the Jungle Leopard L10's CH340 USB bridge to clear a stuck TX path.

.DESCRIPTION
    Only useful when the CH340 is present and healthy but every serial write times out.
    Run from an elevated PowerShell; the script does not elevate itself.

    Safety rules baked in:
      - refuses when the device is missing or already has a problem code (nothing to re-enumerate);
      - waits for SignalRgb/SignalRgbLauncher to actually exit before touching the device;
      - always re-enables the device, even if the disable or the wait throws;
      - polls for Status=OK and for the COM port to reappear, instead of a fixed sleep;
      - never touches the parent hub (that drops the Kraken/Lian Li and can wedge the port).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\l10_reenumerate.ps1 -DryRun
    powershell -ExecutionPolicy Bypass -File tools\l10_reenumerate.ps1
#>
[CmdletBinding()]
param(
    [string]$InstanceId = 'USB\VID_1A86&PID_8042\<serial>',
    [string]$Port = 'COM4',
    [int]$DownSeconds = 10,
    [int]$WaitSeconds = 30,
    [switch]$SkipHandshake,
    [switch]$RestartSignalRgb,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $DryRun -and -not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'Not elevated. Open an elevated PowerShell and run this script again.'
    exit 2
}

$dev = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
if (-not $dev) {
    Write-Error "Device not present: $InstanceId. Replug the L10 USB cable; re-enumeration cannot help."
    exit 3
}
if ($dev.Problem -ne 'CM_PROB_NONE') {
    Write-Error "Device has problem $($dev.Problem); this script only fixes a stuck-but-healthy device. Replug or power-cycle the L10."
    exit 3
}

# LibreHardwareMonitor blocks PnP removals on this machine (Kernel-PnP event 225).
$lhm = Get-Process LibreHardwareMonitor* -ErrorAction SilentlyContinue
if ($lhm) {
    Write-Warning "LibreHardwareMonitor is running (pid $($lhm.Id -join ',')). It blocks device removal; close it before a real run."
    if (-not $DryRun) { exit 5 }
}

if ($DryRun) {
    Write-Host "Dry run: would disable/enable $InstanceId for $DownSeconds s, wait up to $WaitSeconds s for OK + $Port."
    exit 0
}

# SignalRGB and its watchdog hold COM4; wait for a real exit instead of a fixed sleep.
Get-Process SignalRgb, SignalRgbLauncher -ErrorAction SilentlyContinue | Stop-Process -Force
for ($i = 0; $i -lt 20 -and (Get-Process SignalRgb, SignalRgbLauncher -ErrorAction SilentlyContinue); $i++) {
    Start-Sleep -Milliseconds 500
}
if (Get-Process SignalRgb, SignalRgbLauncher -ErrorAction SilentlyContinue) {
    Write-Error 'SignalRGB did not exit; not touching the device.'
    exit 6
}
Start-Sleep -Seconds 2

function Wait-Healthy([int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        $d = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
        $port = Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | Where-Object { $_.DeviceID -eq $Port }
        if ($d -and $d.Status -eq 'OK' -and $d.Problem -eq 'CM_PROB_NONE' -and $port) { return $true }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return $false
}

Write-Host "Disabling $InstanceId ..."
try {
    Disable-PnpDevice -InstanceId $InstanceId -Confirm:$false
} catch {
    Write-Warning "Disable failed: $($_.Exception.Message). Re-enabling and stopping."
} finally {
    Start-Sleep -Seconds $DownSeconds
    Write-Host "Enabling $InstanceId ..."
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try { Enable-PnpDevice -InstanceId $InstanceId -Confirm:$false; break }
        catch {
            Write-Warning "Enable attempt $attempt failed: $($_.Exception.Message)"
            Start-Sleep -Seconds 3
        }
    }
}

if (-not (Wait-Healthy $WaitSeconds)) {
    $d = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
    Write-Error "Device did not return healthy (status $($d.Status), problem $($d.Problem), port $Port missing). Do a full power-off (PSU switch), not a warm reboot."
    exit 4
}

Write-Host "Device healthy again (status OK, $Port present)."

if ($SkipHandshake) { exit 0 }

$reset = Join-Path $PSScriptRoot 'l10_reset.py'
if (-not (Test-Path $reset)) {
    Write-Warning "Handshake helper not found: $reset"
    exit 0
}

# -I is deliberately omitted: pyserial lives in the user site-packages.
python $reset $Port --no-pulse
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Device enumerated but the hub did not answer the handshake. Power-cycle the L10 (5V feed), not the PC.'
    exit 1
}

Write-Host 'L10 hub recovered. Start SignalRGB to resume control.'

if ($RestartSignalRgb) {
    $engine = Join-Path $env:LOCALAPPDATA 'VortxEngine'
    $exe = Get-ChildItem $engine -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'Signal-x64\SignalRgb.exe' } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
    if ($exe) {
        Start-Process $exe
        Write-Host 'SignalRGB restarted.'
    } else {
        Write-Warning "SignalRgb.exe not found under $engine; start it yourself."
    }
}
