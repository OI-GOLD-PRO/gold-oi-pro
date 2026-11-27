const PIVOT = 2;
const SWEEP_BARS = 8;
const RETEST_BARS = 12;

export function candles(rows, minimum) {
  if (!Array.isArray(rows) || rows.length < minimum || rows.length > 200) return null;
  let previous = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 5 || !row.every(Number.isFinite)) return null;
    const [time, open, high, low, close] = row;
    if (!Number.isSafeInteger(time) || time <= previous || low <= 0 ||
        high < Math.max(open, close) || low > Math.min(open, close)) return null;
    previous = time;
  }
  return rows;
}

function structure(rows, onBar) {
  const state = { since: null, side: null, high: null, low: null, event: null };
  for (let i = 2 * PIVOT; i < rows.length; i++) {
    const pivot = i - PIVOT;
    const window = rows.slice(pivot - PIVOT, i + 1);
    const row = rows[pivot];
    if (window.every((bar, index) => index === PIVOT || bar[2] < row[2]))
      state.high = { price: row[2], at: row[0], broken: false };
    if (window.every((bar, index) => index === PIVOT || bar[3] > row[3]))
      state.low = { price: row[3], at: row[0], broken: false };
    const bar = rows[i];
    const previous = state.side;
    let event = null;
    for (const [side, pivotLevel, sign] of [['BUY', state.high, 1], ['SELL', state.low, -1]]) {
      if (!pivotLevel || pivotLevel.broken || sign * (bar[4] - pivotLevel.price) <= 0) continue;
      pivotLevel.broken = true;
      if (state.side !== side) state.since = bar[0];
      state.side = side;
      event = { side, level: pivotLevel.price, pivotAt: pivotLevel.at, at: bar[0],
        kind: previous && previous !== side ? 'CHoCH' : 'BOS' };
      state.event = event;
    }
    onBar?.(i, state, event);
  }
  return state;
}

