#!/usr/bin/env python3
"""ดึงข่าว USD แดง/ส้มจาก Forex Factory แล้วเติมผลข่าวจริง (actual) จาก FXStreet
เขียนผลเป็น news.json ให้หน้าแอปอ่าน"""
import json, re, sys, difflib, urllib.request
from datetime import datetime, timedelta, timezone

UA = 'Mozilla/5.0 (oi-gold news bot)'

def get(url, headers=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

# ---------- Forex Factory ----------
ff = []
for wk in ('thisweek', 'nextweek'):
    try:
        ff += get(f'https://nfs.faireconomy.media/ff_calendar_{wk}.json')
    except Exception as e:
        print('FF', wk, 'failed:', e)
try:
    old = json.load(open('news.json')).get('events', [])
except Exception:
    old = []
if not ff:
    print('FF fetch failed, keep old events'); ff_events = old
else:
    seen, ff_events = set(), []
    for e in ff:
        if e.get('country') != 'USD' or e.get('impact') not in ('High', 'Medium'):
            continue
        k = (e['date'], e['title'])
        if k in seen: continue
        seen.add(k)
        ff_events.append({'date': e['date'], 'c': 'USD', 'i': 'H' if e['impact'] == 'High' else 'M',
                          'title': e['title'], 'forecast': e.get('forecast', ''), 'previous': e.get('previous', '')})
    # เก็บผลที่เคยได้ไว้ ถ้ารอบนี้ FXStreet ล่ม
    oldmap = {(o['date'], o['title']): o for o in old}
    for e in ff_events:
        o = oldmap.get((e['date'], e['title']))
        if o and o.get('actual'):
            e['actual'] = o['actual']; e['better'] = o.get('better')
ff_events.sort(key=lambda e: e['date'])

def utc0(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(timezone.utc)

# ---------- ข่าวล่วงหน้าจาก FXStreet (ช่วงเสาร์-อาทิตย์ FF ยังไม่มีสัปดาห์หน้า) ----------
now = datetime.now(timezone.utc)
if not any(utc0(e['date']) > now for e in ff_events):
    url = ('https://calendar-api.fxstreet.com/en/api/v1/eventDates/'
           f"{now:%Y-%m-%dT%H:%M:00Z}/{now + timedelta(days=8):%Y-%m-%dT00:00:00Z}?countries=US"
           '&volatilities=HIGH&volatilities=MEDIUM')
    try:
        up = get(url, {'Referer': 'https://www.fxstreet.com/', 'Origin': 'https://www.fxstreet.com'})
        have = {(utc0(e['date']).isoformat(), e['title']) for e in ff_events}
        def num(v, unit):
            if v is None or v == '': return ''
            u = unit if unit in ('%', 'K', 'M', 'B', 'T') else ''
            return (f'{v:g}' if isinstance(v, (int, float)) else str(v)) + u
        add = 0
        for x in up:
            vol = str(x.get('volatility', '')).upper()
            if vol not in ('HIGH', 'MEDIUM') or not x.get('dateUtc'): continue
            d = utc0(x['dateUtc']).isoformat()
            if (d, x.get('name')) in have: continue
            ff_events.append({'date': d, 'c': 'USD', 'i': 'H' if vol == 'HIGH' else 'M', 'title': x.get('name', ''),
                              'forecast': num(x.get('consensus'), x.get('unit')), 'previous': num(x.get('previous'), x.get('unit')), 'src': 'fxstreet'})
            add += 1
        print('FXStreet upcoming added', add)
        ff_events.sort(key=lambda e: utc0(e['date']))
    except Exception as e:
        print('FXStreet upcoming failed:', e)

def utc(s):
    return datetime.fromisoformat(s).astimezone(timezone.utc)

# ---------- FXStreet (มีค่า actual) ----------
fx = []
if ff_events:
    t0 = min(utc(e['date']) for e in ff_events) - timedelta(days=1)
    t1 = max(utc(e['date']) for e in ff_events) + timedelta(days=1)
    url = ('https://calendar-api.fxstreet.com/en/api/v1/eventDates/'
           f"{t0:%Y-%m-%dT00:00:00Z}/{t1:%Y-%m-%dT00:00:00Z}?countries=US"
           '&volatilities=HIGH&volatilities=MEDIUM&volatilities=LOW')
    try:
        fx = get(url, {'Referer': 'https://www.fxstreet.com/', 'Origin': 'https://www.fxstreet.com'})
    except Exception as e:
        print('FXStreet failed:', e)

# ชื่อข่าว FF → ชื่อข่าว FXStreet (ส่วนที่ไม่รวมช่วงเวลา m/m, y/y)
ALIAS = {
    'cpi': 'consumer price index', 'core cpi': 'consumer price index ex food & energy',
    'ppi': 'producer price index', 'core ppi': 'producer price index ex food & energy',
    'core retail sales': 'retail sales ex autos', 'unemployment claims': 'initial jobless claims',
    'philly fed manufacturing index': 'philadelphia fed manufacturing survey',
    'empire state manufacturing index': 'ny empire state manufacturing index',
    'non-farm employment change': 'nonfarm payrolls', 'adp non-farm employment change': 'adp employment change',
    'core pce price index': 'core personal consumption expenditures - price index',
    'pce price index': 'personal consumption expenditures - price index',
    'advance gdp': 'gross domestic product annualized', 'prelim gdp': 'gross domestic product annualized',
    'final gdp': 'gross domestic product annualized', 'federal funds rate': 'fed interest rate decision',
    'prelim uom consumer sentiment': 'michigan consumer sentiment index',
    'revised uom consumer sentiment': 'michigan consumer sentiment index',
    'prelim uom inflation expectations': 'uom 1-year consumer inflation expectations',
    'flash manufacturing pmi': 's&p global manufacturing pmi', 'flash services pmi': 's&p global services pmi',
    'cb consumer confidence': 'conference board consumer confidence',
    'jolts job openings': 'jolts job openings', 'ism manufacturing pmi': 'ism manufacturing pmi',
    'ism services pmi': 'ism services pmi', 'average hourly earnings': 'average hourly earnings',
    'unemployment rate': 'unemployment rate', 'durable goods orders': 'durable goods orders',
    'core durable goods orders': 'durable goods orders ex transportation',
}
PER = {'m/m': 'mom', 'y/y': 'yoy', 'q/q': 'qoq'}

def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'[()]', ' ', s.lower())).strip()

