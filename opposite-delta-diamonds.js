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
  let enabled = true, thresholds = defaults.slice(), workerURL = "";
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (valid(saved?.thresholds)) thresholds = saved.thresholds;
    if (typeof saved?.workerURL === "string") workerURL = workerOrigin(saved.workerURL);
  } catch (_) {}
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify({ enabled, thresholds, workerURL })); } catch (_) {}
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
  const scale = O.chart.timeScale();
  O.hooks.push((ctx, w, h) => {
    if (!enabled) return;
    const duration = frames[O.tf] * 1000, shift = O.tzShift * 1000;
    const width = scale.width(), height = h - scale.height();
    if (!duration || width <= 0 || height <= 0) return;
    const { end } = volume.footprintWindow();
    const start = Date.now() - 30 * 86400e3;
    const until = Math.min(end, Date.now() + 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.globalAlpha = 1;
    for (const bar of O.series.data()) {
      const from = bar.time * 1000 - shift;
      if (from < start || (!workerURL && (from >= until || bar.close === bar.open))) continue;
      const x = scale.timeToCoordinate(bar.time);
      if (!Number.isFinite(x) || x < 0 || x > width) continue;
      let signal;
      if (workerURL) {
        const shared = sharedKey === streamKey() && sharedBars.get(from / 1000);
        if (!shared || !['BUY', 'SELL'].includes(shared.side)) continue;
        const percent = Math.min(100, Math.abs(shared.delta) / shared.total * 100);
        signal = { below: shared.side === 'SELL', tier: Math.max(0, thresholds.findLastIndex(limit => percent >= limit)) };
      } else {
        const { delta, total } = volume.footprintTotals(from, Math.min(until, from + duration));
        signal = marker(bar.open, bar.close, delta, total, thresholds);
      }
      if (!signal) continue;
      const anchor = O.series.priceToCoordinate(signal.below ? bar.low : bar.high);
      if (!Number.isFinite(anchor)) continue;
      const radius = radii[signal.tier];
      const gap = signal.below && root.OI_footprint?.active ? 21 : 3;
      const y = anchor + (signal.below ? 1 : -1) * (radius + gap);
      ctx.beginPath();
      ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();
      ctx.fillStyle = signal.below ? '#43e58e' : '#ff7900';
      ctx.fill();
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
    panel.innerHTML = `<div class="row"><button type="button" class="gsb${enabled ? ' on' : ''}" data-odd-toggle>Opposite Delta Diamonds</button></div><div class="row ps">${fields}</div><span class="gsinfo">ขั้นต่ำ |Delta| ÷ Volume (%) เรียงจากน้อยไปมาก · เก็บ Delta และ Volume ของแท่งปิดไว้บนเครื่องสูงสุด 30 วัน</span><span class="gsinfo" data-odd-error hidden>ใส่ค่า 0–100 โดยแต่ละขนาดต้องมากกว่าขนาดก่อนหน้า</span><details><summary>สัญญาณส่วนกลางสำหรับ EA</summary><form data-odd-shared><label>Worker URL <input name="endpoint" type="url" required placeholder="https://…workers.dev"></label><button type="submit">ใช้สัญญาณส่วนกลาง</button><button type="button" data-odd-local>ใช้ข้อมูลในแอป</button></form><span class="gsinfo">เมื่อใช้สัญญาณส่วนกลาง ค่า % ปรับขนาดข้าวหลามตัด</span><span class="gsinfo" data-odd-shared-status></span></details>`;
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
      button.classList.toggle('on', enabled);
      save(); updateCollection(); O.markDirty();
      if (enabled) pollShared();
    });
    menu.addEventListener('change', e => {
      const input = e.target.closest('[data-odd-tier]');
      if (!input) return;
      const index = +input.dataset.oddTier, next = thresholds.slice();
      next[index] = input.value === '' ? NaN : +input.value;
      const error = $('deltaDiamondsBox').querySelector('[data-odd-error]');
      error.hidden = valid(next);
      if (!error.hidden) { input.value = thresholds[index]; return; }
      thresholds = next;
      save(); O.markDirty();
    });
    mount();
  }
  updateCollection();
  O.markDirty();
  pollShared();
})(typeof window === 'undefined' ? globalThis : window);
