import json, os, re, time, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT="/home/user/Doubao/chats/38444992708406018/wufu_etf_system"
pool = json.loads(re.search(r'var WUFU_POOL = (\[.*?\]);', open(f'{ROOT}/web_live/index.html',encoding='utf-8').read()).group(1))
etfs=[p for p in pool if not p['code'].endswith('.WI')]
os.makedirs(f'{ROOT}/_scratch_pull/nav_raw', exist_ok=True)
START="2016-01-01"; END="2026-10-09"

def curl_json(url):
    for _ in range(5):
        try:
            r=subprocess.run(["curl","-s","-m","25","-H","User-Agent: Mozilla/5.0",
                "-H","Referer: https://fundf10.eastmoney.com/",url],capture_output=True,text=True,timeout=35)
            if r.stdout and r.stdout.strip().startswith('{'):
                return json.loads(r.stdout)
        except Exception: pass
        time.sleep(1.0)
    return None

def pull_one(meta):
    code=meta['code']; digits=code.split('.')[0]
    cache=f'{ROOT}/_scratch_pull/nav_raw/{code}.json'
    if os.path.exists(cache):
        try:
            d=json.load(open(cache))
            if d.get('_complete'): return code, len(d['rows']), 'cached'
        except: pass
    rows={}
    page=1
    while True:
        url=f"https://api.fund.eastmoney.com/f10/lsjz?fundCode={digits}&pageIndex={page}&pageSize=20"
        d=curl_json(url)
        if not d or not d.get('Data') or not d['Data'].get('LSJZList'): break
        lst=d['Data']['LSJZList']
        stop=False
        for r in lst:
            dt=r['FSRQ']; nav=r.get('DWJZ')
            if dt < START: stop=True; continue
            if dt > END: continue
            if nav not in (None,''):
                rows[dt]=float(nav)
        if stop: break
        if len(lst)<20: break
        page+=1
        if page>200: break
    out={'rows':[{'date':k,'nav':rows[k]} for k in sorted(rows)],'_complete':True}
    json.dump(out, open(cache,'w'))
    return code, len(rows), 'ok'

res=[]
with ThreadPoolExecutor(max_workers=8) as ex:
    futs={ex.submit(pull_one,p):p for p in etfs}
    for f in as_completed(futs):
        c,n,st=f.result(); res.append((c,n,st))
        print(c,n,st)
print('DONE', len(res), 'funds')
