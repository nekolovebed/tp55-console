'use strict';

/* ================================================================== */
/* 基础                                                                */
/* ================================================================== */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, p) => {
  const m = 10 ** p;
  return Math.round(v * m) / m;
};
const fmtFreq = (f) => (f >= 1000 ? `${round(f / 1000, f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);

const FILTERS = [
  { value: 1, key: 'LS', name: 'Low Shelf · 低架' },
  { value: 2, key: 'PK', name: 'Peak · 峰值' },
  { value: 3, key: 'HS', name: 'High Shelf · 高架' },
  { value: 4, key: 'LP', name: 'Low Pass · 低通' },
  { value: 5, key: 'HP', name: 'High Pass · 高通' },
];

const DEFAULT_FREQS = [20, 50, 200, 500, 1000, 3000, 8000, 10000, 12000, 16000];

const STORE_KEY = 'tp55.console.v1';
const PRESET_KEY = 'tp55.presets.v1';

function makeBands(list) {
  return DEFAULT_FREQS.map((f, i) => {
    const src = (list && list[i]) || {};
    return {
      enabled: src.enabled !== false,
      type: Number(src.type) || 2,
      freq: clamp(Number(src.freq) || f, 20, 20000),
      q: clamp(Number(src.q) || 0.75, 0.1, 10),
      gain: clamp(Number(src.gain) || 0, -12, 12),
    };
  });
}

const FACTORY_PRESETS = [
  {
    id: 'flat',
    name: '平直',
    desc: '全部归零',
    bands: [],
    offset: 0,
  },
  {
    id: 'bass',
    name: '低频增强',
    desc: '下潜与冲击力',
    offset: -2,
    bands: [
      { freq: 32, q: 0.7, gain: 4.5, type: 2 },
      { freq: 60, q: 0.8, gain: 5.5, type: 2 },
      { freq: 150, q: 1.0, gain: -1.5, type: 2 },
      { freq: 400, q: 1.0, gain: -1.0, type: 2 },
      { freq: 1000, q: 1.0, gain: 0, type: 2 },
      { freq: 3000, q: 1.0, gain: 0.5, type: 2 },
      { freq: 6000, q: 1.2, gain: 0, type: 2 },
      { freq: 10000, q: 1.0, gain: 0, type: 2 },
      { freq: 12000, q: 1.0, gain: 0, type: 2 },
      { freq: 16000, q: 1.0, gain: 0, type: 2 },
    ],
  },
  {
    id: 'vocal',
    name: '人声清晰',
    desc: '中频靠前、齿音收敛',
    offset: -1,
    bands: [
      { freq: 20, q: 0.7, gain: 0, type: 2 },
      { freq: 50, q: 0.7, gain: 0, type: 2 },
      { freq: 220, q: 1.1, gain: -1.5, type: 2 },
      { freq: 800, q: 1.0, gain: -1.0, type: 2 },
      { freq: 1800, q: 1.2, gain: 1.5, type: 2 },
      { freq: 3000, q: 1.3, gain: 2.5, type: 2 },
      { freq: 5200, q: 2.2, gain: -2.0, type: 2 },
      { freq: 8000, q: 1.4, gain: 1.2, type: 2 },
      { freq: 12000, q: 1.0, gain: 0.8, type: 2 },
      { freq: 16000, q: 1.0, gain: 0, type: 2 },
    ],
  },
  {
    id: 'smooth',
    name: '高频柔化',
    desc: '压齿音、耐听',
    offset: 0,
    bands: [
      { freq: 20, q: 0.7, gain: 0, type: 2 },
      { freq: 50, q: 0.7, gain: 1.0, type: 2 },
      { freq: 200, q: 0.9, gain: 0.5, type: 2 },
      { freq: 500, q: 0.9, gain: 0, type: 2 },
      { freq: 1000, q: 0.9, gain: 0, type: 2 },
      { freq: 3000, q: 1.2, gain: -0.5, type: 2 },
      { freq: 6500, q: 1.8, gain: -3.5, type: 2 },
      { freq: 10000, q: 0.9, gain: -2.0, type: 3 },
      { freq: 12000, q: 0.9, gain: 0, type: 2 },
      { freq: 16000, q: 0.9, gain: 0, type: 2 },
    ],
  },
  {
    id: 'gaming',
    name: '游戏定位',
    desc: '脚步与环境分离',
    offset: -2,
    bands: [
      { freq: 30, q: 0.7, gain: 1.5, type: 2 },
      { freq: 120, q: 1.0, gain: -2.0, type: 2 },
      { freq: 300, q: 1.2, gain: -1.5, type: 2 },
      { freq: 900, q: 1.4, gain: -1.0, type: 2 },
      { freq: 2000, q: 1.6, gain: 2.5, type: 2 },
      { freq: 3500, q: 1.6, gain: 3.5, type: 2 },
      { freq: 6000, q: 1.6, gain: 2.0, type: 2 },
      { freq: 9000, q: 1.4, gain: 1.0, type: 2 },
      { freq: 12000, q: 1.2, gain: 0, type: 2 },
      { freq: 16000, q: 1.0, gain: 0, type: 2 },
    ],
  },
  {
    id: 'pop',
    name: '流行',
    desc: '低频饱满、人声甜',
    offset: -2,
    bands: [
      { freq: 45, q: 0.7, gain: 3.0, type: 2 },
      { freq: 100, q: 0.9, gain: 2.0, type: 2 },
      { freq: 300, q: 1.1, gain: -1.0, type: 2 },
      { freq: 900, q: 1.1, gain: -0.5, type: 2 },
      { freq: 2200, q: 1.2, gain: 1.0, type: 2 },
      { freq: 3500, q: 1.4, gain: 1.5, type: 2 },
      { freq: 6500, q: 1.6, gain: -1.0, type: 2 },
      { freq: 9000, q: 1.0, gain: 1.0, type: 2 },
      { freq: 12000, q: 0.9, gain: 1.5, type: 3 },
      { freq: 16000, q: 1.0, gain: 0, type: 2 },
    ],
  },
];

/* ================================================================== */
/* 状态                                                                */
/* ================================================================== */

const state = {
  bands: makeBands(),
  offset: 0,
  selected: 0,
  presetId: 'flat',
  presets: [],
  connected: false,
  info: null,
  version: null,
  dirty: false,
  dac: { filter: 1, filterMode: 0, outputMode: 3, balance: 0 },
  mic: 0,
  logs: [],
};

let pushTimer = null;
let lastPushAt = 0;
let drawing = false;
let dragging = null;
let hoverIndex = -1;
let confirmResolver = null;

/* ================================================================== */
/* 持久化                                                              */
/* ================================================================== */

function saveState() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        bands: state.bands,
        offset: state.offset,
        presetId: state.presetId,
        dac: state.dac,
        mic: state.mic,
      })
    );
  } catch (e) {
    /* ignore */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.bands)) state.bands = makeBands(data.bands);
    if (typeof data.offset === 'number') state.offset = clamp(data.offset, -12, 12);
    if (data.presetId) state.presetId = data.presetId;
    if (data.dac) state.dac = Object.assign(state.dac, data.dac);
    if (typeof data.mic === 'number') state.mic = clamp(data.mic, -12, 12);
  } catch (e) {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) state.presets = arr;
    }
  } catch (e) {
    /* ignore */
  }
}

function savePresets() {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(state.presets));
  } catch (e) {
    /* ignore */
  }
}

/* ================================================================== */
/* UI 小工具                                                            */
/* ================================================================== */

function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ` ${kind}` : '');
  el.innerHTML = `<i class="ti"></i><span></span>`;
  el.querySelector('span').textContent = msg;
  $('#toastStack').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, kind === 'err' ? 4200 : 2600);
}

function log(msg, kind) {
  const d = new Date();
  const t = [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
  state.logs.unshift({ t, msg, kind: kind || 'info' });
  if (state.logs.length > 80) state.logs.length = 80;
  renderLogs();
}

function renderLogs() {
  const box = $('#logList');
  if (!box) return;
  box.innerHTML = '';
  state.logs.forEach((l) => {
    const row = document.createElement('div');
    row.className = `log-line ${l.kind}`;
    const time = document.createElement('time');
    time.textContent = l.t;
    const span = document.createElement('span');
    span.textContent = l.msg;
    row.append(time, span);
    box.appendChild(row);
  });
}

function setLast(msg) {
  $('#sbLast').textContent = msg;
}

function markDirty(v) {
  state.dirty = v;
  $('#sbDirty').hidden = !v;
}

function showConfirm(title, text, opts) {
  const o = opts || {};
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  const input = $('#confirmInput');
  if (input) {
    input.hidden = !o.input;
    input.value = o.defaultValue || '';
  }
  $('#confirmOk').textContent = o.okText || '确定';
  $('#confirmModal').hidden = false;
  if (o.input && input) setTimeout(() => input.focus(), 60);
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  $('#confirmModal').hidden = true;
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

/* ================================================================== */
/* 频段表格                                                             */
/* ================================================================== */

function filterOptions(selected) {
  return FILTERS.map(
    (f) => `<option value="${f.value}"${f.value === Number(selected) ? ' selected' : ''}>${f.key}</option>`
  ).join('');
}

function renderTable() {
  const rows = $('#bandRows');
  rows.innerHTML = '';

  state.bands.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'band-row' + (i === state.selected ? ' selected' : '') + (b.enabled ? '' : ' disabled');
    row.dataset.i = i;

    const sw = document.createElement('div');
    sw.className = 'col-sw';
    const swEl = document.createElement('div');
    swEl.className = 'switch' + (b.enabled ? ' on' : '');
    swEl.dataset.act = 'toggle';
    sw.appendChild(swEl);

    const idx = document.createElement('div');
    idx.className = 'col-idx';
    idx.innerHTML = `<span class="row-num"><i class="row-dot"></i>${i + 1}</span>`;

    const type = document.createElement('div');
    type.innerHTML = `<select class="row-select" data-act="type">${filterOptions(b.type)}</select>`;

    const freq = document.createElement('div');
    freq.innerHTML = `<input class="row-input" type="number" min="20" max="20000" step="1" data-act="freq" value="${Math.round(b.freq)}">`;

    const gain = document.createElement('div');
    gain.innerHTML = `<input class="row-input" type="number" min="-12" max="12" step="0.1" data-act="gain" value="${round(b.gain, 1).toFixed(1)}">`;

    const q = document.createElement('div');
    q.innerHTML = `<input class="row-input" type="number" min="0.1" max="10" step="0.01" data-act="q" value="${round(b.q, 2).toFixed(2)}">`;

    const curve = document.createElement('div');
    curve.className = 'curve-cell';
    const pct = clamp(Math.abs(b.gain) / 12, 0, 1) * 100;
    const color =
      b.gain >= 0
        ? 'linear-gradient(90deg, rgba(167,139,250,.55), rgba(243,197,128,.95))'
        : 'linear-gradient(90deg, rgba(120,160,255,.55), rgba(167,139,250,.9))';
    curve.innerHTML = `<div class="curve-track"><i class="curve-fill" style="width:${pct}%;left:0;background:${color};opacity:${b.enabled ? 1 : 0.35}"></i></div><span class="curve-gain">${b.gain >= 0 ? '+' : ''}${b.gain.toFixed(1)}</span>`;

    row.append(sw, idx, type, freq, gain, q, curve);

    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input,select,.switch')) return;
      selectBand(i);
    });

    rows.appendChild(row);
  });
}

function rowEl(i) {
  return $(`.band-row[data-i="${i}"]`);
}

function syncRow(i) {
  const row = rowEl(i);
  if (!row) return;
  const b = state.bands[i];
  row.classList.toggle('selected', i === state.selected);
  row.classList.toggle('disabled', !b.enabled);
  const sw = $('.switch', row);
  if (sw) sw.classList.toggle('on', b.enabled);
  const sel = $('select[data-act="type"]', row);
  if (sel && Number(sel.value) !== b.type) sel.value = String(b.type);
  const freq = $('input[data-act="freq"]', row);
  if (freq && document.activeElement !== freq) freq.value = String(Math.round(b.freq));
  const gain = $('input[data-act="gain"]', row);
  if (gain && document.activeElement !== gain) gain.value = b.gain.toFixed(1);
  const q = $('input[data-act="q"]', row);
  if (q && document.activeElement !== q) q.value = b.q.toFixed(2);
  const fill = $('.curve-fill', row);
  if (fill) {
    fill.style.width = clamp(Math.abs(b.gain) / 12, 0, 1) * 100 + '%';
    fill.style.opacity = b.enabled ? '1' : '0.35';
  }
  const cg = $('.curve-gain', row);
  if (cg) cg.textContent = `${b.gain >= 0 ? '+' : ''}${b.gain.toFixed(1)}`;
}

function syncAllRows() {
  state.bands.forEach((_, i) => syncRow(i));
}

/* 表格事件（委托） */
function bindTable() {
  const rows = $('#bandRows');

  rows.addEventListener('click', (e) => {
    const row = e.target.closest('.band-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    const sw = e.target.closest('.switch');
    if (sw) {
      state.bands[i].enabled = !state.bands[i].enabled;
      syncRow(i);
      onBandsChanged();
      return;
    }
    if (e.target.closest('input,select')) {
      selectBand(i, false);
    } else {
      selectBand(i);
    }
  });

  rows.addEventListener('change', (e) => {
    const row = e.target.closest('.band-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    const act = e.target.dataset.act;
    const b = state.bands[i];
    if (act === 'type') b.type = Number(e.target.value);
    if (act === 'freq') b.freq = clamp(Number(e.target.value) || 20, 20, 20000);
    if (act === 'gain') b.gain = clamp(Number(e.target.value) || 0, -12, 12);
    if (act === 'q') b.q = clamp(Number(e.target.value) || 0.1, 0.1, 10);
    selectBand(i, false);
    syncRow(i);
    onBandsChanged();
  });

  rows.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  });
}

/* ================================================================== */
/* 选中与检查器                                                         */
/* ================================================================== */

function selectBand(i, redraw) {
  state.selected = clamp(i, 0, state.bands.length - 1);
  syncAllRows();
  renderInspector();
  draw();
}

function renderInspector() {
  const b = state.bands[state.selected];
  $('#inspEmpty').hidden = true;
  $('#inspBody').hidden = false;
  $('#inspIndex').textContent = String(state.selected + 1);
  $('#inspType').value = String(b.type);
  $('#inspFreq').value = String(Math.round(b.freq));
  $('#inspGain').value = b.gain.toFixed(1);
  $('#inspQ').value = b.q.toFixed(2);
  $('#inspGainRange').value = String(b.gain);
}

function bindInspector() {
  const apply = () => {
    const b = state.bands[state.selected];
    b.type = Number($('#inspType').value);
    b.freq = clamp(Number($('#inspFreq').value) || 20, 20, 20000);
    b.gain = clamp(Number($('#inspGain').value) || 0, -12, 12);
    b.q = clamp(Number($('#inspQ').value) || 0.1, 0.1, 10);
    syncRow(state.selected);
    draw();
    onBandsChanged();
  };

  $('#inspType').addEventListener('change', apply);
  ['#inspFreq', '#inspGain', '#inspQ'].forEach((sel) => {
    $(sel).addEventListener('change', apply);
    $(sel).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.target.blur();
    });
  });

  $('#inspGainRange').addEventListener('input', (e) => {
    const b = state.bands[state.selected];
    b.gain = Number(e.target.value);
    $('#inspGain').value = b.gain.toFixed(1);
    syncRow(state.selected);
    draw();
    onBandsChanged();
  });

  $('#inspZero').addEventListener('click', () => {
    const b = state.bands[state.selected];
    b.gain = 0;
    renderInspector();
    syncRow(state.selected);
    draw();
    onBandsChanged();
  });
}

/* ================================================================== */
/* 曲线绘制                                                             */
/* ================================================================== */

const PLOT = { l: 48, r: 18, t: 16, b: 28 };
const DB_MIN = -15;
const DB_MAX = 15;
const F_MIN = 20;
const F_MAX = 20000;
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const canvas = $('#eqCanvas');
const ctx = canvas.getContext('2d');

function plotSize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  return {
    w: rect.width,
    h: rect.height,
    pw: rect.width - PLOT.l - PLOT.r,
    ph: rect.height - PLOT.t - PLOT.b,
  };
}

function xOf(f, pw) {
  return PLOT.l + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * pw;
}

function fOf(x, pw) {
  return F_MIN * Math.pow(F_MAX / F_MIN, (x - PLOT.l) / pw);
}

function yOf(db, ph) {
  return PLOT.t + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * ph;
}

function dbOf(y, ph) {
  return DB_MAX - ((y - PLOT.t) / ph) * (DB_MAX - DB_MIN);
}

function drawGrid(w, h, pw, ph) {
  ctx.save();

  // 竖向频率网格
  ctx.font = '10px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  GRID_FREQS.forEach((f) => {
    const x = xOf(f, pw);
    const major = f === 1000 || f === 10000;
    ctx.beginPath();
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.042)';
    ctx.lineWidth = 1;
    ctx.moveTo(Math.round(x) + 0.5, PLOT.t);
    ctx.lineTo(Math.round(x) + 0.5, PLOT.t + ph);
    ctx.stroke();

    ctx.fillStyle = 'rgba(150,160,180,0.55)';
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    ctx.fillText(label, x, PLOT.t + ph + 8);
  });

  // 横向 dB 网格
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let db = DB_MIN; db <= DB_MAX; db += 3) {
    const y = yOf(db, ph);
    ctx.beginPath();
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.038)';
    ctx.lineWidth = db === 0 ? 1.2 : 1;
    ctx.moveTo(PLOT.l, Math.round(y) + 0.5);
    ctx.lineTo(PLOT.l + pw, Math.round(y) + 0.5);
    ctx.stroke();

    if (db !== 0) {
      ctx.fillStyle = 'rgba(120,130,150,0.55)';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, PLOT.l - 8, y);
    } else {
      ctx.fillStyle = 'rgba(180,190,210,0.6)';
      ctx.fillText('0', PLOT.l - 8, y);
    }
  }

  ctx.restore();
}

function drawCurves() {
  const { w, h, pw, ph } = plotSize();
  if (w <= 0 || h <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  drawGrid(w, h, pw, ph);

  const steps = Math.max(240, Math.floor(pw));
  const freqs = new Array(steps);
  for (let i = 0; i < steps; i += 1) {
    freqs[i] = fOf(PLOT.l + (i / (steps - 1)) * pw, pw);
  }

  // 单段曲线
  const sel = state.selected;
  const single = DSP.bandDb(state.bands[sel], freqs);
  ctx.beginPath();
  single.forEach((db, i) => {
    const x = PLOT.l + (i / (steps - 1)) * pw;
    const y = yOf(clamp(db, DB_MIN - 4, DB_MAX + 4), ph);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(243,197,128,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 合成曲线
  const total = new Array(steps).fill(state.offset);
  state.bands.forEach((b, i) => {
    if (i === sel || !b.enabled) return;
    const r = DSP.bandDb(b, freqs);
    for (let k = 0; k < steps; k += 1) total[k] += r[k];
  });
  for (let k = 0; k < steps; k += 1) total[k] += single[k];

  // 填充
  const zeroY = yOf(0, ph);
  const grad = ctx.createLinearGradient(0, PLOT.t, 0, PLOT.t + ph);
  grad.addColorStop(0, 'rgba(167,139,250,0.28)');
  grad.addColorStop(0.5, 'rgba(167,139,250,0.10)');
  grad.addColorStop(1, 'rgba(167,139,250,0.02)');

  ctx.beginPath();
  total.forEach((db, i) => {
    const x = PLOT.l + (i / (steps - 1)) * pw;
    const y = yOf(clamp(db, DB_MIN - 4, DB_MAX + 4), ph);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const lastX = PLOT.l + pw;
  const firstX = PLOT.l;
  ctx.lineTo(lastX, clamp(zeroY, PLOT.t, PLOT.t + ph));
  ctx.lineTo(firstX, clamp(zeroY, PLOT.t, PLOT.t + ph));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 描边
  ctx.beginPath();
  total.forEach((db, i) => {
    const x = PLOT.l + (i / (steps - 1)) * pw;
    const y = yOf(clamp(db, DB_MIN - 4, DB_MAX + 4), ph);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const strokeGrad = ctx.createLinearGradient(PLOT.l, 0, PLOT.l + pw, 0);
  strokeGrad.addColorStop(0, '#a78bfa');
  strokeGrad.addColorStop(0.55, '#c4a7ff');
  strokeGrad.addColorStop(1, '#f3c580');
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(167,139,250,0.45)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 节点
  state.bands.forEach((b, i) => {
    const x = xOf(b.freq, pw);
    const y = yOf(clamp(b.gain, DB_MIN, DB_MAX), ph);
    const isSel = i === sel;
    const isHover = i === hoverIndex;

    if (isSel || isHover) {
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, isSel ? 6.2 : 5, 0, Math.PI * 2);
    ctx.fillStyle = b.enabled ? (isSel ? '#f7e2b8' : 'rgba(236,240,250,0.9)') : 'rgba(120,128,145,0.6)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = isSel ? '#b79bff' : 'rgba(20,24,32,0.85)';
    ctx.stroke();

    if (isSel) {
      ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2a1f12';
      ctx.fillText(String(i + 1), x, y + 0.5);
    }
  });

  // 边界遮罩，避免曲线画出圆角区域
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.strokeRect(PLOT.l + 0.5, PLOT.t + 0.5, pw - 1, ph - 1);
}

function draw() {
  if (drawing) return;
  drawing = true;
  requestAnimationFrame(() => {
    drawing = false;
    drawCurves();
  });
}

/* ================================================================== */
/* 曲线交互                                                             */
/* ================================================================== */

function nearestBand(mx, my) {
  const { pw, ph } = plotSize();
  let best = -1;
  let bestDist = 18;
  state.bands.forEach((b, i) => {
    const x = xOf(b.freq, pw);
    const y = yOf(clamp(b.gain, DB_MIN, DB_MAX), ph);
    const d = Math.hypot(mx - x, my - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function localPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function bindCanvas() {
  canvas.addEventListener('pointerdown', (e) => {
    const p = localPoint(e);
    const idx = nearestBand(p.x, p.y);
    if (idx < 0) return;
    selectBand(idx);
    const { pw, ph } = plotSize();
    dragging = {
      index: idx,
      startFreq: state.bands[idx].freq,
      startGain: state.bands[idx].gain,
      startX: p.x,
      startY: p.y,
      pw,
      ph,
    };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = localPoint(e);
    const { pw, ph } = plotSize();

    if (dragging) {
      const b = state.bands[dragging.index];
      const f = fOf(p.x, pw);
      const g = dbOf(p.y, ph);
      b.freq = clamp(Math.round(f), 20, 20000);
      b.gain = clamp(round(g, e.shiftKey ? 0.1 : 0.5), -12, 12);
      syncRow(dragging.index);
      renderInspector();
      draw();
      updateTooltip(p.x, p.y, dragging.index);
      onBandsChanged();
      return;
    }

    const idx = nearestBand(p.x, p.y);
    if (idx !== hoverIndex) {
      hoverIndex = idx;
      canvas.style.cursor = idx >= 0 ? 'grab' : 'crosshair';
      draw();
    }
    if (idx >= 0) updateTooltip(p.x, p.y, idx);
    else $('#tooltip').hidden = true;

    const f = fOf(p.x, pw);
    $('#cursorReadout').textContent = `${fmtFreq(clamp(f, 20, 20000))} Hz · ${dbOf(p.y, ph).toFixed(1)} dB`;
  });

  canvas.addEventListener('pointerup', (e) => {
    if (dragging) {
      dragging = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
  });

  canvas.addEventListener('pointerleave', () => {
    hoverIndex = -1;
    $('#tooltip').hidden = true;
    $('#cursorReadout').textContent = '20 Hz — 20 kHz';
    draw();
  });

  canvas.addEventListener('dblclick', (e) => {
    const p = localPoint(e);
    const idx = nearestBand(p.x, p.y);
    if (idx < 0) return;
    state.bands[idx].gain = 0;
    selectBand(idx);
    onBandsChanged();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      const p = localPoint(e);
      const idx = nearestBand(p.x, p.y);
      if (idx < 0) return;
      e.preventDefault();
      const b = state.bands[idx];
      const factor = e.deltaY > 0 ? 0.94 : 1.06;
      b.q = clamp(round(b.q * factor, 2), 0.1, 10);
      selectBand(idx);
      onBandsChanged();
    },
    { passive: false }
  );

  window.addEventListener('resize', () => draw());
}

function updateTooltip(x, y, idx) {
  const b = state.bands[idx];
  const tip = $('#tooltip');
  tip.hidden = false;
  tip.style.left = `${x + 14}px`;
  tip.style.top = `${y - 6}px`;
  tip.innerHTML = `#${idx + 1} · <b>${Math.round(b.freq)} Hz</b> · <b>${b.gain >= 0 ? '+' : ''}${b.gain.toFixed(1)} dB</b> · Q <b>${b.q.toFixed(2)}</b>`;
}

