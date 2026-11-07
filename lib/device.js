'use strict';

/**
 * EPZ TP55 HID 控制层
 *
 * 协议来自官方 peq.epzsz.com 的 CB 芯片 SDK：
 *   HID report id 0x4B，每帧 64 字节（首字节 report id）。
 *   写: [0x01, cmd, len, sub, ...payload]
 *   读: [0x80, cmd, ...]
 *   EQ 每段 36 字节，biquad 系数为 30 位定点、采样率 96kHz。
 */

const HID = require('node-hid');
const EventEmitter = require('events');

const VID = 0x3302;
const PID = 0x4383; // TP55
const REPORT_ID = 0x4b;
const REPORT_LEN = 64;
const SAMPLE_RATE = 96000;
const FIXED = 2 ** 30;

const FILTER_TYPES = {
  1: { id: 1, key: 'LS', name: 'Low Shelf', short: '低架' },
  2: { id: 2, key: 'PK', name: 'Peak', short: '峰值' },
  3: { id: 3, key: 'HS', name: 'High Shelf', short: '高架' },
  4: { id: 4, key: 'LP', name: 'Low Pass', short: '低通' },
  5: { id: 5, key: 'HP', name: 'High Pass', short: '高通' },
};

const DEFAULT_FREQS = [20, 50, 200, 500, 1000, 3000, 8000, 10000, 12000, 16000];

/* ------------------------------------------------------------------ */
/* biquad                                                              */
/* ------------------------------------------------------------------ */

