# M7 生产升级编排脚本 —— 停机窗口自治执行（不依赖 Gateway/小千）
# 由一次性计划任务触发；全过程写日志；任一致命步骤失败→回滚备份→重启 Gateway
$ErrorActionPreference = 'Continue'
$OpenClawHome = if ($env:OPENCLAW_HOME) { $env:OPENCLAW_HOME } else { Join-Path $HOME '.openclaw' }
$LOG = if ($env:MEMORY_M7_LOG) { $env:MEMORY_M7_LOG } else { Join-Path $OpenClawHome 'memory\backups\m7-execution.log' }
$PROD = if ($env:MEMORY_DB_PATH) { $env:MEMORY_DB_PATH } else { Join-Path $OpenClawHome 'memory\memory-lancedb-pro-v4' }
$PLUGIN = if ($env:MEMORY_PLUGIN_PATH) { $env:MEMORY_PLUGIN_PATH } else { Join-Path $OpenClawHome 'extensions\memory-lancedb-pro-v4' }
$NODE = if ($env:NODE_EXE) { $env:NODE_EXE } else { 'node.exe' }
$OPENCLAW = if ($env:OPENCLAW_CMD) { $env:OPENCLAW_CMD } else { 'openclaw.cmd' }
$TS = Get-Date -Format 'yyyyMMdd-HHmmss'
$BACKUP = Join-Path $OpenClawHome "memory\backups\memory-lancedb-pro-v4-m7-$TS"

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}
function Fail-Rollback($reason) {
    Log "FATAL: $reason — 开始回滚"
    if (Test-Path $BACKUP) {
        Remove-Item -Recurse -Force $PROD -ErrorAction SilentlyContinue
        Copy-Item -Recurse $BACKUP $PROD
        Log "回滚完成：已从 $BACKUP 还原"
    }
    Log "重启 Gateway（schtasks）"
    & schtasks /run /tn "OpenClaw Gateway" | Out-Null
    Log "=== M7 FAILED（已回滚并重启）==="
    exit 1
}

Log "=== M7 生产升级开始 ==="

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
if (-not $ok) { Fail-Rollback "Gateway 进程未退出或原生绑定仍被锁（90s 超时）" }
Log "  进程已退出，锁已释放"

# 3. 备份生产库
Log "STEP 3: 备份生产库 → $BACKUP"
& robocopy $PROD $BACKUP /E /NFL /NDL /NJH /NJS /NP | Out-Null
if (-not (Test-Path "$BACKUP\memories.lance")) { Fail-Rollback "备份失败" }
Log "  备份完成"

# 4. 向量 schema 迁移
Log "STEP 4: 迁移向量 schema（764 记忆 + 14 资产）"
$migOut = & $NODE "$PLUGIN\scripts\migrate-v4-vector-schema.mjs" $PROD --apply 2>&1 | Out-String
Log $migOut
if ($migOut -notmatch 'pending FS swap' -or $migOut -match 'Error|mismatch|failed(?!.*self-search)') {
    if ($migOut -notmatch 'pending FS swap') { Fail-Rollback "迁移脚本未产出待换名表" }
}
# 5. 目录换名（幂等：仅当 __v4 存在时执行）
Log "STEP 5: 目录换名"
foreach ($t in @('memories', 'memory_assets')) {
    if (Test-Path "$PROD\${t}__v4.lance") {
        if (Test-Path "$PROD\${t}_legacy_v3.lance") { Remove-Item -Recurse -Force "$PROD\${t}_legacy_v3.lance" }
        Rename-Item -LiteralPath "$PROD\$t.lance" -NewName "${t}_legacy_v3.lance" -Force
        Rename-Item -LiteralPath "$PROD\${t}__v4.lance" -NewName "$t.lance" -Force
        Log "  $t 换名完成（旧表保留为 ${t}_legacy_v3）"
    } else {
        Log "  $t 无 __v4 待换名表（可能已迁移），跳过"
    }
}

# 6. doctor 污染清理（119 条）
Log "STEP 6: doctor --fix 污染清理"
$docOut = & $NODE "$PLUGIN\scripts\m7-doctor-fix.mjs" $PROD 2>&1 | Out-String
Log $docOut
if ($docOut -notmatch 'VERIFY_CLEAN') { Fail-Rollback "doctor 清理后复查未通过" }

# 7. 启动 Gateway
Log "STEP 7: 启动 Gateway"
& schtasks /run /tn "OpenClaw Gateway" | Out-Null
Start-Sleep -Seconds 5
Log "=== M7 停机窗口步骤全部完成 ==="
exit 0