/* ================================================================== */
/* 变更 & 下发                                                          */
/* ================================================================== */

function onBandsChanged() {
  markDirty(true);
  draw();
  schedulePush();
  saveState();
}

function schedulePush() {
  if (!state.connected) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushNow();
  }, 220);
}

async function pushNow() {
  if (!state.connected) return;
  try {
    await window.tp55.previewEq({ bands: state.bands, offset: state.offset, tag: 1 });
    lastPushAt = Date.now();
    setLast('已实时下发到设备');
  } catch (e) {
    setLast('下发失败：' + (e.message || e));
  }
}

function setOffset(v) {
  state.offset = clamp(round(Number(v), 1), -12, 12);
  $('#preamp').value = String(state.offset);
  $('#preampVal').textContent = `${state.offset > 0 ? '+' : ''}${state.offset.toFixed(1)} dB`;
  onBandsChanged();
}

/* ================================================================== */
/* 预设                                                                */
/* ================================================================== */

function presetBands(p) {
  const list = makeBands(p.bands && p.bands.length ? p.bands : []);
  if (!p.bands || !p.bands.length) {
    list.forEach((b) => {
      b.gain = 0;
      b.q = 0.75;
      b.type = 2;
    });
  }
  return list;
}

function applyPreset(p, announce) {
  state.bands = presetBands(p);
  state.offset = clamp(Number(p.offset) || 0, -12, 12);
  state.presetId = p.id;
  $('#preamp').value = String(state.offset);
  $('#preampVal').textContent = `${state.offset > 0 ? '+' : ''}${state.offset.toFixed(1)} dB`;
  $('#presetSelect').value = p.id;
  renderTable();
  selectBand(0, false);
  markDirty(true);
  saveState();
  draw();
  schedulePush();
  if (announce) toast(`已载入预设「${p.name}」`);
}

