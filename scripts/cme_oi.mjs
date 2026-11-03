// ดึง OI ราย strike ของสัญญาออปชันทอง "สัญญาวันนี้" จากเว็บ CME (เปิดหน้าเว็บด้วยเบราว์เซอร์จริง แล้วเรียก API ของหน้าเว็บ)
// สัญญาวันนี้ = ตามที่ Worker เลือก (/opt → root, exp) · แปลงเป็นสินค้า CME จากวันหมดอายุ:
//   OG (รายเดือน) → American Options เดือนถัดจากเดือนหมดอายุ · รายสัปดาห์ → กลุ่ม Weekly <วัน> "Week N - MON YYYY" (N = วันนั้นครั้งที่ N ของเดือน)
// ผล: cme_oi.json { root, exp, tradeDate, productId, expirationCode, fetchedAt, totals, rows: [[strike, 'C'|'P', oi]] }
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] || 'cme_oi.json';
const STATUS = 'cme_oi_status.json';
const status = (o) => fs.writeFileSync(STATUS, JSON.stringify(Object.assign({ at: new Date().toISOString() }, o)));
const W = 'https://gc-yahoo.oigoldpro.workers.dev/opt';
const PAGE = 'https://www.cmegroup.com/markets/metals/precious/gold.volume.options.html';
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYG = { 1: 'Weekly Monday Option', 2: 'Weekly Tuesday Option', 3: 'Weekly Wednesday Option', 4: 'Weekly Thursday Option', 5: 'Weekly Friday Option' };

let opt = {}, optTxt = '';
try { const r = await fetch(W + '?t=' + Date.now(), { headers: { 'user-agent': 'Mozilla/5.0 oi-gold-pro-actions' } }); optTxt = await r.text(); opt = JSON.parse(optTxt); } catch (e) { optTxt = 'ERR ' + e.message + ' ' + optTxt.slice(0, 200); }
const root = opt.root, exp = +opt.exp;
if (!root || !exp) { console.log('no contract from worker', optTxt.slice(0, 300)); status({ ok: false, step: 'worker', body: optTxt.slice(0, 300) }); process.exit(0); }
const y = Math.floor(exp / 10000), m = Math.floor(exp / 100) % 100, d = exp % 100;
const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const monthly = root === 'OG';
let wantGroup, wantLabel;
if (monthly) { const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y; wantGroup = 'American Options'; wantLabel = `${MON[nm - 1]} ${ny}`; }
else { wantGroup = DAYG[wd]; wantLabel = `Week ${Math.ceil(d / 7)} - ${MON[m - 1]} ${y}`; }
console.log('contract', root, exp, '→', wantGroup, '/', wantLabel);

// วันเทรดที่จะลอง: วันนี้ย้อนหลัง 6 วัน (ตามเวลาชิคาโก) ข้ามเสาร์-อาทิตย์
const chi = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
const dates = [];
for (let i = 0; dates.length < 5 && i < 10; i++) {
  const t = new Date(chi); t.setDate(t.getDate() - i);
  if (t.getDay() === 0 || t.getDay() === 6) continue;
  dates.push(`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`);
}

