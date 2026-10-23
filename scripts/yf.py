#!/usr/bin/env python3
"""ดึงแท่งราคา YM=F (Dow ฟิวเจอร์) จาก Yahoo ทุกไทม์เฟรม เก็บเป็น ym.json ให้แอปโชว์กราฟ US30
รูปแบบ: {"symbol","updated","bars":{"1m":[[t,o,h,l,c],...],...}}  (t = วินาที)"""
import json, os, sys, time, urllib.request

SYM = sys.argv[1] if len(sys.argv) > 1 else 'YM=F'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'ym.json'
ND = int(sys.argv[3]) if len(sys.argv) > 3 else 1   # ทศนิยมของราคา (ทอง = 2)
# (ชื่อ TF ในแอป, interval ของ Yahoo, range)
PLAN = [('1m', '1m', '1d'), ('5m', '5m', '5d'), ('15m', '15m', '15d'), ('30m', '30m', '30d'),
        ('1h', '60m', '60d'), ('1d', '1d', '1y')]

def fetch(interval, rng):
    for host in ('query1', 'query2'):
        url = f'https://{host}.finance.yahoo.com/v8/finance/chart/{SYM}?interval={interval}&range={rng}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=25) as r:
                j = json.load(r)
            res = j['chart']['result'][0]
            q = res['indicators']['quote'][0]
            out = []
            for i, t in enumerate(res['timestamp']):
                o, h, l, c = q['open'][i], q['high'][i], q['low'][i], q['close'][i]
                if None in (o, h, l, c):
                    continue
                out.append([t, round(o, ND), round(h, ND), round(l, ND), round(c, ND)])
            if out:
                return out
        except Exception as e:
            print('fail', interval, host, e)
    return None

def agg4h(b1h):
    res = {}
    for t, o, h, l, c in b1h:
        k = t // 14400 * 14400
        if k not in res:
            res[k] = [k, o, h, l, c]
        else:
            r = res[k]; r[2] = max(r[2], h); r[3] = min(r[3], l); r[4] = c
    return [res[k] for k in sorted(res)]

old = {}
if os.path.exists(OUT):
    try: old = json.load(open(OUT)).get('bars', {})
    except Exception: pass
bars = dict(old); got = 0
for tf, iv, rng in PLAN:
    d = fetch(iv, rng)
    if d: bars[tf] = d; got += 1
    time.sleep(0.5)
if '1h' in bars:
    bars['4h'] = agg4h(bars['1h'])
if got == 0:
    print('Yahoo fetch failed for all intervals'); sys.exit(0)
json.dump({'symbol': SYM, 'updated': int(time.time()), 'bars': bars}, open(OUT, 'w'), separators=(',', ':'))
print('ok', {k: len(v) for k, v in bars.items()}, os.path.getsize(OUT), 'bytes')