function allPresets() {
  return FACTORY_PRESETS.concat(state.presets);
}

function refreshPresetSelect() {
  const sel = $('#presetSelect');
  sel.innerHTML = '';
  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = '自定义';
  sel.appendChild(custom);
  if (!state.presetId) custom.selected = true;
  const groups = [
    { label: '内置', items: FACTORY_PRESETS },
    { label: '我的预设', items: state.presets },
  ];
  groups.forEach((g) => {
    if (!g.items.length) return;
    const og = document.createElement('optgroup');
    og.label = g.label;
    g.items.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  const exists = allPresets().some((p) => p.id === state.presetId);
  sel.value = state.presetId ? (exists ? state.presetId : FACTORY_PRESETS[0].id) : '';
}

function openPresetLibrary() {
  const factory = $('#factoryPresets');
  const user = $('#userPresets');
  factory.innerHTML = '';
  user.innerHTML = '';

  FACTORY_PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'preset-chip';
    b.innerHTML = `${p.name}<span class="sub">${p.desc || ''}</span>`;
    b.addEventListener('click', () => {
      applyPreset(p, true);
      $('#presetModal').hidden = true;
    });
    factory.appendChild(b);
  });

  if (!state.presets.length) {
    user.innerHTML = '<div class="insp-empty">还没有自定义预设，调整好 EQ 后点击「保存为预设」。</div>';
  } else {
    state.presets.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'preset-chip';
      b.innerHTML = `${p.name}<span class="sub">${p.offset ? (p.offset > 0 ? '+' : '') + p.offset + ' dB 前置' : '10 段'}</span>`;
      b.addEventListener('click', () => {
        applyPreset(p, true);
        $('#presetModal').hidden = true;
      });
      user.appendChild(b);
    });
  }

  $('#presetModal').hidden = false;
}

