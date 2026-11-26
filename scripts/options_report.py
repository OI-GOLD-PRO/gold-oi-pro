"""Build dated CME strike comparisons for the dashboard. Run from repository root."""
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo
import subprocess
import sys
import urllib.request

ROOT = 'https://www.cmegroup.com/CmeWS/mvc/Volume/Options/'
OUT = Path('reports')
CACHE = Path(os.getenv('RUNNER_TEMP', '/tmp')) / 'gold-options-source-v1'
CACHE.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)
today = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.datetime.now(dt.timezone.utc).date()
monday = today - dt.timedelta(days=today.weekday())
def fetch(url):
    import hashlib
    file = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if file.exists() and dt.datetime.now().timestamp()-file.stat().st_mtime < 1800:
        return json.loads(file.read_text())
    with urllib.request.urlopen(url, timeout=14) as response:
        data = json.load(response)
    file.write_text(json.dumps(data))
    return data

def num(x):
    try:
        value = float(str(x).replace(',', ''))
        return int(value) if value.is_integer() else None
    except (ValueError, OverflowError):
        return None

def catalog(day):
    url = ROOT+'Expirations?productid=437&tradedate='+day.strftime('%Y%m%d')
    series = {}
    try:
        for group in fetch(url):
            for exp in group.get('expirations') or []:
                key = str(exp['productId'])+'-'+exp['expirationCode']
                series[key] = (group['label'], exp['label'])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return series

def detail(args):
    day, key = args
    pid, code = key.split('-')
    url = ROOT+f'Details?productid={pid}&tradedate={day:%Y%m%d}&expirationcode={code}&reporttype=P'
    rows = {}
    try:
        for month in fetch(url).get('monthData', []):
            side = month['monthID'].split('-')[-1].lower()
            if side not in ('calls','puts'): continue
            for row in month.get('strikeData') or []:
                strike = num(row.get('strike'))
                if strike is None:
                    try: strike = float(row['strike'])
                    except (KeyError, TypeError, ValueError): continue
                oi = num(row.get('atClose'))
                if oi is not None:
                    rows[(side[0].upper(),strike)] = (oi,num(row.get('change')),num(row.get('totalVolume')))
    except (OSError, ValueError, KeyError, TypeError):
        rows = {}
    return (day,key), (url, rows)

def compare(rows, base, daily):
    result = {}
    for side in ('C','P'):
        ranked = []
        candidates = [k for k in rows if k[0] == side]
        for k in candidates:
            oi, change, vol = rows[k]
            before = oi-change if daily and change is not None else (base[k][0] if not daily and k in base else None)
            if before is not None:
                ranked.append([k[1],before,oi,oi-before,vol])
        ranked.sort(key=lambda r:(-abs(r[3]),r[0]))
        result[side] = {'rows':ranked[:10], 'matched':len(ranked),'available':len(set(candidates) | {k for k in base if k[0]==side})}
    return result

def git_snapshots():
    command = ['git','log','--since='+str(monday-dt.timedelta(days=12)),'--format=%H','--','cme_oi.json']
    snaps = []
    for commit in subprocess.check_output(command,text=True).splitlines():
        data=json.loads(subprocess.check_output(['git','show',commit+':cme_oi.json']))
        if not data.get('fetchedAt') or not data.get('exp'): continue
        levels=set()
        for side in ('P','C'):
            levels.update(r[0] for r in sorted((r for r in data['rows'] if r[1]==side and r[2]>0),key=lambda r:(-r[2],r[0]))[:10])
        snaps.append((data['fetchedAt'],str(data['exp']),levels,commit,data['root']))
    return sorted(snaps,key=lambda s:s[0])

