const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const code = fs.readFileSync(__dirname + '/../volume-profile.js', 'utf8');
const now = Math.floor(Date.now() / 60000) * 60000 + 30000;
const values = new Map(), events = {}, chartEvents = {}, timers = [], hooks = [], boxes = new Map();
const menu = { hidden: false, addEventListener(k, f) { events[k] = f; }, querySelector() { return null; }, prepend(d) { boxes.set(d.id, d); } };
let src = 'binance', width = 320, sync = 0;
const feed = { get src() { return src; }, anchorMs: () => ({ end: now }), offAt: () => 10, pxOff: new Map([[1, 10]]), busy: false, status: '', syncCollection() { sync++; } };
function runtime() {
  const O = { sym: 'gold', hooks, bgHooks: hooks, chart: { timeScale: () => ({ width: () => width, height: () => 20 }) },
    series: { data: () => [{ time: 1 }], priceToCoordinate: p => (4010 - p) * 10 },
    chartEl: { addEventListener(k, f) { chartEvents[k] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0 }) }, markDirty() {}, showToast() {} };
  const document = { visibilityState: 'visible', getElementById: id => id === 'indMenu' ? menu : boxes.get(id), addEventListener() {}, createElement() { return { remove() { boxes.delete(this.id); } }; } };
  const window = { OI: O, OI_bigtr: feed };
  const context = vm.createContext({ window, document, localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }, MutationObserver: class { observe() {} }, Date: class extends Date { static now() { return now; } }, setInterval: f => timers.push(f), setTimeout: f => f(), console });
  vm.runInContext(code, context); return window;
}
let w = runtime(), v = w.OI_volumeProfile; v.cfg.on = true;
const put = (id, p, q, side, t = now - 1000, s = 'binance') => w.OIVolumeSink(s, id, t, p, q, side);
put('100', 4000, 0.01, 1); put('102', 4000, 100, -1); put('101', 4000, 2, 1); put('101', 4000, 2, 1); // bridge ids and duplicate
put('103', 4001, 20, 1); put('104', 3990, 200, 1, now - 9 * 3600000); // out of window
put('105', 4000, -1, 1); put(undefined, 4000, 10, 1); // invalid
put('12345678901234567890', 4000, 999, 1, now - 1000, 'bitget'); // isolated venue, exact large id
let p = v.profile(); assert.equal(p.rows.length, 2); assert.equal(p.total, 122.01); assert.equal(p.poc.p, 4000);
assert.equal(p.poc.buy, 2.01); assert.equal(p.poc.sell, 100); assert.equal(p.poc.delta, -97.99);
v.cfg.res = 2; assert.equal(v.profile().rows.length, 2); // stable price rounding boundaries
v.cfg.win = 24; assert.equal(v.profile().total, 322.01);
src = 'bitget'; assert.equal(v.profile().total, 999); src = 'binance';
v.save(); w = runtime(); v = w.OI_volumeProfile; v.cfg.on = true;
put('101', 4000, 2, 1); assert.equal(v.profile().total, 122.01); // restore prevents replay counting
v.cfg.on = false; put('106', 4000, 10, 1); v.cfg.on = true; assert.equal(v.profile().total, 122.01);
// Render actual hook at iPhone and desktop widths; verify fills stay in price plot.
let fills = [], lines = [], texts = [];
const ctx = new Proxy({ fillRect: (...a) => fills.push(a), moveTo: (...a) => lines.push(a), lineTo: (...a) => lines.push(a), fillText: (...a) => texts.push(a) }, { get(o, k) { return k in o ? o[k] : () => {}; }, set(o, k, x) { o[k] = x; return true; } });
for (const size of [320, 390, 1440]) { width = size; fills = []; lines = []; hooks.at(-1)(ctx, width, 500); assert(fills.length >= 4); assert(fills.every(([x,y,b,h]) => x >= 0 && x + b <= width + 1e-6 && y >= 0 && h > 0)); assert(lines.some(([x]) => x === width)); }
v.cfg.mode = 'delta'; fills = []; hooks.at(-1)(ctx, width, 500); assert.equal(fills.length, 2);
events.click({ target: { closest: () => ({ dataset: { vp: 'on' } }) } }); assert.equal(v.cfg.on, false); assert.equal(sync, 1);
events.click({ target: { closest: () => ({ dataset: { vp: 'on' } }) } }); assert.equal(v.cfg.on, true); assert.equal(sync, 2);
function change(key, value) {
  const input = { dataset: { vpin: key }, value };
  events.change({ target: { closest: () => input } }); return input.value;
}
assert.equal(change('res', '3'), 3); assert.equal(v.cfg.res, 3);
assert.equal(v.profile().total, 122.01); assert.equal(v.profile().rows[0].p, 3999);
const syncBefore = sync; change('win', '2.3'); assert.equal(v.cfg.win, 2.3); assert.equal(sync, syncBefore);
change('win', '9.5'); assert.equal(sync, syncBefore + 1); assert.equal(v.profile().total, 322.01);
change('res', '7'); change('win', '2.3');
w = runtime(); v = w.OI_volumeProfile; assert.equal(v.cfg.res, 7); assert.equal(v.cfg.win, 2.3);
assert.equal(change('res', ''), 7); assert.equal(change('win', 'NaN'), 2.3);
assert.equal(change('res', '-2'), 7); assert.equal(change('win', 'Infinity'), 2.3);
assert.equal(change('res', '5000'), 1000); assert.equal(change('win', '99'), 24);
assert.equal(change('res', '0.2'), 0.2); assert.equal(change('win', '0.01'), 0.1);
assert.equal(change('res', '2.8'), 2.8); assert.equal(change('win', '2.34'), 2.3);
v.cfg.on = false; const pausedSync = sync; change('win', '10.5'); assert.equal(sync, pausedSync);
v.cfg.on = true; change('win', '2.3'); change('res', '0.1');
put('200', 4000.11, 3, 1); put('201', 4000.22, 4, -1); put('202', 4000.34, 5, 1);
p = v.profile();
assert.equal(p.rows.find(r => r.p === 4000.1).buy, 3);
assert.equal(p.rows.find(r => r.p === 4000.2).sell, 4);
assert.equal(p.rows.find(r => r.p === 4000.3).buy, 5);
assert.equal(p.total, 134.01);
change('res', '0.2'); assert.equal(v.profile().rows.find(r => r.p === 4000.2).total, 7);
assert.equal(v.profile().total, 134.01);
change('res', '0.3'); assert.equal(v.profile().total, 134.01);
assert(v.profile().rows.every(r => Math.abs(r.p * 10 - Math.round(r.p * 10)) < 1e-8));
change('res', '0.1'); v.save(); w = runtime(); v = w.OI_volumeProfile;
assert.equal(v.cfg.res, 0.1); put('201', 4000.22, 4, -1); assert.equal(v.profile().total, 134.01);
const legacy = JSON.parse(values.get('oi_vprofile_data_v1')); legacy.v = 1;
values.set('oi_vprofile_data_v1', JSON.stringify(legacy));
w = runtime(); v = w.OI_volumeProfile; assert.equal(v.profile().total, 0);
put('100', 4000.12, 2, 1); assert.equal(v.profile().total, 2);
assert.equal(v.profile().rows[0].p, 4000.1);
console.log('PASS: true $0.1 rows, decimal grouping/volume conservation, fine cache restore/dedup, coarse cache rejected and raw history rebuild;');
console.log('PASS: custom row/window values, persistence, aggregation, reload on window expansion, invalid/bounds normalization;');
console.log('PASS: all sizes/actual quantity, sides/delta/POC, time windows, venue isolation, large IDs, overlap dedup, persistence, toggle collection, render at 320/390/1440px.');

v.cfg.on = true; change('res', '0.1'); change('win', '2.3');
put('9001', 4200, 1e9, 1); // dominant volume far above mobile price viewport
put('9002', 4000.21, 0.001, -1);
for (const size of [320, 390, 430]) {
  width = size; fills = []; hooks.at(-1)(ctx, width, 500);
  assert(fills.some(([x,y,b,h]) => b >= width * 0.3), 'Visible bars must not vanish because of offscreen volume');
  assert(fills.some(([x,y,b,h]) => b >= 1 && h >= 1), 'Fine rows remain at least one CSS pixel');
  assert(fills.every(([x,y,b,h]) => x >= 0 && x + b <= width + 1e-6 && Number.isInteger(y)));
}
console.log('PASS: $0.1 mobile rows at 320/390/430px survive huge offscreen volume and subpixel scaling.');