async function saveCurrentAsPreset() {
  const name = await showConfirm('保存预设', '给当前这套调音起个名字：', {
    input: true,
    defaultValue: `我的调音 ${state.presets.length + 1}`,
    okText: '保存',
  });
  if (!name) return;
  const preset = {
    id: 'u' + Date.now(),
    name: String(name).slice(0, 24),
    bands: JSON.parse(JSON.stringify(state.bands)),
    offset: state.offset,
  };
  state.presets.unshift(preset);
  savePresets();
  refreshPresetSelect();
  $('#presetSelect').value = preset.id;
  state.presetId = preset.id;
  saveState();
  toast(`预设「${preset.name}」已保存`);
}

async function deleteCurrentPreset() {
  const p = allPresets().find((x) => x.id === state.presetId);
  if (!p) return;
  if (FACTORY_PRESETS.some((x) => x.id === p.id)) {
    toast('内置预设不能删除', 'err');
    return;
  }
  const ok = await showConfirm('删除预设', `确定删除「${p.name}」吗？`, { okText: '删除' });
  if (!ok) return;
  state.presets = state.presets.filter((x) => x.id !== p.id);
  savePresets();
  state.presetId = 'flat';
  refreshPresetSelect();
  saveState();
  toast('预设已删除');
}

/* ================================================================== */
/* 导入导出                                                             */
/* ================================================================== */

