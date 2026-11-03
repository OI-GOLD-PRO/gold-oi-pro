// ชั่วคราว: ลองอ่าน Myfxbook Community Outlook (XAUUSD)
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const p = await ctx.newPage();
const r = await p.goto('https://www.myfxbook.com/community/outlook', { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(8000);
console.log('STATUS', r && r.status(), await p.title());
const h = await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === 'XAUUSD'); return els.slice(0, 2).map(e => { let a = e; for (let k = 0; k < 4 && a.parentElement; k++) a = a.parentElement; return a.outerHTML.slice(0, 3500); }); });
console.log('ROW', JSON.stringify(h));
await b.close(); process.exit(0);