const FETCHER = async ({ dates, wantGroup, wantLabel, root }) => {
    const j = async u => { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'isProtected&_t=' + Date.now()); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); };
    const n = s => +String(s).replace(/,/g, '') || 0;
    const log = [];
    for (const td of dates) {
      let groups;
      try { groups = await j(`/CmeWS/mvc/Volume/Options/Expirations?productid=437&tradedate=${td}`); } catch (e) { log.push(td + ' exp ' + e.message); continue; }
      const g = (groups || []).find(x => x.label === wantGroup);
      const exps = g ? [].concat(g.expirations || [], g.weekly || [], g.daily || [], g.sto || []) : []; // V4.5.10: รูปแบบใหม่ของ CME แยก weekly/daily/sto
      let e = exps.find(x => x && x.label === wantLabel);
      // บางวัน CME ส่งกลุ่มแบบไม่มีรายการ expiration (มีแค่ productIds = สัปดาห์ 1–5) → สร้างเอง: pid ของสัปดาห์ N + รหัสเดือน (เช่น X26)
      if (!e && g && Array.isArray(g.productIds)) {
        const mw = /Week (\d) - ([A-Z]{3}) (\d{4})/.exec(wantLabel), MC = { JAN: 'F', FEB: 'G', MAR: 'H', APR: 'J', MAY: 'K', JUN: 'M', JUL: 'N', AUG: 'Q', SEP: 'U', OCT: 'V', NOV: 'X', DEC: 'Z' };
        if (mw && g.productIds[+mw[1] - 1]) e = { label: wantLabel, productId: +g.productIds[+mw[1] - 1], expirationCode: MC[mw[2]] + mw[3].slice(2), built: true };
      } // กลุ่มบางวัน (ตัวเลขเบื้องต้น) ไม่มี expirations → ลองวันถัดไป
      if (!e) { log.push(td + ' no ' + wantGroup + '/' + wantLabel + (g ? ' g=' + JSON.stringify(g).slice(0, 700) : ' groups=' + (Array.isArray(groups) ? groups.map(x => x.label).join('|') : typeof groups))); continue; }
      const det = await j(`/CmeWS/mvc/Volume/Options/Details?productid=${e.productId}&tradedate=${td}&expirationcode=${e.expirationCode}&reporttype=P`);
      const rows = [], totals = { C: 0, P: 0 };
      (det.monthData || []).forEach(md => {
        const t = /Call/i.test(md.monthID) ? 'C' : 'P';
        totals[t] = n(md.totalData && md.totalData.atClose);
        (md.strikeData || []).forEach(s => { const v = n(s.atClose); if (v > 0) rows.push([+s.strike, t, v]); });
      });
      if (!rows.length) { log.push(td + ' empty'); continue; }
      // ราคา settlement ราย strike (ไว้คำนวณ IV เองตอนตลาดปิด) · contractId เช่น G1MX26, optionExpiration เช่น 10143-X6
      let settle = null;
      try {
        const code = e.expirationCode, ex = code[0] + code.slice(-1), mdY = td.slice(4, 6) + '/' + td.slice(6, 8) + '/' + td.slice(0, 4);
        const sj = await j(`/CmeWS/mvc/Settlements/Options/Settlements/${e.productId}/OOF?strategy=DEFAULT&optionProductId=${e.productId}&monthYear=${root}${code}&optionExpiration=${e.productId}-${ex}&tradeDate=${mdY}&pageSize=500`);
        const sr = (sj.settlements || []).map(x => [+x.strike, /^c/i.test(x.type) ? 'C' : 'P', +String(x.settle).replace(/[^0-9.]/g, '')]).filter(x => x[0] > 0 && x[2] > 0);
        if (sr.length) settle = { tradeDate: String(sj.tradeDate || mdY), reportType: sj.reportType || '', rows: sr };
        else log.push(td + ' settle empty');
      } catch (er) { log.push(td + ' settle ' + er.message); }
      return { tradeDate: td, productId: e.productId, expirationCode: e.expirationCode, totals, rows, settle, log };
    }
    return { error: 'not found', log };
};

// CME มีระบบกันบอต (Akamai) → ลองหลายแบบจนกว่าจะผ่าน (headful ต้องรันใต้ xvfb)
const STRATS = [
  { name: 'chrome-headful', channel: 'chrome', headless: false, args: [] },
  { name: 'chrome-headful-nohttp2', channel: 'chrome', headless: false, args: ['--disable-http2'] },
  { name: 'chrome-headless', channel: 'chrome', headless: true, args: [] },
  { name: 'chromium-nohttp2', channel: undefined, headless: true, args: ['--disable-http2'] },
];
let result = null, err = null; const tries = [];
for (const st of STRATS) {
  if (st.headless === false && !process.env.DISPLAY) { tries.push(st.name + ': no display'); continue; }
  let browser;
  try {
    browser = await chromium.launch({ channel: st.channel, headless: st.headless, args: ['--disable-blink-features=AutomationControlled', ...st.args] });
    const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const page = await ctx.newPage();
    const resp = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    globalThis.__pageStatus = resp && resp.status(); globalThis.__title = await page.title().catch(() => '');
    await page.waitForTimeout(6000);
    result = await page.evaluate(FETCHER, { dates, wantGroup, wantLabel, root });
    tries.push(st.name + ': ' + (result && !result.error ? 'ok' : 'page ' + globalThis.__pageStatus + ' ' + JSON.stringify(result).slice(0, 200)));
  } catch (e) { tries.push(st.name + ': ' + e.message.split('\n')[0]); result = null; }
  try { if (browser) await browser.close(); } catch (e) {}
  if (result && !result.error) break;
}
err = tries.join(' | ');
console.log(err);

if (!result || result.error) { console.log('FAILED', err || JSON.stringify(result)); status({ ok: false, root, exp, want: wantGroup + ' / ' + wantLabel, page: globalThis.__pageStatus, title: globalThis.__title, err, result }); process.exit(0); }
const out = { root, exp, tradeDate: result.tradeDate, productId: result.productId, expirationCode: result.expirationCode, group: wantGroup, label: wantLabel, fetchedAt: Math.floor(Date.now() / 1000), totals: result.totals, settle: result.settle || null, rows: result.rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])) };
let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const same = prev && prev.root === out.root && prev.exp === out.exp && prev.tradeDate === out.tradeDate && JSON.stringify(prev.rows) === JSON.stringify(out.rows) && JSON.stringify(prev.settle) === JSON.stringify(out.settle);
console.log('OK', out.root, out.exp, 'trade', out.tradeDate, 'C', out.totals.C, 'P', out.totals.P, 'strikes', out.rows.length, same ? '(unchanged)' : '(new)');
if (!same) fs.writeFileSync(OUT, JSON.stringify(out));
status({ ok: true, root, exp, tradeDate: out.tradeDate, strikes: out.rows.length, settle: out.settle ? out.settle.rows.length : 0, log: result.log, page: globalThis.__pageStatus });
