import json, os, re, time, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
ROOT="/home/user/Doubao/chats/38444992708406018/wufu_etf_system"
pool=json.loads(re.search(r'var WUFU_POOL = (\[.*?\]);',open(f'{ROOT}/web_live/index.html').read()).group(1))
etfs=[p for p in pool if not p['code'].endswith('.WI')]
os.makedirs(f'{ROOT}/_scratch_pull/close_raw',exist_ok=True)

def secid(code):
    d=code.split('.')[0]; m=code.split('.')[1]
    return ('1.' if m=='SH' else '0.')+d

def fetch(meta):
    code=meta['code']; out=f'{ROOT}/_scratch_pull/close_raw/{code}.json'
    if os.path.exists(out) and json.load(open(out)).get('_ok'):
        return code,'cached'
    sid=secid(code)
    url=(f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={sid}"
         f"&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=20160101&end=20261009")
    H=["-H","User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
       "-H","Referer: https://quote.eastmoney.com/"]
    kl=None
    for i in range(25):
        try:
            r=subprocess.run(["curl","-s","-m","25",*H,url],capture_output=True,text=True,timeout=35)
            if r.stdout and '"klines"' in r.stdout:
                kl=json.loads(r.stdout)['data']['klines']; break
        except Exception: pass
        time.sleep(1.5)
    if kl is None: return code,'FAIL'
    d={r.split(',')[0]:float(r.split(',')[1]) for r in kl}
    json.dump({'close':d,'_ok':True},open(out,'w'))
    return code,len(d)

res=[]
with ThreadPoolExecutor(max_workers=6) as ex:
    futs=[ex.submit(fetch,p) for p in etfs]
    for f in as_completed(futs):
        c,n=f.result(); res.append((c,n)); print(c,n)
fails=[c for c,n in res if n=='FAIL']
print('DONE',len(res),'fails:',fails)