function toExponentialText() {
  const lines = [];
  if (state.offset) lines.push(`Preamp: ${state.offset.toFixed(1)} dB`);
  state.bands.forEach((b, i) => {
    if (!b.enabled) return;
    const key = FILTERS.find((f) => f.value === b.type).key;
    lines.push(
      `Filter ${i + 1}: ON ${key} Fc ${Math.round(b.freq)} Hz Gain ${b.gain.toFixed(1)} dB Q ${b.q.toFixed(2)}`
    );
  });
  return lines.join('\n');
}

function parseEqText(text) {
  const bands = [];
  let offset = 0;
  const preamp = text.match(/Preamp\s*:\s*(-?[\d.]+)\s*dB/i);
  if (preamp) offset = clamp(Number(preamp[1]), -12, 12);

  const re = /Filter\s*\d*\s*:\s*(ON|OFF)\s+(\w+)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s*(-?[\d.]+)\s*dB(?:\s+Q\s+([\d.]+))?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[2].toUpperCase();
    const typeMap = { LS: 1, LSC: 1, PK: 2, PEQ: 2, HS: 3, HSC: 3, LP: 4, HP: 5 };
    const type = typeMap[key] || 2;
    bands.push({
      enabled: m[1].toUpperCase() === 'ON',
      type,
      freq: clamp(Number(m[3]), 20, 20000),
      gain: clamp(Number(m[4]), -12, 12),
      q: clamp(Number(m[5] || 0.75), 0.1, 10),
    });
    if (bands.length >= 10) break;
  }
  return { bands, offset };
}

