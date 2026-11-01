// ป้าย IV: Implied Volatility ATM ของสัญญาวันนี้ (จากข้อมูลออปชันสด live.js · ช้า ~10 นาทีตาม TradingView)
// แสดง IV % + การเปลี่ยนแปลงใน 1 ชม. · แตะป้าย = อธิบายความหมายและวิธีใช้เทรด
// เก็บประวัติ IV ในเครื่องทุก 5 นาที (ต่อสัญญา) ไว้เทียบกับตอนเปิดวันเทรด
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.hooks || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const HKEY = 'oi_iv_hist';
  let hist = {}; // { "G1M20261102": [[ms, iv], ...] }
  try { hist = JSON.parse(localStorage.getItem(HKEY) || '{}') || {}; } catch (e) { hist = {}; }
  const saveH = () => { try { localStorage.setItem(HKEY, JSON.stringify(hist)); } catch (e) {} };

  // IV ATM = ค่าเฉลี่ย IV Call/Put ของ strike ที่ใกล้ราคาที่สุด (ถ่วงตามระยะของ 2 strike ที่คร่อมราคา)
  function atmIV(c) {
    if (!c || !c.strikes || !c.strikes.length) return null;
    const S = c.S0, pts = c.strikes.map(s => { const v = [s.ivC, s.ivP].filter(x => x > 0); return v.length ? [s.k, v.reduce((a, b) => a + b, 0) / v.length] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    if (!pts.length) return null;
    for (let i = 1; i < pts.length; i++) {
      const [k0, v0] = pts[i - 1], [k1, v1] = pts[i];
      if (k0 <= S && S <= k1) return k1 === k0 ? v0 : v0 + (v1 - v0) * (S - k0) / (k1 - k0);
    }
    return pts.reduce((b, p) => Math.abs(p[0] - S) < Math.abs(b[0] - S) ? p : b)[1];
  }
  const sessStart = () => { // วันเทรดเริ่ม 06:00 ไทย (ช่วงเวลาฤดูหนาวสหรัฐฯ) / 05:00 (ฤดูร้อน) → ใช้ 05:00 เผื่อทั้งสองแบบ
    const now = Date.now(), d = new Date(now + 7 * 3600e3); d.setUTCHours(5, 0, 0, 0);
    let t = d.getTime() - 7 * 3600e3; if (t > now) t -= 864e5; return t;
  };
  let R = null; // { iv, d1h, dOpen, key }
  function run() {
    const c = window.OILive && window.OILive.calc;
    if (!c || !c.match) { if (R) { R = null; O.markDirty(); } return; }
    const iv = atmIV(c); if (iv === null || !isFinite(iv)) return;
    const key = c.root + (c.expTs || ''), now = Date.now();
    const H = hist[key] = (hist[key] || []).filter(h => now - h[0] < 26 * 3600e3);
    if (!H.length || now - H[H.length - 1][0] >= 5 * 60e3) { H.push([now, +iv.toFixed(5)]); Object.keys(hist).forEach(k => { if (k !== key && !(hist[k] || []).some(h => now - h[0] < 26 * 3600e3)) delete hist[k]; }); saveH(); }
    const near = ms => { let b = null; H.forEach(h => { if (h[0] <= ms && (!b || h[0] > b[0])) b = h; }); return b; };
    const h1 = near(now - 3600e3), op = H.find(h => h[0] >= sessStart());
    const prev = R && R.iv;
    R = { iv, d1h: h1 && now - h1[0] < 2 * 3600e3 ? iv - h1[1] : null, dOpen: op && op !== H[H.length - 1] ? iv - op[1] : null, em: c.em, T: c.T, root: c.root };
    if (prev !== R.iv) O.markDirty();
  }
  setInterval(run, 15000);
  document.addEventListener('oilive', run);
  setTimeout(run, 5000);

  const pct = v => (v * 100).toFixed(1);
  const pts = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1);
  function badge() {
    if (!R) return null;
    const d = R.d1h, up = d !== null && d >= 0.005, dn = d !== null && d <= -0.005;
    return [`IV ${pct(R.iv)}%${d === null ? '' : up ? ` ▲${Math.abs(d * 100).toFixed(1)}` : dn ? ` ▼${Math.abs(d * 100).toFixed(1)}` : ' ·'}`, up ? '#ff8a3d' : dn ? '#22e39a' : '#c9b8ff', 'iv'];
  }
  (window.OIBadgeExtra = window.OIBadgeExtra || []).push(badge);

  function explain() {
    if (!R) { O.showToast && O.showToast('IV: รอข้อมูลออปชันสดของสัญญาวันนี้…', 5000); return; }
    const d = R.d1h, mood = d === null ? 'ยังไม่มีประวัติพอเทียบ (เก็บทุก 5 นาที)'
      : d >= 0.005 ? '<b style="color:#ff8a3d">IV กำลังขึ้น</b> → ตลาดเริ่มกลัว / รอข่าว ราคามีโอกาสวิ่งแรง เบรกโซนง่ายขึ้น ระวังสวนเทรนด์ ขยาย SL'
      : d <= -0.005 ? '<b style="color:#22e39a">IV กำลังลง</b> → ตลาดสงบ ราคามักแกว่งในกรอบ โซน OI มักเด้ง เหมาะเทรดกลับตัวที่ขอบโซน'
      : 'IV ทรงตัว → ใช้โซน OI ตามปกติ';
    const daily = R.iv / Math.sqrt(365), px = O.lastClose || 0;
    O.showToast && O.showToast(
      `<b style="color:#c9b8ff">IV ATM ${pct(R.iv)}%</b> (สัญญา ${R.root}, ต่อปี)<br>` +
      `เปลี่ยนใน 1 ชม.: ${d === null ? '–' : pts(d) + ' จุด'} · ตั้งแต่เปิดวัน: ${R.dOpen === null ? '–' : pts(R.dOpen) + ' จุด'}<br>` +
      `${mood}<br>` +
      `● ตลาดคาดว่าราคาแกว่งเฉลี่ยวันละ ~${(px * daily).toFixed(0)} จุด (1σ) · ถึงหมดอายุ ±${R.em ? R.em.toFixed(1) : '–'} (EM)<br>` +
      `● IV พุ่งก่อนข่าวแล้วร่วงหลังข่าว (IV crush) เป็นเรื่องปกติ<br>` +
      `● IV ขึ้นพร้อมราคาลง = กลัวจริง ขาลงมักยืด · IV ลงพร้อมราคาขึ้น = ขาขึ้นแบบสบายใจ<br>` +
      `<span style="opacity:.6">ข้อมูลออปชันช้า ~10 นาที (TradingView)</span>`, 22000);
  }
  // แตะได้ทั้งป้าย (ป้ายถูกวาดใหม่บ่อย → ใช้ pointerdown/up ตามตำแหน่งป้าย แบบเดียวกับ dealer.js)
  let down = null;
  const onBadge = e => { const el = e.target && (e.target.nodeType === 1 ? e.target : e.target.parentElement); return el && el.closest ? el.closest('#badges [data-k="iv"]') : null; };
  document.addEventListener('pointerdown', e => { down = onBadge(e) ? { x: e.clientX, y: e.clientY } : null; }, true);
  document.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10; down = null;
    const r = document.querySelector('#badges [data-k="iv"]')?.getBoundingClientRect();
    if (!moved && r && e.clientX >= r.left - 4 && e.clientX <= r.right + 4 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) explain();
  }, true);
  window.OI_iv = { get result() { return R; }, atmIV };
})();
