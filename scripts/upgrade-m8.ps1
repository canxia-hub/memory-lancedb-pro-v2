# M8 metadata 修复编排脚本 —— 停机窗口自治执行（不依赖 Gateway/小千）
# 由一次性计划任务 OpenClaw-M8-Repair-Once 触发（SYSTEM，凌晨低峰）
# 流程：停 Gateway → 备份+修复 6 行 char-mangled metadata → 验证 → 启 Gateway
# 失败策略：修复失败 → 自动回滚备份 → 无论如何重启 Gateway → 全程日志
$ErrorActionPreference = 'Continue'
$OpenClawHome = if ($env:OPENCLAW_HOME) { $env:OPENCLAW_HOME } else { Join-Path $HOME '.openclaw' }
$LOG = if ($env:MEMORY_M8_LOG) { $env:MEMORY_M8_LOG } else { Join-Path $OpenClawHome 'logs\m8-execution.log' }
$PROD = if ($env:MEMORY_DB_PATH) { $env:MEMORY_DB_PATH } else { Join-Path $OpenClawHome 'memory\memory-lancedb-pro-v4' }
$PLUGIN = if ($env:MEMORY_PLUGIN_PATH) { $env:MEMORY_PLUGIN_PATH } else { Join-Path $OpenClawHome 'extensions\memory-lancedb-pro-v4' }
$NODE = if ($env:NODE_EXE) { $env:NODE_EXE } else { 'node.exe' }
$OPENCLAW = if ($env:OPENCLAW_CMD) { $env:OPENCLAW_CMD } else { 'openclaw.cmd' }
$REPAIR = Join-Path $PLUGIN 'scripts\repair-mangled-metadata.mjs'

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}
function Start-Gateway {
    Log "启动 Gateway（schtasks /run）"
    & schtasks /run /tn "OpenClaw Gateway" | Out-Null
}
function Find-LastBackup {
    $backupGlob = Join-Path $OpenClawHome 'memory\backups\m8-mangled-metadata-backup-*.json'
    $f = Get-ChildItem $backupGlob -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($f) { return $f.FullName } else { return $null }
}
function Fail-Exit($reason, $code) {
    Log "FATAL: $reason"
    $bak = Find-LastBackup
    if ($bak) {
        Log "自动回滚：node repair-mangled-metadata.mjs --rollback $bak"
        $rb = & $NODE $REPAIR --rollback $bak 2>&1 | Out-String
        Log $rb
    }
    Start-Gateway
    Log "=== M8 FAILED（已回滚并重启 Gateway）==="
    exit $code
}

Log "=== M8 metadata 修复窗口开始 ==="

# 0. 安全时间窗检查：避开 02:25 sweep（±15 分钟）
$now = Get-Date
$sweep = Get-Date -Hour 2 -Minute 25 -Second 0
if ([math]::Abs(($now - $sweep).TotalMinutes) -lt 15) {
    Log "当前时间距 02:25 sweep 不足 15 分钟，放弃本次窗口（下次任务时间再试）"
    exit 0
}

# 1. 停 Gateway
Log "STEP 1: openclaw gateway stop"
& $OPENCLAW gateway stop 2>&1 | ForEach-Object { Log "  $_" }

# 2. 等进程退出 + 原生绑定锁释放（最多 90 秒）
Log "STEP 2: 等待进程退出与文件锁释放"
$native = "$PLUGIN\node_modules\@lancedb\lancedb-win32-x64-msvc\lancedb.win32-x64-msvc.node"
$ok = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    $gw = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
          Where-Object { $_.CommandLine -like '*gateway*33979*' }
    $locked = $true
    try { $s = [System.IO.File]::Open($native, 'Open', 'Read', 'None'); $s.Close(); $locked = $false } catch {}
    if (-not $gw -and -not $locked) { $ok = $true; break }
    if ($i -eq 15 -and $gw) {
        Log "  30s 未退出，强制 Stop-Process (PID $($gw.ProcessId))"
        Stop-Process -Id $gw.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
if (-not $ok) { Fail-Exit "Gateway 进程未退出或原生绑定仍被锁（90s 超时）" 2 }
Log "  进程已退出，锁已释放"

# 3. 修复（脚本内置：扫描 → 备份原始行 JSON → 修复 → 全表复查）
Log "STEP 3: 修复 char-mangled metadata（内置行级备份）"
$rep = & $NODE $REPAIR 2>&1 | Out-String
Log $rep
if ($rep -notmatch 'VERIFY_CLEAN') { Fail-Exit "修复脚本未通过复查（见上方输出）" 3 }
Log "  修复完成且复查干净"

# 4. 启动 Gateway
Log "STEP 4: 启动 Gateway"
Start-Gateway

# 5. 健康检查：等 33979 端口监听（最多 120 秒）
Log "STEP 5: 健康检查（等 33979 监听，最多 120s）"
$healthy = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 3
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', 33979, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(1500)) { $c.EndConnect($iar); $c.Close(); $healthy = $true; break }
        $c.Close()
    } catch {}
}
if (-not $healthy) { Log "FATAL: Gateway 启动后 120s 内 33979 未监听"; exit 4 }

# 6. 自清理：注销一次性任务（本实例继续跑完）
Log "STEP 6: 注销一次性计划任务 OpenClaw-M8-Repair-Once"
& schtasks /delete /tn "OpenClaw-M8-Repair-Once" /f 2>&1 | ForEach-Object { Log "  $_" }

Log "=== M8 停机窗口全部完成（SUCCESS）==="
exit 0