async function doExport() {
  const payload = {
    format: 'epz-tp55-peq',
    version: 1,
    savedAt: new Date().toISOString(),
    offset: state.offset,
    bands: state.bands,
  };
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const res = await window.tp55.exportFile({
    defaultName: `TP55-PEQ-${stamp}.json`,
    content: JSON.stringify(payload, null, 2),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res && res.ok) toast('已导出到 ' + res.path);
}

async function doImport() {
  const res = await window.tp55.importFile({
    filters: [
      { name: 'EQ 配置文件', extensions: ['json', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (!res || !res.ok) return;

  const text = res.content;
  let parsed = null;

  if (/^\s*\{/.test(text)) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data.bands)) {
        parsed = { bands: data.bands, offset: Number(data.offset) || 0 };
      }
    } catch (e) {
      /* ignore */
    }
  }
  if (!parsed) {
    const fromText = parseEqText(text);
    if (fromText.bands.length) parsed = fromText;
  }
  if (!parsed) {
    toast('无法解析这个文件，支持 TP55 JSON 或 EqualizerAPO 文本', 'err');
    return;
  }

  state.bands = makeBands(parsed.bands);
  state.offset = clamp(parsed.offset || 0, -12, 12);
  state.presetId = '';
  $('#preamp').value = String(state.offset);
  $('#preampVal').textContent = `${state.offset > 0 ? '+' : ''}${state.offset.toFixed(1)} dB`;
  $('#presetSelect').value = '';
  renderTable();
  selectBand(0, false);
  onBandsChanged();
  toast(`已导入 ${parsed.bands.length} 段参数`);
}

/* ================================================================== */
/* 设备                                                                 */
/* ================================================================== */

function setConnected(s) {
  state.connected = !!s.connected;
  state.info = s.info || state.info;
  state.version = s.version || state.version;

  const pill = $('#devicePill');
  const dot = $('#deviceDot');
  const label = $('#deviceLabel');
  const fw = $('#fwLabel');

  pill.classList.toggle('online', state.connected);
  pill.classList.toggle('offline', !state.connected);
  dot.classList.toggle('on', state.connected);
  dot.classList.toggle('off', !state.connected);

  if (state.connected) {
    label.textContent = state.info ? state.info.product : 'TP55';
    if (state.version) {
      fw.hidden = false;
      $('#fwSep').hidden = false;
      fw.textContent = 'FW ' + state.version;
    }
  } else {
    label.textContent = '未检测到设备';
    fw.hidden = true;
    $('#fwSep').hidden = true;
  }

  $('#sbDevice').innerHTML = `<i class="dot ${state.connected ? 'on' : 'off'}"></i><span>${state.connected ? '设备已连接' : '未连接'}</span>`;
  $('#devDot').className = 'dot ' + (state.connected ? 'on' : 'off');
  $('#devStatusText').textContent = state.connected ? '已连接 · 可实时调节' : '未连接，请插入 TP55';

  if (state.info) {
    $('#devVid').textContent = '0x' + state.info.vid.toString(16).toUpperCase().padStart(4, '0');
    $('#devPid').textContent = '0x' + state.info.pid.toString(16).toUpperCase().padStart(4, '0');
    $('#devSn').textContent = state.info.serial || '—';
  }
  $('#devFw').textContent = state.version || '—';

  if (s.justConnected) {
    log('设备已连接：' + (state.info ? state.info.product : 'TP55'), 'ok');
    // 连接后把当前界面参数同步到设备
    setTimeout(() => {
      pushNow();
    }, 350);
  }
}

function bindDeviceEvents() {
  window.tp55.onEvent((ev) => {
    if (!ev) return;
    if (ev.type === 'status') {
      setConnected(ev);
    } else if (ev.type === 'version') {
      if (!ev.version) return;
      state.version = ev.version;
      $('#fwLabel').hidden = false;
      $('#fwSep').hidden = false;
      $('#fwLabel').textContent = 'FW ' + ev.version;
      $('#devFw').textContent = ev.version;
      log('固件版本：' + ev.version, 'ok');
    } else if (ev.type === 'dacState') {
      Object.assign(state.dac, ev.state);
      syncDacUi();
      saveState();
    } else if (ev.type === 'micState') {
      state.mic = clamp(Number(ev.value) || 0, -12, 12);
      syncMicUi();
      saveState();
    } else if (ev.type === 'error') {
      log('设备错误：' + ev.message, 'err');
    }
  });
}

async function connectDevice() {
  setLast('正在连接设备…');
  const res = await window.tp55.connect();
  setConnected(res);
  if (!res.connected) {
    toast('未找到 TP55，请检查 USB 连接', 'err');
    log('连接失败：未找到设备', 'err');
  }
}

/* ================================================================== */
/* 免责声明                                                             */
/* ================================================================== */

const DISCLAIMER_KEY = 'tp55.disclaimer.v1';

function hasAcceptedDisclaimer() {
  try {
    return localStorage.getItem(DISCLAIMER_KEY) === 'accepted';
  } catch (e) {
    return false;
  }
}

function updateDisclaimerHint() {
  const body = $('#disclaimerBody');
  const hint = $('#disclaimerHint');
  if (!body || !hint) return;
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 8;
  hint.textContent = atBottom ? '✓ 已阅读全部条款' : '↓ 向下滚动阅读完整条款';
  hint.classList.toggle('done', atBottom);
  const wrap = $('#disclaimerModal .disclaimer-wrap');
  if (wrap) wrap.classList.toggle('at-bottom', atBottom);
}

function openDisclaimer(force) {
  const modal = $('#disclaimerModal');
  if (!modal) return;
  modal.dataset.force = force ? '1' : '0';
  modal.hidden = false;
  const body = $('.disclaimer-body', modal);
  if (body) body.scrollTop = 0;
  $('#btnCloseDisclaimer').hidden = !!force;
  $('#btnExitApp').hidden = !force;
  $('#btnAcceptDisclaimer').textContent = force ? '我已阅读并同意' : '关闭';
  setTimeout(updateDisclaimerHint, 40);
}

function closeDisclaimer(accepted) {
  if (accepted) {
    try {
      localStorage.setItem(DISCLAIMER_KEY, 'accepted');
    } catch (e) {
      /* ignore */
    }
  }
  const modal = $('#disclaimerModal');
  if (modal) modal.hidden = true;
}

function bindDisclaimer() {
  $('#btnDisclaimer').addEventListener('click', () => openDisclaimer(false));
  $('#btnCloseDisclaimer').addEventListener('click', () => closeDisclaimer(false));
  $('#btnExitApp').addEventListener('click', () => window.tp55.close());
  $('#btnAcceptDisclaimer').addEventListener('click', () => {
    const force = $('#disclaimerModal').dataset.force === '1';
    closeDisclaimer(force);
    if (force) log('已阅读并同意免责声明', 'ok');
  });
  $('#disclaimerModal').addEventListener('click', (e) => {
    if (e.target.id === 'disclaimerModal' && $('#disclaimerModal').dataset.force !== '1') closeDisclaimer(false);
  });
  $('#disclaimerBody').addEventListener('scroll', updateDisclaimerHint);
}

/* ================================================================== */
/* 其他页面                                                             */
/* ================================================================== */

function syncDacUi() {
  const mark = (container, value) => {
    $$('.option', container).forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.value) === Number(value));
    });
  };
  mark($('#filterList'), state.dac.filter);
  mark($('#workModeList'), state.dac.filterMode);
  mark($('#outputModeList'), state.dac.outputMode);
  $('#balanceRange').value = String(state.dac.balance);
  $('#balanceVal').textContent =
    state.dac.balance === 0 ? '居中' : state.dac.balance > 0 ? `右 ${state.dac.balance}` : `左 ${-state.dac.balance}`;
}

