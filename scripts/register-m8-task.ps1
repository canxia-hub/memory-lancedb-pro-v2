# 注册 M8 一次性修复计划任务（默认 2026-08-04 03:30，SYSTEM 最高权限）
# 用法: powershell -File register-m8-task.ps1 [-RunAt "2026-08-04 03:30"] [-WhatIf]
param(
    [string]$RunAt = "2026-08-04 03:30",
    [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
$TaskName = 'OpenClaw-M8-Repair-Once'
$Script = if ($env:MEMORY_M8_SCRIPT) { $env:MEMORY_M8_SCRIPT } else { Join-Path $PSScriptRoot 'upgrade-m8.ps1' }
$at = [datetime]::Parse($RunAt)

if ($at -lt (Get-Date).AddMinutes(5)) { throw "RunAt 必须在未来（至少 5 分钟后）：$at" }
# 拒绝落在 02:25 sweep ±15 分钟
$sweep = Get-Date -Date $at.Date -Hour 2 -Minute 25 -Second 0
if ([math]::Abs(($at - $sweep).TotalMinutes) -lt 15) { throw "RunAt 距 02:25 sweep 不足 15 分钟，请换时间" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`""
$trigger = New-ScheduledTaskTrigger -Once -At $at
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable

if ($WhatIf) {
    Write-Host "[WhatIf] 将注册任务 '$TaskName'：$($at.ToString('yyyy-MM-dd HH:mm')) 以 SYSTEM 运行 $Script"
    return
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'M8: 停机窗口修复 6 行 char-mangled metadata 并重启 Gateway 加载 v4 修复（5a539de+69a66fe）；脚本完成后自注销' | Out-Null
Write-Host "已注册一次性任务 '$TaskName'，触发时间 $($at.ToString('yyyy-MM-dd HH:mm:ss'))"
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName,State,TaskPath
