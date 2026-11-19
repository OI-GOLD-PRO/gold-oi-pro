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
  let enabled = true, thresholds = defaults.slice();
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (valid(saved?.thresholds)) thresholds = saved.thresholds;
  } catch (_) {}
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify({ enabled, thresholds })); } catch (_) {}
  };
  const frames = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
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
      if (from < start || from >= until || bar.close === bar.open) continue;
      const x = scale.timeToCoordinate(bar.time);
      if (!Number.isFinite(x) || x < 0 || x > width) continue;
      const { delta, total } = volume.footprintTotals(from, Math.min(until, from + duration));
      const signal = marker(bar.open, bar.close, delta, total, thresholds);
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
  // A designated chart publishes only bars covered end-to-end by its live trade feed.
  let publisher = null, publishing = false, lastPublished = '';
  function publishStatus(message) {
    const status = $('deltaDiamondsBox')?.querySelector('[data-odd-publish-status]');
    if (status) status.textContent = message;
  }
  async function publishClosedBar() {
    if (!publisher || !enabled || publishing || O.paused || O.tf !== O.displayedTF) return;
    const feed = root.OI_bigtr;
    const duration = frames[O.tf], bars = O.series.data(), next = bars.at(-1), bar = bars.at(-2);
    if (!duration || !next || !bar || next.time < bar.time + duration) return;
    const opened = bar.time - O.tzShift, closed = opened + duration;
    const now = Date.now() / 1000, stream = O.sym + '/' + O.tf;
    const key = stream + '/' + closed;
    if (now < closed || now - closed >= 58 || key === lastPublished ||
        !feed?.coversLive(opened * 1000, closed * 1000)) return;
    const { delta, total } = volume.footprintTotals(opened * 1000, closed * 1000, true);
    if (!(total > 0)) return;
    const signal = marker(bar.open, bar.close, delta, total, thresholds);
    const side = signal ? (signal.below ? 'SELL' : 'BUY') : 'NONE';
    publishing = true;
    try {
      const result = await fetch(publisher.url + '/odd/v1/' + stream, {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + publisher.token, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({ closed, side, delta, total, source: feed.src })
      });
      if (!result.ok) throw new Error('HTTP ' + result.status);
      lastPublished = key;
      publishStatus('ส่งแท่งปิดแล้ว · ' + stream + ' · ' + side + ' · Δ ' + delta.toFixed(2));
    } catch (error) {
      publishStatus('ส่งข้อมูลไม่สำเร็จ · ' + error.message);
    } finally { publishing = false; }
  }
  setInterval(publishClosedBar, 2500);
  function mount() {
    const menu = $('indMenu');
    if (!menu || menu.hidden || $('deltaDiamondsBox')) return;
    const panel = document.createElement('div');
    panel.id = 'deltaDiamondsBox'; panel.className = 'gsbox';
    const levels = ['เล็กมาก', 'เล็ก', 'กลาง', 'ใหญ่'];
    const fields = thresholds.map((n, j) => `<label>${levels[j]} (%)<input data-odd-tier="${j}" type="number" inputmode="decimal" min="0" max="100" step="any" value="${n}" style="width:54px"></label>`).join('');
    panel.innerHTML = `<div class="row"><button type="button" class="gsb${enabled ? ' on' : ''}" data-odd-toggle>Opposite Delta Diamonds</button></div><div class="row ps">${fields}</div><span class="gsinfo">ขั้นต่ำ |Delta| ÷ Volume (%) เรียงจากน้อยไปมาก · เก็บ Delta และ Volume ของแท่งปิดไว้บนเครื่องสูงสุด 30 วัน</span><span class="gsinfo" data-odd-error hidden>ใส่ค่า 0–100 โดยแต่ละขนาดต้องมากกว่าขนาดก่อนหน้า</span><details><summary>ส่งสัญญาณให้ EA</summary><form data-odd-publish autocomplete="off"><label>Worker URL <input name="endpoint" type="url" required placeholder="https://…workers.dev"></label><label>Publish token <input name="token" type="password" required></label><button type="submit">เริ่มส่ง</button><button type="button" data-odd-stop>หยุดส่ง</button></form><span class="gsinfo" data-odd-publish-status></span></details>`;
    panel.querySelector('[data-odd-publish-status]').textContent = publisher ? 'กำลังส่งจากกราฟนี้' : 'เปิดกราฟและอินดี้ค้างไว้ที่ TF สำหรับ EA';
    panel.querySelector('[data-odd-publish]').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget, url = new URL(form.elements.endpoint.value);
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
        publishStatus('ใส่ Worker URL แบบ HTTPS โดยระบุเฉพาะโดเมน');
        return;
      }
      publisher = { url: url.origin, token: form.elements.token.value };
      lastPublished = '';
      form.elements.token.value = '';
      publishStatus('รอแท่งปิดที่ได้รับข้อมูลสดครบทั้งแท่ง');
    });
    panel.querySelector('[data-odd-stop]').onclick = () => {
      publisher = null;
      publishStatus('หยุดส่งสัญญาณแล้ว');
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
      save(); volume.setDiamonds(enabled); O.markDirty();
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
  volume.setDiamonds(enabled);
  O.markDirty();
})(typeof window === 'undefined' ? globalThis : window);
