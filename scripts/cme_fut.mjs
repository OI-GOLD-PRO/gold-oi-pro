// OI รวมฟิวเจอร์สทอง (GC, COMEX) รายวันจากเว็บ CME → gc_oi.json (สะสม ไม่ลบของเก่า)
// { updated, days: [[YYYY-MM-DD, OI รวม, เปลี่ยนจากวันก่อน, volume รวม, 'P'|'F']] }  P = ตัวเลขเบื้องต้น (เย็นวันเทรด) · F = ตัวเลขจริง (วันถัดไป)
// ใช้ตรวจ OI Divergence (หนังสือ The Invisible Money หน้า 165): ราคาทำ High/Low ใหม่ + OI ลด = หนีตาย (กลับตัว) · + OI เพิ่ม = เงินใหม่เข้าจริง (ห้ามสวน)
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'gc_oi.json';
const old = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { days: [] }; } })();
const STRATS = [{ headless: false, args: [] }, { headless: false, args: ['--disable-http2'] }, { headless: true, args: [] }];
let res = null, log = [];
for (const st of STRATS) {
  if (st.headless === false && !process.env.DISPLAY) continue;
  let b;
  try {
    b = await chromium.launch({ channel: 'chrome', headless: st.headless, args: ['--disable-blink-features=AutomationControlled', ...st.args] });
    const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const p = await ctx.newPage();
    await p.goto('https://www.cmegroup.com/markets/metals/precious/gold.volume.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(6000);
    res = await p.evaluate(async () => {
      const j = async u => { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'isProtected&_t=' + Date.now()); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
      const n = s => +String(s).replace(/,/g, '') || 0;
      const out = [], lt = await j('/CmeWS/mvc/Volume/LastTotals/437?days=30').catch(e => ({ err: e.message }));
      const tds = await j('/CmeWS/mvc/Volume/TradeDates?exchange=CMX');
      for (const t of tds) {
        try {
          const rt = /PRELIM/i.test(t.reportType) ? 'P' : 'F';
          const d = await j(`/CmeWS/mvc/Volume/Details/F/437/${t.tradeDate}/${rt}?tradeDate=${t.tradeDate}&pageSize=500`);
          const tt = d.totals || {};
          if (n(tt.atClose) > 0) out.push([`${t.tradeDate.slice(0, 4)}-${t.tradeDate.slice(4, 6)}-${t.tradeDate.slice(6, 8)}`, n(tt.atClose), n(tt.change), n(tt.totalVolume), rt]);
        } catch (e) {}
      }
      return { out, lt };
    });
    if (res && res.out.length) break;
  } catch (e) { log.push(e.message.split('\n')[0]); }
  finally { try { b && await b.close(); } catch (e) {} }
}
console.log('LastTotals sample', JSON.stringify(res && res.lt).slice(0, 1200));
if (!res || !res.out.length) { console.log('no data', log.join(' | ')); process.exit(0); }
const m = new Map((old.days || []).map(r => [r[0], r]));
// LastTotals (ถ้ามี) = ย้อนหลัง 30 วัน ใช้เติมวันที่ยังไม่มี
const lt = res.lt;
const ltRows = Array.isArray(lt) ? lt : lt && Array.isArray(lt.items) ? lt.items : [];
ltRows.forEach(x => { const td = String(x.tradeDate || x.date || ''), oi = +String(x.openInterest || x.atClose || x.oi || '').replace(/,/g, ''); if (/^\d{8}$/.test(td) && oi > 0) { const k = `${td.slice(0, 4)}-${td.slice(4, 6)}-${td.slice(6, 8)}`; if (!m.has(k)) m.set(k, [k, oi, null, +String(x.totalVolume || x.volume || '').replace(/,/g, '') || null, 'F']); } });
res.out.forEach(r => { const o = m.get(r[0]); if (!o || o[4] !== 'F' || r[4] === 'F') m.set(r[0], r); });
const days = [...m.values()].sort((a, b) => a[0].localeCompare(b[0])).slice(-400);
for (let i = 1; i < days.length; i++) if (days[i][2] === null) days[i][2] = days[i][1] - days[i - 1][1];
fs.writeFileSync(OUT, JSON.stringify({ updated: Math.floor(Date.now() / 1000), days }));
console.log('gc_oi days', days.length, JSON.stringify(days.slice(-6)));
