// ชั่วคราว: ลองอ่าน Myfxbook Community Outlook (XAUUSD)
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const p = await ctx.newPage();
for (const u of ['https://www.myfxbook.com/community/outlook/XAUUSD', 'https://www.myfxbook.com/community/outlook']) {
  try {
    const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(8000);
    const t = await p.evaluate(() => document.body.innerText);
    const i = t.indexOf('XAUUSD');
    console.log('PAGE', r && r.status(), u, 'title=', await p.title(), 'len', t.length);
    console.log('TXT', JSON.stringify(t.slice(Math.max(0, i - 200), i + 1500)));
  } catch (e) { console.log('ERR', u, e.message); }
}
await b.close(); process.exit(0);