function syncMicUi() {
  $('#micRange').value = String(state.mic);
  $('#micVal').textContent = `${state.mic > 0 ? '+' : ''}${state.mic} dB`;
}

function bindDac() {
  const mark = (container, value) => {
    $$('.option', container).forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.value) === Number(value));
    });
  };

  $('#filterList').addEventListener('click', (e) => {
    const btn = e.target.closest('.option');
    if (!btn) return;
    state.dac.filter = Number(btn.dataset.value);
    mark($('#filterList'), state.dac.filter);
    window.tp55.setDac({ key: 'filter', value: state.dac.filter }).catch((err) => toast(err.message, 'err'));
    saveState();
    log('滤波器切换为 ' + btn.querySelector('b').textContent);
  });

  $('#workModeList').addEventListener('click', (e) => {
    const btn = e.target.closest('.option');
    if (!btn) return;
    state.dac.filterMode = Number(btn.dataset.value);
    mark($('#workModeList'), state.dac.filterMode);
    window.tp55.setDac({ key: 'filterMode', value: state.dac.filterMode }).catch((err) => toast(err.message, 'err'));
    saveState();
    log('工作模式切换为 ' + btn.querySelector('b').textContent);
  });

  $('#outputModeList').addEventListener('click', (e) => {
    const btn = e.target.closest('.option');
    if (!btn) return;
    state.dac.outputMode = Number(btn.dataset.value);
    mark($('#outputModeList'), state.dac.outputMode);
    window.tp55.setDac({ key: 'outputMode', value: state.dac.outputMode }).catch((err) => toast(err.message, 'err'));
    saveState();
    log('输出增益切换为 ' + btn.querySelector('b').textContent);
  });

  $('#balanceRange').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    state.dac.balance = v;
    $('#balanceVal').textContent = v === 0 ? '居中' : v > 0 ? `右 ${v}` : `左 ${-v}`;
    const left = v < 0 ? -v : 0;
    const right = v > 0 ? v : 0;
    window.tp55.setDac({ key: 'balance', value: { left, right } }).catch(() => {});
    saveState();
  });
}