def sessions(day,bars,snaps):
    midnight=dt.datetime.combine(day,dt.time(),dt.timezone(dt.timedelta(hours=7))).timestamp()
    result=[]
    active=set()
    for name,start,end in [('เอเชีย',6,13),('ลอนดอน',13,19),('นิวยอร์ก',19,29),('นอกช่วงตลาด',29,30)]:
        bounce=brk=usable=0
        sources=set()
        for t in range(int(midnight+start*3600),int(midnight+end*3600),300):
            known=next((s for s in reversed(snaps) if s[0]<=t),None)
            if not known or not bars.get(t) or not bars.get(t-300):
                active.clear()
                continue
            # Match the expiry clock used by scripts/vol.mjs for GC options.
            expiry=dt.datetime.strptime(known[1]+'1230','%Y%m%d%H%M').replace(tzinfo=ZoneInfo('America/Chicago'))
            if t+300>expiry.timestamp():
                active.clear()
                continue
            low,high,close=bars[t]
            previous=bars[t-300][2]
            touched={v for v in known[2] if low<=v<=high}
            for level in touched-active:
                if (previous-level)*(close-level)>0: bounce+=1
                if (previous-level)*(close-level)<0: brk+=1
            usable+=1
            sources.add(known[3])
            active=touched
        result.append([name,bounce if usable else None,brk if usable else None,usable,(end-start)*12,sorted(sources)])
    return result

dates=[monday+dt.timedelta(days=i) for i in range(5) if monday+dt.timedelta(days=i)<=today]
if not dates: sys.exit()
prior=[monday-dt.timedelta(days=i) for i in range(3,8)]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    cats=dict(zip(dates+prior,pool.map(catalog,dates+prior)))
    # Use the same reference date across series. Missing series stay unavailable.
    base=next((d for d in prior if cats[d]),None)
    tasks=[(day,k) for day in dates+([base] if base else []) for k in cats[day]]
    details=dict(pool.map(detail,tasks))

snaps=git_snapshots()
settlements={}
for snapshot in snaps:
    raw=json.loads(subprocess.check_output(['git','show',snapshot[3]+':cme_oi.json']))
    settle=raw.get('settle') or {}
    try: trade_date=dt.datetime.strptime(settle['tradeDate'],'%m/%d/%Y').date()
    except (KeyError,TypeError,ValueError): continue
    key=str(raw['productId'])+'-'+raw['expirationCode']
    settlements[trade_date,key]=(raw['root'],settle.get('rows',[]),snapshot[3],raw['exp'])

price=json.loads(Path('gcy.json').read_text())
price_commit=subprocess.check_output(['git','log','-1','--format=%H','--','gcy.json'],text=True).strip()
bars={t:(l,h,c) for t,o,h,l,c,*_ in price['bars']['5m'] if t+300<=price['updated'] and price['symbol']=='GC=F'}
iv=json.loads(Path('iv_hist.json').read_text()).get('daily',[])
for day in dates:
    contracts=[]
    for key,(group,label) in cats[day].items():
        url,rows=details[day,key]
        baseurl,old=details.get((base,key),(None,{}))
        root,quotes,source,expiry=settlements.get((day,key),(None,[],None,None))
        obs=next((r for r in reversed(iv) if r[0]==str(day) and r[2]==root),None)
        atm=obs[1] if obs else None
        em=None
        if obs and quotes:
            prices={(strike,side):price for strike,side,price in quotes if price>0}
            strike=min({r[0] for r in quotes},key=lambda k:(abs(k-obs[3]),k))
            if (strike,'C') in prices and (strike,'P') in prices:
                em=round(prices[strike,'C']+prices[strike,'P'],3)
        contracts.append(dict(name=group+' · '+label,key=key,url=url,baseUrl=baseurl,iv=atm,em=em,settleSource=source,expiry=expiry,
                              daily=compare(rows,{},True),weekly=compare(rows,old,False)))
    file=OUT/(str(day)+'.json')
    prev=json.loads(file.read_text()) if file.exists() else {}
    saved={c['key']:c for c in prev.get('contracts',[])}
    for c in contracts:
        last=saved.get(c['key'])
        if last:
            if not any(v['available'] for v in c['daily'].values()): continue
            if prev.get('base')==str(base) and not any(v['matched'] for v in c['weekly'].values()): c['weekly']=last['weekly']
            if c['iv'] is None and last.get('iv') is not None:
                for field in ('iv','em','settleSource','expiry'): c[field]=last.get(field)
        saved[c['key']]=c

    counts=sessions(day,bars,snaps)
    for count in counts: count.append(price_commit)
    for i,old in enumerate(prev.get('sessions',[])):
        if counts[i][3]<old[3]: counts[i]=old
    data=dict(date=str(day),base=str(base) if base else None,contracts=list(saved.values()),sessions=counts)
    file.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
index=sorted((p.stem for p in OUT.glob('????-??-??.json')),reverse=True)
(OUT/'dates.json').write_text(json.dumps(index))
