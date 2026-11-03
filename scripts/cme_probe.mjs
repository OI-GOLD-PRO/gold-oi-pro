// ชั่วคราว: ลองอ่าน Myfxbook Community Outlook (XAUUSD)
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const p = await ctx.newPage();
const r = await p.goto('https://www.myfxbook.com/community/outlook', { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(8000);
const h = await p.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(x => /^\s*XAUUSD\b/.test(x.innerText)); return tr ? tr.outerHTML : 'no row'; });
console.log('ROW', h.slice(0, 4000));
const pop = await p.evaluate(() => { const el = document.querySelector('[id*="XAUUSD"], [data-name="XAUUSD"]'); return el ? el.outerHTML.slice(0, 3000) : 'none'; });
console.log('POP', pop);
await b.close(); process.exit(0);
