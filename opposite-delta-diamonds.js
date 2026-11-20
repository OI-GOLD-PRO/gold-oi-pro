// Mark candles whose body direction opposes the shared footprint delta.
(function(root) {
  'use strict';
  const defaults = [0, 15, 30, 50];
  function marker(open, close, delta, total, thresholds) {
    if (!Number.isFinite(open) || !Number.isFinite(close) ||
        !Number.isFinite(delta) || !Number.isFinite(total) || total <= 0) return null;
    const below = close < open && delta > 0;
    const above = close > open && delta < 0;
    if (!below && !above) return null;
    const percent = Math.min(100, Math.abs(delta) / total * 100);
    const tier = thresholds.findLastIndex(limit => percent >= limit);
    return tier < 0 ? null : { below, tier };
  }
  if (typeof module === 'object' && module.exports) module.exports = { marker };
  const O = root.OI, volume = root.OI_volumeProfile;
  if (!O?.hooks || !volume?.setDiamonds) return;
  const $ = id => document.getElementById(id);
  const key = 'oi_opposite_delta_diamonds' + (O.psfx || '');
  const valid = values => Array.isArray(values) && values.length === 4 &&
    values.every((v, j) => Number.isFinite(v) && v >= 0 && v <= 100 && (!j || v > values[j - 1]));
  const validHours = value => Number.isInteger(value) && value >= 1 && value <= 720;
  let enabled = true, thresholds = defaults.slice(), workerURL = "", hours = 4;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (valid(saved?.thresholds)) thresholds = saved.thresholds;
    if (validHours(saved?.hours)) hours = saved.hours;
    if (typeof saved?.workerURL === "string") workerURL = workerOrigin(saved.workerURL);
  } catch (_) {}
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify({ enabled, thresholds, workerURL, hours })); } catch (_) {}
  };
  const frames = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  function workerOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.pathname === '/' && !url.username &&
        !url.password && !url.search && !url.hash ? url.origin : '';
    } catch (_) { return ''; }
  }
  let sharedBars = new Map(), sharedKey = '', polling = false;
  const streamKey = () => workerURL + '/odd/v1/' + O.sym + '/' + O.tf;
  function updateCollection() { volume.setDiamonds(enabled && !workerURL); }
  function sharedStatus(message) {
    const status = $('deltaDiamondsBox')?.querySelector('[data-odd-shared-status]');
    if (status) status.textContent = message;
  }
  async function pollShared() {
    if (!workerURL || !enabled || polling || !frames[O.tf] || O.tf !== O.displayedTF) return;
    const key = streamKey();
    polling = true;
    try {
      const result = await fetch(key + '?format=json', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!result.ok) throw new Error('HTTP ' + result.status);
      const data = await result.json();
      if (!Array.isArray(data.bars)) throw new Error('invalid feed');
      if (key !== streamKey()) return;
      sharedBars = new Map(data.bars.map(bar => [bar.opened, bar]));
      sharedKey = key;
      summary = null;
      const latest = data.bars.at(-1);
      const fresh = latest && Date.now() / 1000 - latest.closed < frames[O.tf] + 60;
      sharedStatus(fresh
        ? 'Worker · ' + latest.side + ' · Δ ' + latest.delta.toFixed(2)
        : 'รอแท่งปิดใหม่จาก Worker');
      O.markDirty();
    } catch (error) {
      if (key === streamKey()) sharedStatus('อ่าน Worker ไม่สำเร็จ · ' + error.message);
    } finally { polling = false; }
  }
  setInterval(pollShared, 5000);
  const radii = [3, 4.5, 6, 8];
  const green = '#43e58e', orange = '#ff7900';
  const scale = O.chart.timeScale();
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const signed = value => (value > 0 ? '+' : '') + number.format(value);
  let hits = [], selected = null, summary = null, drawnStream = '';
  function signalFor(bar, from, duration, until) {
    if (workerURL) {
      const shared = sharedKey === streamKey() && sharedBars.get(from / 1000);
      if (!shared || !['BUY', 'SELL'].includes(shared.side) ||
          !Number.isFinite(shared.delta) || !Number.isFinite(shared.total) || shared.total <= 0) return null;
      const percent = Math.min(100, Math.abs(shared.delta) / shared.total * 100);
      return { below: shared.side === 'SELL', delta: shared.delta,
        tier: Math.max(0, thresholds.findLastIndex(limit => percent >= limit)) };
    }
    if (from >= until || bar.close === bar.open) return null;
    const { delta, total } = volume.footprintTotals(from, Math.min(until, from + duration));
    const signal = marker(bar.open, bar.close, delta, total, thresholds);
    return signal && { ...signal, delta };
  }
  function totals(bars, now, duration, shift, until) {
    if (summary && now - summary.at < 1000) return summary;
    const cutoff = now - hours * 3600e3;
    let positive = 0, negative = 0;
    for (let i = bars.length - 1; i >= 0; i--) {
      const bar = bars[i], from = bar.time * 1000 - shift, closed = from + duration;
      if (closed <= cutoff) break;
      if (closed > now) continue;
      const signal = signalFor(bar, from, duration, until);
      if (!signal) continue;
      if (signal.below) positive += signal.delta;
      else negative += signal.delta;
    }
    return summary = { at: now, positive, negative };
  }
  function label(ctx, parts, left, top, width) {
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const boxWidth = 14 + parts.reduce((sum, part) => sum + ctx.measureText(part[0]).width, 0);
    let x = Math.max(0, Math.min(left - boxWidth / 2, width - boxWidth));
    ctx.fillStyle = '#0b1526f2';
    ctx.fillRect(x, top, boxWidth, 22);
    x += 7;
    for (const [value, color] of parts) {
      ctx.fillStyle = color;
      ctx.fillText(value, x, top + 11);
      x += ctx.measureText(value).width;
    }
  }
  setInterval(() => {
    if (enabled && !document.hidden) O.markDirty();
  }, 30000);
  O.chart.subscribeClick(event => {
    if (!enabled) return;
    const point = event.point;
    const matches = point ? hits.filter(hit =>
      Math.abs(hit.x - point.x) + Math.abs(hit.y - point.y) <= Math.max(13, hit.radius + 4)) : [];
    const hit = matches.reduce((best, next) => !best ||
      Math.hypot(next.x - point.x, next.y - point.y) < Math.hypot(best.x - point.x, best.y - point.y)
      ? next : best, null);
    const time = hit?.time ?? null;
    selected = time === selected ? null : time;
    O.markDirty();
  });
  O.hooks.push((ctx, w, h) => {
    hits = [];
    const duration = frames[O.tf] * 1000, shift = O.tzShift * 1000;
    const width = scale.width(), height = h - scale.height();
    const stream = streamKey();
    if (drawnStream !== stream) { drawnStream = stream; summary = selected = null; }
    if (!enabled || !duration || O.tf !== O.displayedTF || width <= 0 || height <= 0) return;
    const now = Date.now(), bars = O.series.data();
    const { end } = volume.footprintWindow();
    const start = now - 30 * 86400e3;
    const until = Math.min(end, now + 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.globalAlpha = 1;
    for (const bar of bars) {
      const from = bar.time * 1000 - shift;
      if (from < start) continue;
      const x = scale.timeToCoordinate(bar.time);
      if (!Number.isFinite(x) || x < 0 || x > width) continue;
      const signal = signalFor(bar, from, duration, until);
      if (!signal) continue;
      const anchor = O.series.priceToCoordinate(signal.below ? bar.low : bar.high);
      if (!Number.isFinite(anchor)) continue;
      const radius = radii[signal.tier];
      const gap = signal.below && root.OI_footprint?.active ? 21 : 3;
      const y = anchor + (signal.below ? 1 : -1) * (radius + gap);
      if (y + radius < 0 || y - radius > height) continue;
      const color = signal.below ? green : orange;
      hits.push({ time: bar.time, x, y, radius, color, delta: signal.delta });
      ctx.beginPath();
      ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    const { positive, negative } = totals(bars, now, duration, shift, until);
    label(ctx, [['รวม Δ ' + hours + ' ชม.  ', '#c7d7ef'], ['◆ ' + signed(positive), green],
      ['   ', '#c7d7ef'], ['◆ ' + signed(negative), orange]], width / 2, 5, width);
    const hit = hits.find(item => item.time === selected);
    if (hit) {
      const top = hit.y > 60 ? hit.y - hit.radius - 25 : hit.y + hit.radius + 4;
      label(ctx, [['Δ ' + signed(hit.delta), hit.color]], hit.x, Math.min(height - 22, top), width);
    }
    ctx.restore();
  });
  function mount() {
    const menu = $('indMenu');
    if (!menu || menu.hidden || $('deltaDiamondsBox')) return;
    const panel = document.createElement('div');
    panel.id = 'deltaDiamondsBox'; panel.className = 'gsbox';
    const levels = ['เล็กมาก', 'เล็ก', 'กลาง', 'ใหญ่'];
    const fields = thresholds.map((n, j) => `<label>${levels[j]} (%)<input data-odd-tier="${j}" type="number" inputmode="decimal" min="0" max="100" step="any" value="${n}" style="width:54px"></label>`).join('');
    panel.innerHTML = `<div class="row"><button type="button" class="gsb${enabled ? ' on' : ''}" data-odd-toggle>Opposite Delta Diamonds</button></div><div class="row ps">${fields}</div><div class="row ps"><label>รวมเดลต้าย้อนหลัง (ชม.) <input data-odd-hours type="number" inputmode="numeric" min="1" max="720" step="1" value="${hours}" style="width:64px"></label></div><span class="gsinfo">ยอดรวมนับข้าวหลามตัดจากแท่งที่ปิดแล้วใน TF ปัจจุบัน · แตะข้าวหลามตัดเพื่อดูค่า Δ</span><span class="gsinfo">ขั้นต่ำ |Delta| ÷ Volume (%) เรียงจากน้อยไปมาก · เก็บ Delta และ Volume ของแท่งปิดไว้บนเครื่องสูงสุด 30 วัน</span><span class="gsinfo" data-odd-error hidden>ใส่ค่า 0–100 โดยแต่ละขนาดต้องมากกว่าขนาดก่อนหน้า</span><details><summary>สัญญาณส่วนกลางสำหรับ EA</summary><form data-odd-shared><label>Worker URL <input name="endpoint" type="url" required placeholder="https://…workers.dev"></label><button type="submit">ใช้สัญญาณส่วนกลาง</button><button type="button" data-odd-local>ใช้ข้อมูลในแอป</button></form><span class="gsinfo">เมื่อใช้สัญญาณส่วนกลาง ค่า % ปรับขนาดข้าวหลามตัด</span><span class="gsinfo" data-odd-shared-status></span></details>`;
    const form = panel.querySelector('[data-odd-shared]');
    form.elements.endpoint.value = workerURL;
    panel.querySelector('[data-odd-shared-status]').textContent = workerURL ? 'ใช้สัญญาณส่วนกลาง' : 'ใช้ข้อมูลในแอป';
    form.addEventListener('submit', event => {
      event.preventDefault();
      const url = workerOrigin(form.elements.endpoint.value);
      if (!url) { sharedStatus('ใส่ Worker URL แบบ HTTPS โดยระบุเฉพาะโดเมน'); return; }
      workerURL = url;
      save(); updateCollection(); O.markDirty();
      sharedStatus('รอข้อมูลจาก Worker');
      pollShared();
    });
    panel.querySelector('[data-odd-local]').onclick = () => {
      workerURL = '';
      form.reset();
      save(); updateCollection(); O.markDirty();
      sharedStatus('ใช้ข้อมูลในแอป');
    };
    const anchor = menu.querySelector('.t');
    if (anchor) anchor.after(panel);
    else menu.prepend(panel);
  }
  const menu = $('indMenu');
  if (menu) {
    new MutationObserver(mount).observe(menu, { childList: true });
    menu.addEventListener('click', e => {
      const button = e.target.closest('[data-odd-toggle]');
      if (!button) return;
      enabled = !enabled;
      summary = selected = null;
      button.classList.toggle('on', enabled);
      save(); updateCollection(); O.markDirty();
      if (enabled) pollShared();
    });
    menu.addEventListener('change', e => {
      const hoursInput = e.target.closest('[data-odd-hours]');
      if (hoursInput) {
        const value = hoursInput.valueAsNumber;
        if (validHours(value)) {
          hours = value;
          summary = null;
          save(); O.markDirty();
        }
        hoursInput.value = hours;
        return;
      }
      const input = e.target.closest('[data-odd-tier]');
      if (!input) return;
      const index = +input.dataset.oddTier, next = thresholds.slice();
      next[index] = input.value === '' ? NaN : +input.value;
      const error = $('deltaDiamondsBox').querySelector('[data-odd-error]');
      error.hidden = valid(next);
      if (!error.hidden) { input.value = thresholds[index]; return; }
      thresholds = next;
      summary = null;
      save(); O.markDirty();
    });
    mount();
  }
  updateCollection();
  O.markDirty();
  pollShared();
})(typeof window === 'undefined' ? globalThis : window);
