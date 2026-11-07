'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/**
 * 防吞音（Windows）：持续向默认输出设备送一路静音流，
 * 让 DAC 不进入空闲状态，避免开头几百毫秒被吞。
 * 原理与 SoundKeeper 相同，此处为独立实现，不包含第三方代码。
 */
class KeepAlive {
  constructor() {
    this.proc = null;
    this.wavPath = null;
  }

  get running() {
    return !!this.proc;
  }

  _ensureWav() {
    if (this.wavPath && fs.existsSync(this.wavPath)) return this.wavPath;
    const file = path.join(os.tmpdir(), 'tp55-silence-loop.wav');
    const seconds = 5;
    const sampleRate = 44100;
    const channels = 2;
    const bits = 16;
    const dataSize = sampleRate * seconds * channels * (bits / 8);
    const buf = Buffer.alloc(44 + dataSize); // 静音数据保持全 0

    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
    buf.writeUInt16LE(channels * (bits / 8), 32);
    buf.writeUInt16LE(bits, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataSize, 40);

    fs.writeFileSync(file, buf);
    this.wavPath = file;
    return file;
  }

  start() {
    if (process.platform !== 'win32') {
      throw new Error('防吞音目前仅支持 Windows');
    }
    if (this.proc) return true;

    const wav = this._ensureWav();
    const script = [
      `$player = New-Object System.Media.SoundPlayer '${wav.replace(/'/g, "''")}'`,
      '$player.PlayLooping()',
      'while ($true) { Start-Sleep -Milliseconds 500 }',
    ].join('; ');

    this.proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true, stdio: 'ignore' }
    );

    this.proc.on('exit', () => {
      this.proc = null;
    });
    this.proc.on('error', () => {
      this.proc = null;
    });

    return true;
  }

  stop() {
    if (!this.proc) return;
    try {
      this.proc.kill();
    } catch (e) {
      /* ignore */
    }
    this.proc = null;
  }

  status() {
    return { running: this.running, supported: process.platform === 'win32' };
  }
}

module.exports = { KeepAlive };
