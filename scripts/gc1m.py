#!/usr/bin/env python3
"""ดึงแท่ง 1 นาทีของ GC=F (ทองฟิวเจอร์) จาก Yahoo เก็บเป็น gcm.json ให้แอปจับคู่กับแท่ง perp นาทีเดียวกันเพื่อคำนวณ offset
รูปแบบ: {"symbol","updated","bars":[[t,close],...]}  (t = เวลาเริ่มแท่ง วินาที)"""
import json, time, urllib.request

def fetch():
    for host in ('query1', 'query2'):
        url = f'https://{host}.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=25) as r:
                res = json.load(r)['chart']['result'][0]
            c = res['indicators']['quote'][0]['close']
            out = [[t, round(c[i], 2)] for i, t in enumerate(res['timestamp']) if c[i] is not None]
            if out:
                return out
        except Exception as e:
            print('fail', host, e)
    return None

bars = fetch()
if not bars:
    print('Yahoo GC=F fetch failed'); raise SystemExit(0)
bars = bars[-400:]
json.dump({'symbol': 'GC=F', 'updated': int(time.time()), 'bars': bars}, open('gcm.json', 'w'), separators=(',', ':'))
print('ok', len(bars), 'last', bars[-1])
