'use strict';

const { spawn } = require('child_process');
const EventEmitter = require('events');

/**
 * 读取 Windows 音频端点信息（采样率 / 位深 / UAC 版本）。
 * 用常驻 PowerShell 轮询注册表，避免频繁起进程。
 */
class SysInfo extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.buffer = '';
    this.last = null;
    this.failures = 0;
  }

  start() {
    if (this.proc) return;
    if (process.platform !== 'win32') return;

    const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render'
while ($true) {
  $found = $null
  try {
    Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {
      if ($found) { return }
      $p = Join-Path $_.PSPath 'Properties'
      if (-not (Test-Path $p)) { return }
      $pr = Get-ItemProperty $p -ErrorAction SilentlyContinue
      if (-not $pr) { return }
      $desc = $pr.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
      if (-not $desc -or $desc -notmatch 'TP55') { return }
      $fmt = $pr.'{f19f064d-082c-4e27-bc73-6882a1bb8e4c},0'
      $cid = $pr.'{a8b865dd-2e3d-4094-ad97-e593a70c75d6},8'
      $inst = $pr.'{9dad2fed-3c19-4cde-b3c9-1bd56be25698},0'
      if ($fmt -is [byte[]] -and $fmt.Length -ge 24) {
        $rate = [BitConverter]::ToUInt32($fmt, 12)
        $bits = [BitConverter]::ToUInt16($fmt, 22)
        $ch = [BitConverter]::ToUInt16($fmt, 10)
        $uac = 'unknown'
        if ($cid) {
          if ($cid -match 'Prot_20') { $uac = '2.0' }
          elseif ($cid -match 'SubClass_01') { $uac = '1.0' }
        }
        $found = [pscustomobject]@{ found = $true; desc = $desc; rate = $rate; bits = $bits; ch = $ch; uac = $uac; instance = $inst }
      }
    }
  } catch {}
  if (-not $found) { $found = [pscustomobject]@{ found = $false } }
  $found | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 2000
}
`;

    try {
      this.proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      this.proc.stdout.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => this._onData(chunk));
      this.proc.stderr.on('data', (chunk) => {
        if (process.env.TP55_DEBUG) console.error('[sysinfo]', chunk.toString().slice(0, 500));
      });
      this.proc.on('exit', () => {
        this.proc = null;
      });
      this.proc.on('error', () => {
        this.proc = null;
      });
    } catch (e) {
      this.proc = null;
      this.emit('error', e);
    }
  }

  _onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line || line[0] !== '{') continue;
      try {
        const data = JSON.parse(line);
        this.failures = 0;
        this.last = data;
        this.emit('update', data);
      } catch (e) {
        this.failures += 1;
      }
    }
    if (this.buffer.length > 64 * 1024) this.buffer = '';
  }

  stop() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch (e) {
        /* ignore */
      }
      this.proc = null;
    }
  }

  get() {
    return this.last;
  }
}

module.exports = { SysInfo };