function bindMic() {
  $('#micRange').addEventListener('input', (e) => {
    state.mic = Number(e.target.value);
    $('#micVal').textContent = `${state.mic > 0 ? '+' : ''}${state.mic} dB`;
  });

  $('#btnMicSave').addEventListener('click', async () => {
    try {
      await window.tp55.setMic({ gain: state.mic });
      await window.tp55.saveMic();
      toast('麦克风增益已写入设备');
      log('麦克风增益设置为 ' + state.mic + ' dB', 'ok');
    } catch (err) {
      toast(err.message || '写入失败', 'err');
    }
  });
}

/* ================================================================== */
/* 导航                                                                */
/* ================================================================== */

function switchPage(page) {
  $$('.nav-item[data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
  if (page === 'eq') setTimeout(draw, 30);
}

/* ================================================================== */
/* 初始化                                                              */
/* ================================================================== */

async function init() {
  loadState();

  // 表格/预设
  renderTable();
  bindTable();
  bindInspector();
  refreshPresetSelect();
  $('#presetSelect').value = state.presetId && allPresets().some((p) => p.id === state.presetId) ? state.presetId : '';
  $('#preamp').value = String(state.offset);
  $('#preampVal').textContent = `${state.offset > 0 ? '+' : ''}${state.offset.toFixed(1)} dB`;
  renderInspector();

  // DAC / MIC 回填
  syncDacUi();
  syncMicUi();

  // 导航
  $$('.nav-item[data-page]').forEach((b) => b.addEventListener('click', () => switchPage(b.dataset.page)));

  // 窗口按钮
  $('#btnMin').addEventListener('click', () => window.tp55.minimize());
  $('#btnMax').addEventListener('click', () => window.tp55.maximize());
  $('#btnClose').addEventListener('click', () => window.tp55.close());

  // 顶部动作
  $('#btnSave').addEventListener('click', async () => {
    if (!state.connected) {
      toast('设备未连接', 'err');
      return;
    }
    const btn = $('#btnSave');
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = '写入中…';
    btn.querySelector('.btn-spinner').hidden = false;
    try {
      await window.tp55.saveEq({ bands: state.bands, offset: state.offset, tag: 1 });
      markDirty(false);
      toast('已保存到设备，断电后依然生效', 'ok');
      log('EQ 参数已保存到设备 Flash', 'ok');
      setLast('保存完成');
    } catch (e) {
      toast('保存失败：' + (e.message || e), 'err');
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-label').textContent = '保存到设备';
      btn.querySelector('.btn-spinner').hidden = true;
    }
  });

  $('#btnImport').addEventListener('click', doImport);
  $('#btnExport').addEventListener('click', doExport);

  $('#btnFlat').addEventListener('click', async () => {
    const ok = await showConfirm('清零', '将所有频段增益归零？前置增益也会复位。', { okText: '清零' });
    if (!ok) return;
    applyPreset(FACTORY_PRESETS[0], false);
    toast('已清零，记得保存到设备');
  });

  $('#preamp').addEventListener('input', (e) => setOffset(e.target.value));

  $('#presetSelect').addEventListener('change', (e) => {
    const p = allPresets().find((x) => x.id === e.target.value);
    if (p) applyPreset(p, true);
  });

  $('#btnSavePreset').addEventListener('click', saveCurrentAsPreset);
  $('#btnDeletePreset').addEventListener('click', deleteCurrentPreset);
  $('#btnPresetLib').addEventListener('click', openPresetLibrary);
  $('#btnClosePresets').addEventListener('click', () => ($('#presetModal').hidden = true));
  $('#presetModal').addEventListener('click', (e) => {
    if (e.target.id === 'presetModal') $('#presetModal').hidden = true;
  });

  // 确认框
  $('#confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('#confirmOk').addEventListener('click', () => {
    const input = $('#confirmInput');
    if (input && !input.hidden) closeConfirm(input.value.trim() || '');
    else closeConfirm(true);
  });
  $('#confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirm(false);
  });
  $('#confirmInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#confirmOk').click();
  });

  // 设备页
  $('#btnReconnect').addEventListener('click', connectDevice);
  $('#btnReadFw').addEventListener('click', async () => {
    try {
      await window.tp55.readVersion();
      setLast('已请求固件版本');
    } catch (e) {
      toast(e.message, 'err');
    }
  });
  $('#btnFactory').addEventListener('click', async () => {
    const ok = await showConfirm('恢复出厂 EQ', '将设备 EQ 恢复为出厂平直状态，当前界面参数会被清空。确定继续？', {
      okText: '恢复',
    });
    if (!ok) return;
    try {
      await window.tp55.resetEq();
      applyPreset(FACTORY_PRESETS[0], false);
      markDirty(false);
      toast('已恢复出厂 EQ', 'ok');
      log('设备 EQ 已恢复出厂', 'warn');
    } catch (e) {
      toast(e.message, 'err');
    }
  });
  $('#btnClearLog').addEventListener('click', () => {
    state.logs = [];
    renderLogs();
  });

  bindDac();
  bindMic();
  bindCanvas();
  bindDeviceEvents();
  bindDisclaimer();

  // 设备状态
  try {
    const s = await window.tp55.status();
    setConnected(s);
  } catch (e) {
    /* ignore */
  }

  // 首次绘制
  setTimeout(() => {
    draw();
    log('界面已就绪', 'ok');
  }, 60);

  // 首次使用需确认免责声明
  if (!hasAcceptedDisclaimer()) {
    setTimeout(() => openDisclaimer(true), 140);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#presetModal').hidden = true;
      if (!$('#confirmModal').hidden) closeConfirm(false);
      const dm = $('#disclaimerModal');
      if (!dm.hidden && dm.dataset.force !== '1') closeDisclaimer(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if ($('#disclaimerModal').hidden) $('#btnSave').click();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
