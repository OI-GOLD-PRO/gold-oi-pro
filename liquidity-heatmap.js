// Sample displayed Binance limit orders. Each column is one book, not traded volume.
(() => {
  'use strict';
  const O = window.OI;
  if (!O || O.sym !== 'gold') return;
  const pref = 'oi_liquidity_enabled' + (O.psfx || '');
  const historyKey = 'oi_liquidity_xau_depth_v1' + (O.psfx || '');
  const interval = 5000, retention = 3600000, row = 0.50;
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
      const tick = Math.floor(Math.round(Number(price) * 100) / (row * 100));
      const qty = Number(size);
      if (Number.isFinite(tick) && tick > 0 && Number.isFinite(qty) && qty > 0)
        levels.set(tick, (levels.get(tick) || 0) + qty);
    }
    return [...levels];
  }
  async function sample() {
    if (busy || document.hidden || Date.now() < retryAt) return;
    busy = true;
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/depth?symbol=XAUUSDT&limit=1000',
        {cache:'no-store', signal:AbortSignal.timeout(7000)});
      if (!res.ok) {
        if (res.status === 429 || res.status === 418)
          retryAt = Date.now() + Math.max(60, Number(res.headers.get('Retry-After')) || 60) * 1000;
        throw Error('HTTP ' + res.status);
      }
      const book = await res.json();
      const time = Number(book.E || book.T);
      if (document.hidden) return;
      if (!Number.isFinite(time) || Math.abs(time - Date.now()) > 30000) throw Error('ข้อมูลล่าช้า');
      if (time <= (samples.at(-1)?.time || 0)) { setStatus('รอสมุดคำสั่งชุดใหม่'); return; }
      const bids = aggregate(book.bids), asks = aggregate(book.asks);
      if (!bids.length || !asks.length || !Number.isFinite(O.adj)) throw Error('รอข้อมูลระดับราคา');
      const rows = [...bids, ...asks.map(([p,q]) => [p,-q])];
      samples = samples.filter(s => s.time > time - retention);
      samples.push({time, rows, step:row, offset:O.adj, peak:Math.max(...rows.map(r => Math.abs(r[1])))});
      setStatus('รับข้อมูลล่าสุด ' + new Date(time).toLocaleTimeString('th-TH'));
      if (enabled) redraw?.();
    } catch (err) {
      setStatus('อ่านสมุดคำสั่ง Binance ไม่ได้ · ' + err.message + ' · จะลองใหม่อัตโนมัติ');
      if (enabled) redraw?.();
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
        const step = s.step || 0.10;
        for (const [tick, signed] of s.rows) {
          const y = O.series.priceToCoordinate((tick + 1) * step - s.offset);
          const bottom = O.series.priceToCoordinate(tick * step - s.offset);
          if (!Number.isFinite(y) || !Number.isFinite(bottom) || y > mediaSize.height || bottom < 0) continue;
          const intensity = Math.abs(signed) / s.peak;
          const alpha = 0.12 + 0.78 * Math.sqrt(intensity);
          const rgb = signed > 0 ? (intensity >= 0.65 ? '129,255,62' : '14,166,91') :
            (intensity >= 0.65 ? '255,157,28' : '221,51,61');
          ctx.fillStyle = 'rgba(' + rgb + ',' + alpha + ')';
          ctx.fillRect(x,y,Math.ceil(width),Math.max(2,bottom-y));
        }
      }
      // Show the current book at the live edge while the time history accumulates.
      const latest = samples.at(-1);
      const liveX = scale.timeToCoordinate(bars.at(-1).time);
      const age = Date.now() - latest.time;
      const barAge = latest.time / 1000 + O.tzShift - bars.at(-1).time;
      if (age >= 0 && age < 15000 && barAge >= 0 && barAge < duration &&
          Number.isFinite(liveX) && liveX >= 0 && liveX <= mediaSize.width) {
        const step = latest.step || 0.10;
        const visible = [];
        for (const [tick, qty] of latest.rows) {
          const price = tick * step - latest.offset;
          const top = O.series.priceToCoordinate(price + step);
          const bottom = O.series.priceToCoordinate(price);
          if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
          const y = (top + bottom) / 2;
          if (y < 0 || y >= mediaSize.height) continue;
          visible.push({price, qty, y, height:Math.max(4, Math.abs(bottom-top))});
        }
        visible.sort((a,b) => Math.abs(b.qty) - Math.abs(a.qty));
        const walls = [1,-1].flatMap(sign => visible.filter(w => Math.sign(w.qty) === sign).slice(0,3));
        const peak = Math.abs(visible[0]?.qty || 1);
        ctx.save();
        const right = mediaSize.width;
        const usedLabels = [];
        ctx.font = 'bold 11px sans-serif';
        ctx.textBaseline = 'middle';
        for (const wall of walls.sort((a,b) => Math.abs(b.qty)-Math.abs(a.qty))) {
          const strength = Math.sqrt(Math.abs(wall.qty) / peak);
          const width = right * (0.46 + 0.50 * strength);
          const left = right - width;
          const rgb = wall.qty > 0 ? '65,238,99' : '255,130,44';
          const top = wall.y - wall.height / 2;
          ctx.fillStyle = 'rgba(' + rgb + ',' + (0.14 + 0.34 * strength) + ')';
          ctx.fillRect(left, top, width, wall.height);
          ctx.fillStyle = 'rgba(' + rgb + ',0.9)';
          ctx.fillRect(left, top, width, 1);
          const labelY = Math.max(8, Math.min(mediaSize.height-8, wall.y));
          if (usedLabels.some(y => Math.abs(y-labelY) < 16)) continue;
          usedLabels.push(labelY);
          const label = (wall.qty > 0 ? 'BID ' : 'ASK ') + wall.price.toFixed(2) +
            ' · ' + Math.abs(wall.qty).toLocaleString('en-US',{maximumFractionDigits:1}) + ' LIVE';
          ctx.fillStyle = '#101927';
          ctx.fillRect(left, labelY-7, ctx.measureText(label).width+8, 14);
          ctx.fillStyle = wall.qty > 0 ? '#98ff93' : '#ffb371';
          ctx.fillText(label,left+4,labelY);
        }
        ctx.restore();
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
    box.innerHTML = '<div class="row"><button type="button" class="gsb">Liquidity Heatmap</button></div><span class="gsinfo">Binance Futures · XAUUSDT · Bid เขียว / Ask ส้ม · 1,000 ระดับต่อฝั่ง · รวมทุก $0.50 · แถบ LIVE แสดง 3 ระดับที่มีปริมาณรอสูงสุดต่อฝั่งในจอ · แถบยิ่งยาวและสว่าง ปริมาณยิ่งมาก · ประวัติแสดงตามเวลาที่เก็บจริง · เก็บข้อมูลแม้ซ่อนอินดี้ ขณะเปิดหน้ากราฟทอง ทุก 5 วินาที สูงสุด 1 ชม.</span><span class="gsinfo" id="liqStatus"></span>';
    const btn = box.querySelector('button');
    function paint() { btn.classList.toggle('on',enabled); btn.setAttribute('aria-pressed',String(enabled)); }
    btn.onclick = () => {
      enabled = !enabled;
      try { localStorage.setItem(pref,enabled?'1':'0'); } catch (_) {}
      paint(); redraw?.();
    };
    paint(); menu.append(box); setStatus(status || 'กำลังอ่านสมุดคำสั่ง');
  }
  if (menu) { new MutationObserver(mount).observe(menu,{childList:true,attributes:true,attributeFilter:['hidden']}); mount(); }
  setInterval(sample, interval);
  setInterval(() => { if (!document.hidden) saveHistory(); },60000);
  document.addEventListener('visibilitychange',()=>{ if (document.hidden) saveHistory(); else sample(); });
  window.addEventListener('pagehide',saveHistory);
  sample();
})();