export function evaluateSMC(market) {
  const { m5, m15, h1, atr, ask, bid, point, min_rr: minRR, max_rr: maxRR } = market;
  const higher = structure(h1), middle = structure(m15);
  const side = higher.side && higher.side === middle.side ? higher.side : null;
  const context = {
    h1: higher.side, m15: middle.side, h1Event: higher.event, m15Event: middle.event,
    side, markers: [], zones: [], zone: null
  };
  const result = (reason, plan = null, next = null) => ({ ...context, reason, plan, next });
  const fmt = value => value.toFixed(2);
  const retainAfter = m5.at(Math.max(-m5.length, -60))[0];
  const mark = marker => {
    if (marker && marker.at >= retainAfter) context.markers.push(marker);
  };
  if (!side) {
    structure(m5, (_index, _state, event) => mark(event));
    return result('H1 และ M15 ยังไม่ยืนยันทิศทางเดียวกัน', null, {
      stage: 'bias', text: 'ให้แท่ง H1 และ M15 ปิดยืนยันโครงสร้างฝั่งเดียวกันก่อน'
    });
  }
  const buy = side === 'BUY';
  const extreme = bar => buy ? bar[3] : bar[2];
  const sign = buy ? 1 : -1;
  const biasChangedAt = Math.max(higher.since + 3600, middle.since + 900);
  let sweep = null, zone = null, ready = null;
  const lower = structure(m5, (i, state, event) => {
    mark(event);
    const bar = m5[i];
    if (bar[0] < biasChangedAt) return;
    const level = buy ? state.low : state.high;
    if (zone) {
      if (i - zone.index > RETEST_BARS || sign * (extreme(bar) - sweep.extreme) <= 0 ||
          sign * (bar[4] - (buy ? zone.low : zone.high)) < 0 ||
          (event && event.side !== side)) {
        zone.status = 'invalid';
        zone.endAt = bar[0];
        zone = null;
        sweep = null;
      } else if (i > zone.index && bar[3] <= zone.high && bar[2] >= zone.low &&
        sign * (bar[4] - (buy ? zone.high : zone.low)) > 0 && sign * (bar[4] - bar[1]) > 0) {
        mark({ kind: 'Retest', at: bar[0], pivotAt: zone.at, level: bar[4], side });
        zone.status = 'confirmed';
        zone.endAt = bar[0];
        if (i === m5.length - 1) ready = { ...zone };
        else {
          zone = null;
          sweep = null;
        }
        return;
      } else return;
    }
    if (sweep && (i - sweep.index > SWEEP_BARS || sign * (extreme(bar) - sweep.extreme) < 0))
      sweep = null;
    if (level && !level.broken && sign * (level.price - extreme(bar)) >= point &&
        sign * (bar[4] - level.price) > 0) {
      const breakLevel = buy ? state.high : state.low;
      if (breakLevel && !breakLevel.broken) {
        sweep = { index: i, at: bar[0], extreme: extreme(bar), level: level.price,
          pivotAt: level.at, breakLevel: breakLevel.price };
        mark({ kind: 'Sweep', at: sweep.at, pivotAt: sweep.pivotAt, level: sweep.level,
          extreme: sweep.extreme, side });
      }
    }
    if (!sweep || i <= sweep.index) return;
    if (event && event.side !== side) {
      sweep = null;
      return;
    }
    if (event?.side === side && sign * (bar[4] - sweep.breakLevel) > 0)
      sweep.break = { index: i, event };
    if (!sweep.break || i - sweep.break.index > 1) return;
    const low = buy ? m5[i - 2][2] : bar[2];
    const high = buy ? bar[3] : m5[i - 2][3];
    const displacement = m5[i - 1];
    const baseline = m5.slice(i - 11, i - 1);
    const averageRange = baseline.reduce((sum, row) => sum + row[2] - row[3], 0) / baseline.length;
    if (baseline.length < 10 || high - low < Math.max(point, 0.1 * averageRange) ||
        sign * (displacement[4] - displacement[1]) < 0.8 * averageRange) return;
    zone = { index: i, at: bar[0], low, high, event: sweep.break.event, side, status: 'active' };
    if (zone.at >= retainAfter) context.zones.push(zone);
  });
  if (zone) context.zone = zone;
  if (!sweep) {
    const swing = buy ? lower.low : lower.high;
    const available = swing && !swing.broken;
    return result('ยังไม่มี Liquidity Sweep ที่ผ่านเงื่อนไข', null, {
      stage: 'sweep', text: available
        ? 'ให้ M5 กวาด Swing ' + (buy ? 'ต่ำกว่า ' : 'สูงกว่า ') + fmt(swing.price) + ' แล้วปิดกลับอีกฝั่งของระดับเดิม'
        : 'รอ Swing ฝั่งตรงข้ามที่ยืนยันแล้ว ก่อนหาแท่ง M5 กวาดและปิดกลับ'
    });
  }
  if (!zone) return result('พบ Liquidity Sweep', null, {
    stage: 'structure', text: 'ให้ M5 ปิด' + (buy ? 'เหนือ ' : 'ใต้ ') + fmt(sweep.breakLevel) + ' ด้วย CHoCH/BOS และมี Displacement ที่สร้าง FVG'
  });
  if (!ready) return result('พบ ' + zone.event.kind + ' และ FVG', null, {
    stage: 'retest', text: 'ให้ M5 ย่อเข้า FVG ' + fmt(zone.low) + '–' + fmt(zone.high) +
      ' แล้วปิด' + (buy ? 'เหนือ ' + fmt(zone.high) : 'ใต้ ' + fmt(zone.low)) + ' ตามทิศเดิม'
  });
  const entry = buy ? ask : bid;
  const sl = sweep.extreme - sign * Math.max(2 * point, 0.15 * atr);
  const risk = sign * (entry - sl);
  if (risk < Math.max(market.min_sl_points * point, market.min_sl_atr * atr) || risk > market.max_sl_atr * atr)
    return result('ระยะ SL หลัง Sweep อยู่นอกช่วงที่ตั้งใน EA', null, { stage: 'stop', text: 'รอสัญญาณใหม่ที่ระยะ SL เข้าเพดาน EA' });
  if (sign * (entry - m5.at(-1)[4]) > market.max_drift_points * point ||
      sign * (entry - (buy ? zone.low : zone.high)) <= 0)
    return result('ราคาปัจจุบันห่างแท่งยืนยันเกินเกณฑ์หรือหลุดจุดยกเลิก', null, { stage: 'price', text: 'รอสัญญาณยืนยันใหม่ที่ราคาเข้าอยู่ในระยะอนุญาต' });
  const levels = [lower, middle, higher].map(item => buy ? item.high : item.low)
    .filter(level => level && !level.broken)
    .map(level => level.price)
    .filter(price => sign * (price - entry) > 0)
    .sort((a, b) => sign * (a - b));
  const liquidity = levels[0];
  if (!liquidity) return result('ยังไม่มี Swing Liquidity ฝั่งเป้าหมาย', null, { stage: 'target', text: 'รอแผนที่มี Swing Liquidity รองรับ TP' });
  const tp = buy ? Math.min(liquidity, entry + maxRR * risk) : Math.max(liquidity, entry - maxRR * risk);
  const rr = sign * (tp - entry) / risk;
  if (rr + 1e-9 < minRR) return result('เป้าหมาย Liquidity ให้ RR ' + fmt(rr) + ' ต่ำกว่าค่าที่ตั้ง ' + minRR, null, { stage: 'rr', text: 'รอแผนที่ RR อย่างน้อย ' + minRR });
  return result('ครบ ' + zone.event.kind + ' และ FVG Retest · รอ AI ประเมิน', {
    side, entry, sl, tp, rr, liquidity, confirmation: m5.at(-1)[0], invalidation: buy ? zone.low : zone.high
  });
}
