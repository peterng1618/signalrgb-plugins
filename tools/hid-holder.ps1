$src = @"
using System;
using System.Runtime.InteropServices;
public class HidProbe {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
}
"@
Add-Type -TypeDefinition $src
$path = '\\.\HID#VID_2F4C&PID_1000&MI_02#7&59847f3&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}'
$h = [HidProbe]::CreateFileW($path, [uint32]2147483648, [uint32]0, [IntPtr]::Zero, [uint32]3, [uint32]0, [IntPtr]::Zero)
if ($h -eq [IntPtr]::new(-1)) {
    "open-exclusive-read failed, err=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error()
} else {
    "open-exclusive-read OK (nothing else holds MI_02)"
    [HidProbe]::CloseHandle($h) | Out-Null
}