def ff_key(title):
    t = title.lower().strip()
    per = ''
    m = re.search(r'\s(m/m|y/y|q/q)$', t)
    if m:
        per = PER[m.group(1)]; t = t[:m.start()].strip()
    return ALIAS.get(t, t), per

def fmt(val, ref):
    """จัดรูปค่า actual ให้เหมือนตัวเลข forecast/previous ของ FF (ทศนิยม + หน่วย % K M B T)"""
    ref = (ref or '').strip()
    m = re.match(r'^[<>]?-?[\d.]+([%KMBT]?)$', ref)
    suf = m.group(1) if m else ''
    dec = len(ref.split('.')[1].rstrip('%KMBT')) if m and '.' in ref else (1 if isinstance(val, float) and val != int(val) else 0)
    return f'{val:.{dec}f}{suf}'

by_time = {}
for x in fx:
    if x.get('actual') is None: continue
    by_time.setdefault(x['dateUtc'].replace('Z', '+00:00'), []).append(x)

hit = 0
for e in ff_events:
    cands = by_time.get(utc(e['date']).isoformat(), [])
    if not cands: continue
    base, per = ff_key(e['title'])
    best, bs = None, 0
    for x in cands:
        n = norm(x['name'])
        xper = 'mom' if ' mom' in n else 'yoy' if ' yoy' in n else 'qoq' if ' qoq' in n else ''
        nb = re.sub(r' (mom|yoy|qoq)$', '', n).strip()
        if per and xper and per != xper: continue
        s = 1.0 if nb == base else difflib.SequenceMatcher(None, nb, base).ratio()
        if per == xper: s += 0.05
        if s > bs: best, bs = x, s
    if best and bs >= 0.72:
        e['actual'] = fmt(best['actual'], e.get('previous') or e.get('forecast'))
        e['better'] = best.get('isBetterThanExpected')
        hit += 1
        print(f"match {e['title']!r} <- {best['name']!r} ({bs:.2f}) = {e['actual']}")

out = {'source': 'Forex Factory + FXStreet (actual)', 'events': ff_events}
new = json.dumps(out, ensure_ascii=False, indent=2)
try:
    cur = open('news.json').read()
except Exception:
    cur = ''
if new.strip() != cur.strip():
    open('news.json', 'w').write(new + '\n'); print('news.json updated', hit, 'actual')
else:
    print('no change')
