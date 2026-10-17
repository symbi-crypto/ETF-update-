import subprocess, json, time, sys
def get_kline(secid, beg, end, fqt=0, tries=12):
    url=(f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}"
         f"&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt={fqt}&beg={beg}&end={end}")
    H=["-H","User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
       "-H","Referer: https://quote.eastmoney.com/"]
    for i in range(tries):
        try:
            r=subprocess.run(["curl","-s","-m","20",*H,url],capture_output=True,text=True,timeout=30)
            if r.stdout and '"klines"' in r.stdout:
                d=json.loads(r.stdout); return d['data']['klines']
        except Exception as e:
            pass
        time.sleep(1.5)
    return None
if __name__=="__main__":
    kl=get_kline("1.510300","20260625","20261009")
    rows=[s.split(',') for s in kl] if kl else []
    close={r[0]:float(r[2]) for r in rows}  # date->close (f53)
    # Wind verified (date, nav, wind prem%)
    wind=[('2026-07-01',4.9952,-0.0140),('2026-07-02',4.85,0.0474),('2026-07-09',4.916,-0.0305),
    ('2026-07-17',4.5827,-0.0414),('2026-07-31',4.6473,0.2456),('2026-08-19',4.6502,-0.0644),
    ('2026-09-01',4.6783,0.1133),('2026-09-15',4.5193,0.1040),('2026-09-30',4.4312,0.0429),
    ('2026-10-08',4.3826,0.1278),('2026-10-09',4.3898,-0.1093)]
    print(f"{'date':12s} {'close':>7s} {'nav':>7s} {'calc%':>9s} {'wind%':>9s} {'diff':>8s}")
    maxdiff=0
    for dt,nav,wp in wind:
        c=close.get(dt)
        if c is None: print(dt,'MISSING'); continue
        cp=(c-nav)/nav*100; diff=cp-wp; maxdiff=max(maxdiff,abs(diff))
        print(f"{dt:12s} {c:7.3f} {nav:7.4f} {cp:+9.4f} {wp:+9.4f} {diff:+8.4f}")
    print('max abs diff (%):', round(maxdiff,4))
