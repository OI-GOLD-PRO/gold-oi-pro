// Big Traders: ไม้ใหญ่ (ไล่ซื้อ/ไล่ขายจริงจาก perp XAUUSDT) วางบนแท่งเทียนตรงราคาที่เข้า + Delta (ซื้อ − ขาย) ต่อแท่ง
// ข้อมูล: Binance USDⓈ-M (aggTrades มีฝั่ง taker จริง, klines มี taker buy volume → Delta ย้อนหลังได้ทุก TF)
//        สำรอง Bitget (fills มีฝั่ง taker) ถ้าเครือข่ายเข้า Binance ไม่ได้
// ไม่ใช่วอลลุ่ม CME แต่เป็นการซื้อขายจริงที่รู้ฝั่ง ใช้ดูว่าเจ้าใหญ่ไล่ราคาฝั่งไหน ที่ราคาเท่าไหร่
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.hooks || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const $ = id => document.getElementById(id);
  const SYM = 'XAUUSDT', TZ = 7 * 3600;
  const TFS = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  const DEF = { on: false, auto: true, thr: 5, delta: true, hours: 3 };
  const KEY = 'oi_bigtr' + (O.psfx || '');
  let cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

  // ---------- สถานะ ----------
  let src = null;             // 'binance' | 'bitget'
  let trades = [];            // ไม้ใหญ่ {t ms, p, q, s: 1 ซื้อ / -1 ขาย}
  let sizes = [];             // ขนาดไม้ล่าสุด (คำนวณเกณฑ์อัตโนมัติ)
  let delta = new Map();      // เวลาแท่ง (วินาทีแกนกราฟ) → { b, s } ปริมาณไล่ซื้อ/ไล่ขาย
  let pxOff = new Map();      // เวลาแท่ง → ราคา perp − ราคาบนกราฟ (แปลงราคาไม้ให้ตรงแกน)
  let curTf = null, busy = false, ws = null, wsTimer = null, status = '';
  const thr = () => cfg.auto ? autoThr() : Math.max(0.01, +cfg.thr || 5);
  function autoThr() { if (sizes.length < 200) return 5; const a = sizes.slice().sort((x, y) => x - y); return Math.max(1, Math.round(a[Math.floor(a.length * 0.995)] * 10) / 10); }
  const barOf = ms => { const sec = TFS[O.tf] || 60; return Math.floor(ms / 1000 / sec) * sec + TZ; };
  const fetchJ = async (u, ms) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 8000); try { const r = await fetch(u, { signal: ac.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } };

  // ---------- Delta + ราคาอ้างอิงต่อแท่ง (Binance klines: k[9] = taker buy volume) ----------
  async function loadKlines() {
    const B = O.series.data() || []; if (!B.length) return;
    const disp = new Map(B.map(b => [b.time, b.close]));
    const n = Math.min(1500, Math.max(100, B.length));
    if (src !== 'bitget') {
      try {
        const k = await fetchJ(`https://fapi.binance.com/fapi/v1/klines?symbol=${SYM}&interval=${O.tf}&limit=${n}`);
        const dm = new Map(), om = new Map();
        k.forEach(x => { const t = Math.floor(x[0] / 1000) + TZ, v = +x[5], tb = +x[9]; dm.set(t, { b: tb, s: v - tb }); if (disp.has(t)) om.set(t, +x[4] - disp.get(t)); });
        delta = dm; pxOff = om; src = 'binance'; return;
      } catch (e) { src = 'bitget'; }
    }
    // สำรอง: Bitget klines (ไม่มีฝั่ง taker) → ใช้แค่ราคาอ้างอิง ส่วน Delta คิดจากไม้ที่ดึงได้
    try {
      const G = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D' };
      const j = await fetchJ(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${SYM}&productType=usdt-futures&granularity=${G[O.tf]}&limit=${Math.min(1000, n)}`);
      const om = new Map(); (j.data || []).forEach(x => { const t = Math.floor(+x[0] / 1000) + TZ; if (disp.has(t)) om.set(t, +x[4] - disp.get(t)); });
      pxOff = om;
    } catch (e) {}
  }
  // ราคาไม้ → ราคาบนกราฟ (ใช้ส่วนต่างของแท่งนั้น ถ้าไม่มีใช้ของแท่งใกล้สุด)
  function offAt(t) {
    if (pxOff.has(t)) return pxOff.get(t);
    let best = null, bd = Infinity; pxOff.forEach((v, k) => { const d = Math.abs(k - t); if (d < bd) { bd = d; best = v; } });
    return best === null ? 0 : best;
  }

  // ---------- ย้อนหลังไม้ใหญ่ ----------
  function addTrade(t, p, q, s, keepAll) {
    sizes.push(q); if (sizes.length > 20000) sizes.splice(0, sizes.length - 20000);
    if (src === 'bitget') { const bt = barOf(t), d = delta.get(bt) || { b: 0, s: 0 }; if (s > 0) d.b += q; else d.s += q; delta.set(bt, d); }
    if (keepAll || q >= Math.min(thr(), 1)) trades.push({ t, p, q, s });
  }
  async function backfill() {
    trades = []; sizes = [];
    const since = Date.now() - cfg.hours * 3600e3;
    if (src !== 'bitget') {
      try {
        // หา id แรกของช่วงเวลา แล้วไล่ทีละ 1000 ไม้ (aggTrades = รวมไม้ taker เดียวกันที่ราคาเดียวกันแล้ว)
        const first = await fetchJ(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${SYM}&startTime=${since}&endTime=${since + 60e3}&limit=1`);
        let from = first.length ? first[0].a : null, calls = 0;
        if (from === null) throw new Error('no start');
        while (calls < 120) {
          const a = await fetchJ(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${SYM}&fromId=${from}&limit=1000`); calls++;
          if (!a.length) break;
          a.forEach(x => addTrade(x.T, +x.p, +x.q, x.m ? -1 : 1));
          from = a[a.length - 1].a + 1;
          if (a.length < 1000 || a[a.length - 1].T > Date.now() - 2000) break;
          if (calls % 6 === 0) { status = `กำลังโหลดย้อนหลัง… ${Math.round((a[a.length - 1].T - since) / (Date.now() - since) * 100)}%`; paintInfo(); O.markDirty(); }
        }
        return;
      } catch (e) { src = 'bitget'; await loadKlines(); }
    }
    // Bitget: ไล่ย้อนจากล่าสุดทีละ 1000 (ไม้ย่อยเวลาเดียวกัน ฝั่งเดียวกัน = ออเดอร์เดียว → รวมกัน)
    let idLess = null, calls = 0; const raw = [];
    while (calls < 40) {
      const j = await fetchJ(`https://api.bitget.com/api/v2/mix/market/fills-history?symbol=${SYM}&productType=usdt-futures&limit=1000${idLess ? '&idLessThan=' + idLess : ''}`); calls++;
      const d = j.data || []; if (!d.length) break;
      d.forEach(x => raw.push([+x.ts, +x.price, +x.size, /buy/i.test(x.side) ? 1 : -1]));
      idLess = d[d.length - 1].tradeId;
      if (+d[d.length - 1].ts < since) break;
    }
    raw.sort((a, b) => a[0] - b[0]);
    let g = null;
    raw.filter(x => x[0] >= since).forEach(x => { if (g && g.t === x[0] && g.s === x[3]) { g.pq += x[1] * x[2]; g.q += x[2]; } else { if (g) addTrade(g.t, g.pq / g.q, g.q, g.s); g = { t: x[0], s: x[3], q: x[2], pq: x[1] * x[2] }; } });
    if (g) addTrade(g.t, g.pq / g.q, g.q, g.s);
  }

  // ---------- สด ----------
  function openWS() {
    closeWS();
    try {
      if (src === 'binance') {
        ws = new WebSocket(`wss://fstream.binance.com/ws/${SYM.toLowerCase()}@aggTrade`);
        ws.onmessage = e => { const x = JSON.parse(e.data); if (x.e === 'aggTrade') { addTrade(x.T, +x.p, +x.q, x.m ? -1 : 1); live(x.T); } };
      } else {
        ws = new WebSocket('wss://ws.bitget.com/v2/ws/public');
        ws.onopen = () => { ws.send(JSON.stringify({ op: 'subscribe', args: [{ instType: 'USDT-FUTURES', channel: 'trade', instId: SYM }] })); wsTimer = setInterval(() => { try { ws.send('ping'); } catch (e) {} }, 25000); };
        ws.onmessage = e => { if (e.data === 'pong') return; const m = JSON.parse(e.data); (m.data || []).forEach(x => { addTrade(+x.ts, +x.price, +x.size, /buy/i.test(x.side) ? 1 : -1); live(+x.ts); }); };
      }
      ws.onclose = () => { if (cfg.on) setTimeout(() => { if (cfg.on && (!ws || ws.readyState > 1)) openWS(); }, 5000); };
    } catch (e) {}
  }
  function closeWS() { clearInterval(wsTimer); if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; } }
  let lastLive = 0, lastAlert = 0;
  function live(t) {
    // ไม้ใหม่ใหญ่มาก (≥ 3 เท่าเกณฑ์) → แจ้งในแอป
    const x = trades[trades.length - 1];
    if (x && x.t === t && x.q >= thr() * 3 && Date.now() - lastAlert > 20000) { lastAlert = Date.now(); O.showToast && O.showToast(`🐋 ไม้ใหญ่ ${x.s > 0 ? '<b style="color:#2fe3a6">ไล่ซื้อ</b>' : '<b style="color:#ff6b82">ไล่ขาย</b>'} ${x.q.toFixed(2)} oz @ ${(x.p - offAt(barOf(x.t))).toFixed(2)}`, 6000); }
    if (Date.now() - lastLive > 500) { lastLive = Date.now(); O.markDirty(); }
  }
  // ตัดไม้เล็ก/เก่าทิ้งเป็นระยะ ไม่ให้หน่วยความจำโต
  setInterval(() => { if (!cfg.on) return; const T = thr() * 0.5, since = Date.now() - (cfg.hours + 6) * 3600e3; trades = trades.filter(x => x.q >= T && x.t >= since); }, 60000);

  async function reload() {
    if (busy || !cfg.on) return; busy = true; curTf = O.tf;
    status = 'กำลังโหลด…'; paintInfo();
    try { await loadKlines(); await backfill(); openWS(); status = ''; } catch (e) { status = 'โหลดไม่ได้: ' + (e.message || e); }
    busy = false; paintInfo(); O.markDirty();
  }
  // Delta/ราคาอ้างอิงอัปเดตทุก 30 วินาที · เปลี่ยน TF → โหลด klines ใหม่ (ไม้ใหญ่ใช้ชุดเดิม)
  setInterval(async () => {
    if (!cfg.on || busy) return;
    if (curTf !== O.tf) { curTf = O.tf; await loadKlines(); O.markDirty(); paintInfo(); return; }
    if (src === 'binance') { await loadKlines(); O.markDirty(); paintInfo(); }
  }, 3000 * 10);
  setInterval(() => { if (cfg.on && curTf !== O.tf && !busy) { curTf = O.tf; loadKlines().then(() => { O.markDirty(); paintInfo(); }); } }, 1500);

  // ---------- วาด ----------
  O.hooks.push((ctx, w, h) => {
    if (!cfg.on) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width(), plotH = h - ts.height();
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    const sp = ts.options().barSpacing || 6, T = thr();
    ctx.save();
    // 1) ไม้ใหญ่: รวมไม้ในแท่งเดียวกัน ฝั่งเดียวกัน ราคาใกล้กัน (±0.3)
    const agg = new Map();
    trades.forEach(x => { if (x.q < T) return; const bt = barOf(x.t), p = x.p - offAt(bt), k = bt + '|' + x.s + '|' + Math.round(p / 0.3); const a = agg.get(k); if (a) { a.pq += p * x.q; a.q += x.q; a.n++; } else agg.set(k, { bt, s: x.s, q: x.q, pq: p * x.q, n: 1 }); });
    const list = [...agg.values()].sort((a, b) => a.q - b.q);
    list.forEach(a => {
      const x = ts.timeToCoordinate(a.bt); if (x === null || x < 0 || x > plotW) return;
      const p = a.pq / a.q, y = sr.priceToCoordinate(p); if (y === null || y < 0 || y > plotH) return;
      const r = Math.max(3, Math.min(Math.max(10, sp * 1.4), 3 + 5 * Math.sqrt(a.q / T)));
      ctx.globalAlpha = 0.32; ctx.fillStyle = a.s > 0 ? '#22e39a' : '#ff4d6a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.lineWidth = 1.5; ctx.strokeStyle = a.s > 0 ? '#22e39a' : '#ff4d6a'; ctx.stroke();
      if (a.q >= T * 3 && sp >= 5) { ctx.font = `bold 9px ${mono}`; ctx.fillStyle = a.s > 0 ? '#9ff5cf' : '#ffb3bf'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${a.s > 0 ? 'B' : 'S'}${a.q >= 100 ? Math.round(a.q) : a.q.toFixed(1)}`, x + r + 2, y); }
    });
    // 2) Delta ต่อแท่ง: แถบล่างของกราฟ (ตัวเลขเมื่อแท่งกว้างพอ ไม่งั้นเป็นแท่งสี)
    if (cfg.delta && delta.size) {
      const B = O.series.data() || [], lr = ts.getVisibleLogicalRange(); if (lr) {
        const i0 = Math.max(0, Math.floor(lr.from)), i1 = Math.min(B.length - 1, Math.ceil(lr.to));
        let mx = 1; for (let i = i0; i <= i1; i++) { const d = delta.get(B[i].time); if (d) mx = Math.max(mx, Math.abs(d.b - d.s)); }
        const base = plotH - 4, H = 16;
        for (let i = i0; i <= i1; i++) {
          const b = B[i], d = delta.get(b.time); if (!d) continue;
          const x = ts.timeToCoordinate(b.time); if (x === null) continue;
          const v = d.b - d.s, col = v >= 0 ? '#22e39a' : '#ff4d6a';
          if (sp >= 26) { ctx.globalAlpha = 0.95; ctx.font = `bold 9px ${mono}`; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText((v > 0 ? '+' : '') + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)), x, base); }
          else { const hh = Math.max(1, Math.abs(v) / mx * H); ctx.globalAlpha = 0.75; ctx.fillStyle = col; ctx.fillRect(x - Math.max(1, sp * 0.35), v >= 0 ? base - hh : base - H, Math.max(2, sp * 0.7), v >= 0 ? hh : Math.max(1, hh)); }
        }
        ctx.globalAlpha = 0.6; ctx.font = `9px ${mono}`; ctx.fillStyle = '#8a93ad'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('Δ ซื้อ−ขาย', 4, base - (sp >= 26 ? 10 : H + 1));
      }
    }
    ctx.restore();
  });

  // ---------- เมนู ƒx ----------
  function paintInfo() {
    const el = $('btInfo'); if (!el) return;
    if (!cfg.on) { el.textContent = ''; return; }
    const T = thr(), since = Date.now() - cfg.hours * 3600e3, n = trades.filter(x => x.q >= T && x.t >= since), nb = n.filter(x => x.s > 0).length;
    const B = O.series.data() || [], lt = B.length ? delta.get(B[B.length - 1].time) : null;
    el.textContent = status || `${src === 'bitget' ? 'Bitget' : 'Binance'} · ไม้ใหญ่ ≥ ${T} oz${cfg.auto ? ' (อัตโนมัติ)' : ''} · ${cfg.hours} ชม.: ซื้อ ${nb} / ขาย ${n.length - nb}` + (lt ? ` · Δ แท่งนี้ ${(lt.b - lt.s) >= 0 ? '+' : ''}${(lt.b - lt.s).toFixed(1)}` : '');
  }
  setInterval(paintInfo, 5000);
  function section() {
    const d = document.createElement('div');
    d.id = 'btBox'; d.className = 'gsbox';
    d.innerHTML = `<div class="row"><button class="gsb${cfg.on ? ' on' : ''}" data-btt="on"><i style="background:linear-gradient(90deg,#22e39a 50%,#ff4d6a 50%)"></i>🐋 Big Traders (ไม้ใหญ่ + Delta)</button><span id="btInfo" class="gsinfo"></span></div>` +
      (cfg.on ? `<div class="row ps"><button class="gsb${cfg.delta ? ' on' : ''}" data-btt="delta">Δ ซื้อ−ขาย ต่อแท่ง</button><button class="gsb${cfg.auto ? ' on' : ''}" data-btt="auto">เกณฑ์อัตโนมัติ</button>
        <label>ไม้ใหญ่ ≥ (oz)<input type="number" inputmode="decimal" step="0.5" data-bt="thr" value="${cfg.thr}" ${cfg.auto ? 'disabled' : ''}></label>
        <label>ย้อนหลัง (ชม.)<input type="number" inputmode="numeric" data-bt="hours" value="${cfg.hours}"></label></div>` : '');
    return d;
  }
  function mount() { const m = $('indMenu'); if (!m || m.hidden || $('btBox')) return; const box = section(), anchor = $('ivBox') || m.querySelector('.t'); anchor ? anchor.after(box) : m.prepend(box); paintInfo(); }
  function remount() { const b = $('btBox'); if (b) b.remove(); mount(); }
  const menu = $('indMenu');
  if (menu) {
    new MutationObserver(() => mount()).observe(menu, { childList: true });
    menu.addEventListener('click', e => {
      const t = e.target.closest('[data-btt]'); if (!t) return;
      const k = t.dataset.btt; cfg[k] = !cfg[k]; save();
      if (k === 'on') { if (cfg.on) reload(); else { closeWS(); trades = []; delta = new Map(); O.markDirty(); } }
      O.markDirty(); remount();
      if (cfg.on) $('indBtn').classList.add('has');
    });
    menu.addEventListener('change', e => {
      const inp = e.target.closest('[data-bt]'); if (!inp) return;
      let v = parseFloat(inp.value);
      if (inp.dataset.bt === 'hours') { v = Math.max(1, Math.min(12, Math.round(v || 3))); cfg.hours = v; save(); reload(); }
      else { v = Math.max(0.1, v || 5); cfg.thr = v; save(); }
      inp.value = v; O.markDirty(); paintInfo();
    });
  }
  if (cfg.on) setTimeout(reload, 3500);
  window.OI_bigtr = { get cfg() { return cfg; }, get trades() { return trades; }, get delta() { return delta; }, get src() { return src; }, thr, reload };
})();