function computeCoeffs(type, freq, q, gainDb, fs = SAMPLE_RATE) {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * freq) / fs;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * Math.max(q, 0.0001));
  let b0, b1, b2, a0, a1, a2;

  switch (Number(type)) {
    case 1: {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cw + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cw);
      b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s;
      a1 = -2 * (A - 1 + (A + 1) * cw);
      a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case 3: {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cw);
      b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s;
      a1 = 2 * (A - 1 - (A + 1) * cw);
      a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
    case 4:
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case 5:
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case 6:
      b0 = 1;
      b1 = -2 * cw;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case 2:
    default:
      b0 = 1 + alpha * A;
      b1 = -2 * cw;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cw;
      a2 = 1 - alpha / A;
      break;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function quantize(c) {
  const z = (v) => Math.round(v * FIXED) | 0;
  return [z(c.b0), z(c.b1), z(c.b2), -z(c.a1), -z(c.a2)];
}

function magnitudeDb(c, freq, fs = SAMPLE_RATE) {
  const w = (2 * Math.PI * freq) / fs;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cw2 = Math.cos(2 * w);
  const sw2 = Math.sin(2 * w);
  // H = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2), z^-1 = e^-jw
  const numRe = c.b0 + c.b1 * cw + c.b2 * cw2;
  const numIm = -(c.b1 * sw + c.b2 * sw2);
  const denRe = 1 + c.a1 * cw + c.a2 * cw2;
  const denIm = -(c.a1 * sw + c.a2 * sw2);
  const num = Math.hypot(numRe, numIm);
  const den = Math.hypot(denRe, denIm);
  if (!num || !den) return -120;
  return 20 * Math.log10(num / den);
}

function bandResponseDb(band, freqs) {
  if (!band.enabled) return freqs.map(() => 0);
  const c = computeCoeffs(band.type, band.freq, band.q, band.gain);
  return freqs.map((f) => magnitudeDb(c, f));
}

/* ------------------------------------------------------------------ */
/* 报文构造                                                             */
/* ------------------------------------------------------------------ */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function buildBandPacket(seg, band, offset, tag) {
  const freq = clamp(band.freq, 20, 20000);
  const q = clamp(band.q, 0.1, 10);
  const gain = clamp(band.gain, -12, 12);
  const c = quantize(computeCoeffs(band.type, freq, q, gain));

  const b = Buffer.alloc(36);
  b[0] = 0x01;
  b[1] = 0x09;
  b[2] = 24;
  b[3] = 0x00;
  b[4] = seg & 0xff;
  b[5] = 0x00;
  b[6] = 0x00;
  for (let i = 0; i < 5; i += 1) b.writeInt32LE(c[i], 7 + i * 4);
  b.writeUInt16LE(Math.round(freq), 27);
  b.writeUInt16LE(Math.round(q * 256), 29);
  b.writeInt16LE(Math.round(gain * 256), 31);
  b[33] = Number(band.type) || 2;
  b[34] = clamp(Math.round(offset || 0), -60, 60) & 0xff;
  b[35] = (tag == null ? 1 : tag) & 0xff;
  return b;
}

function parseBandReport(buf) {
  if (!buf || buf.length < 36) return null;
  if (buf[1] !== 0x80 || buf[2] !== 0x09) return null;
  const coeffs = [];
  for (let i = 0; i < 5; i += 1) coeffs.push(buf.readInt32LE(8 + i * 4));
  return {
    seg: buf[4],
    rawCoeffs: coeffs,
    freq: buf.readUInt16LE(28),
    q: buf.readUInt16LE(30) / 256,
    gain: buf.readInt16LE(32) / 256,
    type: buf[34],
    offset: buf.readInt8(35),
    tag: buf[36],
  };
}

/* ------------------------------------------------------------------ */
/* 设备                                                                 */
/* ------------------------------------------------------------------ */

class Tp55Device extends EventEmitter {
  constructor() {
    super();
    this.hid = null;
    this.path = null;
    this.info = null;
    this.connected = false;
    this.lastInput = null;
    this.version = null;
    this._pollTimer = null;
    this._pending = new Map();
  }

  static list() {
    try {
      return HID.devices().filter((d) => d.vendorId === VID && d.productId === PID);
    } catch (e) {
      return [];
    }
  }

  static isPresent() {
    return Tp55Device.list().length > 0;
  }

  connect() {
    if (this.connected && this.hid) return true;
    const dev = Tp55Device.list()[0];
    if (!dev) {
      this._setDisconnected();
      return false;
    }

    try {
      this.hid = new HID.HID(dev.path);
      this.path = dev.path;
      this.info = {
        product: dev.product || 'TP55',
        manufacturer: dev.manufacturer || 'EPZ',
        serial: dev.serialNumber || '',
        vid: dev.vendorId,
        pid: dev.productId,
        usagePage: dev.usagePage,
      };
      this.connected = true;
      this.hid.on('data', (data) => this._onData(data));
      this.hid.on('error', (err) => {
        this.emit('error', err);
        this._setDisconnected();
      });
      this.emit('connected', this.info);
      this.startWatch();
      return true;
    } catch (e) {
      this.hid = null;
      this._setDisconnected(e);
      return false;
    }
  }

  disconnect() {
    this.stopWatch();
    if (this.hid) {
      try {
        this.hid.close();
      } catch (e) {
        /* ignore */
      }
    }
    this.hid = null;
    this._setDisconnected();
  }

  _setDisconnected(err) {
    const was = this.connected;
    this.connected = false;
    this.hid = null;
    this.version = null;
    this.emit('status', { connected: false, info: this.info, error: err ? String(err.message || err) : null });
    if (was) this.emit('disconnected');
  }

  startWatch() {
    this.stopWatch();
    this._pollTimer = setInterval(() => {
      if (!Tp55Device.isPresent()) {
        if (this.connected) this._setDisconnected();
      } else if (!this.connected) {
        this.emit('reappear');
      }
    }, 1500);
    if (this._pollTimer.unref) this._pollTimer.unref();
  }

  stopWatch() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _onData(data) {
    const buf = Buffer.from(data);
    this.lastInput = buf;
    this.emit('report', buf);

    if (buf[1] === 0x80 && buf[2] === 0x0c) {
      const bytes = [];
      for (let i = 4; i < 20; i += 1) {
        if (buf[i] === 0) break;
        bytes.push(buf[i]);
      }
      this.version = Buffer.from(bytes).toString('ascii');
      this.emit('version', this.version);
    }

    if (buf[1] === 0x80 && buf[2] === 0x09) {
      const parsed = parseBandReport(buf);
      if (parsed) this.emit('band', parsed);
    }

    if (buf[1] === 0x80) {
      if (buf[2] === 0x11) this.emit('dacState', { filter: buf[4] });
      else if (buf[2] === 0x1d) this.emit('dacState', { filterMode: buf[4] });
      else if (buf[2] === 0x19) this.emit('dacState', { outputMode: buf[4] + 1 });
      else if (buf[2] === 0x02) this.emit('micState', buf.readInt8(4));
    }
  }

  _send(bytes) {
    if (!this.hid) throw new Error('设备未连接');
    const buf = Buffer.alloc(REPORT_LEN);
    buf[0] = REPORT_ID;
    Buffer.from(bytes).copy(buf, 1);
    this.hid.write(buf);
  }

  /** 发送原始命令（调试用） */
  sendRaw(arr) {
    this._send(arr);
  }

  readVersion() {
    this._send([0x80, 0x0c]);
  }

  readDacState() {
    this._send([0x80, 0x11]);
    this._send([0x80, 0x1d]);
    this._send([0x80, 0x19]);
  }

  readMicGain() {
    this._send([0x80, 0x02, 0x00]);
  }

  readCurrentBand(tag = 0) {
    this._send([0x80, 0x09, tag & 0xff]);
  }

  /** 写入单段 EQ（只进寄存器，不保存） */
  writeBand(seg, band, offset, tag) {
    this._send(buildBandPacket(seg, band, offset, tag).subarray(0, 36));
  }

  /** 将寄存器数据刷新到 DSP 内存（试听生效） */
  commit() {
    this._send([0x01, 0x0a, 0x04, 0x00, 0x00, 0xff, 0xff]);
  }

  /** 写入 Flash（掉电保存） */
  flush() {
    this._send([0x01, 0x01, 0x00]);
  }

  /** 将 EQ 参数保存到设备指定 tag 槽位 */
  saveSlot(tag = 1) {
    this._send([0x01, 0x04, 0x00, 0x00, 0x00, 0x00]);
  }

  /** 一次性下发全部频段并试听 */
  applyBands(bands, offset = 0, tag = 1) {
    for (let i = 0; i < bands.length && i < 10; i += 1) {
      this.writeBand(i, bands[i], offset, tag);
    }
    this.commit();
  }

  /** 保存到设备 Flash */
  saveBands(bands, offset = 0, tag = 1) {
    this.applyBands(bands, offset, tag);
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          this.flush();
          setTimeout(() => {
            try {
              this.saveSlot(tag);
            } catch (e) {
              /* ignore */
            }
            resolve(true);
          }, 120);
        } catch (e) {
          resolve(false);
        }
      }, 1000);
    });
  }

  /* ---- 其他设置 ---- */

  setMicGain(offset) {
    this._send([0x01, 0x02, 0x02, 0x80, offset & 0xff]);
  }

  saveMicGain() {
    this.flush();
  }

  setDacGain(value) {
    this._send([0x01, 0x03, 0x02, 0x00, value & 0xff]);
  }

  /** 数字滤波器：1 FAST-LL / 2 FAST-PC / 3 SLOW-LL / 4 SLOW-PC / 5 NON-OS */
  setFilter(index) {
    this._send([0x01, 0x11, 0x01, index & 0xff]);
  }

  /** 滤波器工作模式 0/1 */
  setFilterMode(mode) {
    this._send([0x01, 0x1d, 0x01, mode ? 1 : 0]);
  }

  /** 输出增益模式 1..3 */
  setOutputMode(mode) {
    const v = clamp(Number(mode) || 1, 1, 3) - 1;
    this._send([0x01, 0x19, 0x01, v]);
  }

  /** 声道平衡，0..? 正值偏左/右，与官方一致 */
  setBalance(left, right) {
    if (left > 0) {
      this._send([0x01, 0x16, 0x04, 0x01, 0x00, (-left) & 0xff, 0x00]);
      this._send([0x01, 0x16, 0x04, 0x00, 0x00, 0x00, 0x00]);
    } else if (right > 0) {
      this._send([0x01, 0x16, 0x04, 0x01, 0x00, 0x00, 0x00]);
      this._send([0x01, 0x16, 0x04, 0x00, 0x00, (-right) & 0xff, 0x00]);
    } else {
      this._send([0x01, 0x16, 0x04, 0x00, 0x01, 0x00, 0x00]);
      this._send([0x01, 0x16, 0x04, 0x00, 0x00, 0x00, 0x00]);
    }
  }

  /** 恢复官方默认平直参数（8 段，报文取自官方 resetDevice） */
  resetEq() {
    const defaults = [
      [1, 9, 24, 0, 0, 0, 0, 0, 0, 0, 64, 13, 130, 71, 128, 197, 170, 184, 63, 243, 125, 184, 127, 59, 85, 71, 192, 50, 0, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 1, 0, 0, 0, 0, 0, 64, 131, 65, 30, 129, 241, 134, 228, 62, 125, 190, 225, 126, 15, 121, 27, 193, 200, 0, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 2, 0, 0, 0, 0, 0, 64, 207, 171, 204, 130, 174, 127, 68, 61, 49, 84, 51, 125, 82, 128, 187, 194, 244, 1, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 3, 0, 0, 0, 0, 0, 64, 112, 73, 156, 133, 209, 240, 166, 58, 144, 182, 99, 122, 47, 15, 89, 197, 232, 3, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 4, 0, 0, 0, 0, 0, 64, 72, 183, 20, 142, 224, 20, 118, 51, 184, 72, 235, 113, 32, 235, 137, 204, 196, 9, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 5, 0, 0, 0, 0, 0, 64, 119, 218, 46, 156, 24, 64, 105, 41, 137, 37, 209, 99, 232, 191, 150, 214, 136, 19, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 6, 0, 0, 0, 0, 0, 64, 254, 37, 196, 183, 4, 120, 12, 27, 2, 218, 59, 72, 252, 135, 243, 228, 16, 39, 192, 0, 0, 0, 2, 0, 1],
      [1, 9, 24, 0, 7, 0, 0, 0, 0, 0, 64, 123, 122, 63, 210, 89, 251, 89, 18, 133, 133, 192, 45, 167, 4, 166, 237, 152, 58, 192, 0, 0, 0, 2, 0, 1],
    ];
    defaults.forEach((payload) => this._send(payload));
    this.commit();
    this.flush();
  }
}

module.exports = {
  Tp55Device,
  FILTER_TYPES,
  DEFAULT_FREQS,
  SAMPLE_RATE,
  computeCoeffs,
  bandResponseDb,
  magnitudeDb,
  clamp,
};
