// Sample displayed Binance limit orders. Each column is one book, not traded volume.
(() => {
  'use strict';
  const O = window.OI;
  if (!O || O.sym !== 'gold') return;
  const pref = 'oi_liquidity_enabled' + (O.psfx || '');
  const historyKey = 'oi_liquidity_xau_depth_v1' + (O.psfx || '');
  const interval = 5000, retention = 3600000, row = 0.10;
  const periods = {'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400};
  const scale = O.chart.timeScale();
  let enabled = false, samples = [], status = '', busy = false, retryAt = 0, redraw;
  try {
    enabled = localStorage.getItem(pref) === '1';
    const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
    samples = saved.filter(s => s.time > Date.now() - retention && Array.isArray(s.rows) && Number.isFinite(s.offset));
  } catch (_) {}
  function saveHistory() {
    if (!samples.length) return;
    try { localStorage.setItem(historyKey, JSON.stringify(samples)); } catch (_) {}
  }
  function setStatus(value) {
    status = value;
    const node = document.getElementById('liqStatus');
    if (node) node.textContent = value;
  }
  function aggregate(entries) {
    const levels = new Map();
    for (const [price, size] of entries) {
      const tick = Math.floor(Math.round(Number(price) * 100) / 10);
      const qty = Number(size);
      if (Number.isFinite(tick) && tick > 0 && Number.isFinite(qty) && qty > 0)
        levels.set(tick, (levels.get(tick) || 0) + qty);
    }
    return [...levels];
  }
  async function sample() {
    if (!enabled || busy || document.hidden || O.paused || Date.now() < retryAt) return;
    busy = true;
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/depth?symbol=XAUUSDT&limit=100',
        {cache:'no-store', signal:AbortSignal.timeout(7000)});
      if (!res.ok) {
        if (res.status === 429 || res.status === 418)
          retryAt = Date.now() + Math.max(60, Number(res.headers.get('Retry-After')) || 60) * 1000;
        throw Error('HTTP ' + res.status);
      }
      const book = await res.json();
      const time = Number(book.E || book.T);
      if (!enabled || document.hidden) return;
      if (!Number.isFinite(time) || Math.abs(time - Date.now()) > 30000) throw Error('ข้อมูลล่าช้า');
      if (time <= (samples.at(-1)?.time || 0)) return;
      const bids = aggregate(book.bids), asks = aggregate(book.asks);
      if (!bids.length || !asks.length || !Number.isFinite(O.adj)) throw Error('รอข้อมูลระดับราคา');
      const rows = [...bids, ...asks.map(([p,q]) => [p,-q])];
      samples = samples.filter(s => s.time > time - retention);
      samples.push({time, rows, offset:O.adj, peak:Math.max(...rows.map(r => Math.abs(r[1])))});
      setStatus('รับข้อมูลล่าสุด ' + new Date(time).toLocaleTimeString('th-TH'));
      redraw?.();
    } catch (err) {
      setStatus('อ่านสมุดคำสั่งไม่ได้ · ' + err.message);
      retryAt = Math.max(retryAt, Date.now() + 10000);
    } finally { busy = false; }
  }
  function render(target) {
    if (!enabled || O.tf !== O.displayedTF || !samples.length) return;
    const duration = periods[O.tf], bars = O.series.data();
    if (!duration || !bars.length) return;
    const spacing = scale.options().barSpacing;
    target.useMediaCoordinateSpace(({context:ctx,mediaSize}) => {
      let i = bars.length - 1, lastPixel = Infinity;
      for (let j = samples.length - 1; j >= 0; j--) {
        const s = samples[j], time = s.time / 1000 + O.tzShift;
        if (s.time < Date.now() - retention) break;
        while (i >= 0 && bars[i].time > time) i--;
        if (i < 0) break;
        const fraction = (time - bars[i].time) / duration;
        if (fraction >= 1) continue;
        const center = scale.timeToCoordinate(bars[i].time);
        if (!Number.isFinite(center)) continue;
        const x = Math.floor(center + (fraction - 0.5) * spacing);
        const end = Math.min(samples[j+1]?.time ?? Date.now(), s.time + interval * 1.5);
        const width = Math.max(1, spacing * (end - s.time) / (duration * 1000));
        if (x + width < 0) break;
        if (x >= mediaSize.width || x === lastPixel) continue;
        lastPixel = x;
        for (const [tick, signed] of s.rows) {
          const y = O.series.priceToCoordinate((tick + 1) * row - s.offset);
          const bottom = O.series.priceToCoordinate(tick * row - s.offset);
          if (!Number.isFinite(y) || !Number.isFinite(bottom) || y > mediaSize.height || bottom < 0) continue;
          const intensity = Math.sqrt(Math.abs(signed) / s.peak);
          ctx.fillStyle = signed > 0 ? 'rgba(55,224,115,' + (0.08+0.70*intensity) + ')' :
            'rgba(255,105,55,' + (0.08+0.70*intensity) + ')';
          ctx.fillRect(x,y,width,Math.max(1,bottom-y));
        }
      }
    });
  }
  const view = {zOrder:()=>'bottom', renderer:()=>({draw:render})};
  O.series.attachPrimitive({attached({requestUpdate}) { redraw = requestUpdate; }, paneViews:()=>[view]});
  const menu = document.getElementById('indMenu');
  function mount() {
    if (!menu || menu.hidden || document.getElementById('liquidityBookBox')) return;
    const box = document.createElement('div');
    box.id = 'liquidityBookBox'; box.className = 'gsbox';
    box.innerHTML = '<div class="row"><button type="button" class="gsb">Liquidity Heatmap</button></div><span class="gsinfo">Binance Futures · XAUUSDT · Bid เขียว / Ask ส้ม · 100 ระดับต่อฝั่ง · เก็บตัวอย่างทุก 5 วินาที ย้อนหลัง 1 ชม.</span><span class="gsinfo" id="liqStatus"></span>';
    const btn = box.querySelector('button');
    function paint() { btn.classList.toggle('on',enabled); btn.setAttribute('aria-pressed',String(enabled)); }
    btn.onclick = () => {
      enabled = !enabled;
      try { localStorage.setItem(pref,enabled?'1':'0'); } catch (_) {}
      paint(); setStatus(enabled ? 'กำลังอ่านสมุดคำสั่ง' : 'ปิด');
      redraw?.(); if (enabled) sample(); else saveHistory();
    };
    paint(); menu.append(box); setStatus(status || (enabled ? 'กำลังอ่านสมุดคำสั่ง' : 'ปิด'));
  }
  if (menu) { new MutationObserver(mount).observe(menu,{childList:true,attributes:true,attributeFilter:['hidden']}); mount(); }
  setInterval(sample, interval);
  setInterval(() => { if (enabled && !document.hidden) saveHistory(); },60000);
  document.addEventListener('visibilitychange',()=>{ if (document.hidden) saveHistory(); else sample(); });
  window.addEventListener('pagehide',saveHistory);
  sample();
})();