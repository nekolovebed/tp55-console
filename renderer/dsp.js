'use strict';

/* 与设备端保持一致的 biquad 计算（96 kHz / 30 bit 定点量化） */
(function () {
  const FS = 96000;
  const FIXED = 2 ** 30;

  function computeCoeffs(type, freq, q, gainDb, fs) {
    const rate = fs || FS;
    const A = Math.pow(10, gainDb / 40);
    const w = (2 * Math.PI * freq) / rate;
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

    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  function magnitudeDb(c, freq, fs) {
    const rate = fs || FS;
    const w = (2 * Math.PI * freq) / rate;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const cw2 = Math.cos(2 * w);
    const sw2 = Math.sin(2 * w);
    const numRe = c.b0 + c.b1 * cw + c.b2 * cw2;
    const numIm = -(c.b1 * sw + c.b2 * sw2);
    const denRe = 1 + c.a1 * cw + c.a2 * cw2;
    const denIm = -(c.a1 * sw + c.a2 * sw2);
    const num = Math.hypot(numRe, numIm);
    const den = Math.hypot(denRe, denIm);
    if (!num || !den) return -120;
    return 20 * Math.log10(num / den);
  }

  function bandDb(band, freqs) {
    if (!band || !band.enabled) return freqs.map(() => 0);
    const c = computeCoeffs(band.type, band.freq, band.q, band.gain);
    return freqs.map((f) => magnitudeDb(c, f));
  }

  function quantized(band) {
    const c = computeCoeffs(band.type, band.freq, band.q, band.gain);
    const q = (v) => (Math.round(v * FIXED) | 0) / FIXED;
    return { b0: q(c.b0), b1: q(c.b1), b2: q(c.b2), a1: q(c.a1), a2: q(c.a2) };
  }

  window.DSP = { FS, computeCoeffs, magnitudeDb, bandDb, quantized };
})();
