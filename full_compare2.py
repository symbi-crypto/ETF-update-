import json, sys, time, re, os
sys.path.insert(0, '.')
from askill import tencent_kline, sina_adjust_factor, apply_adjust

emb = json.load(open('embedded_data.json', encoding='utf-8'))
cal = emb['calendar']; series = emb['series']
ci = {d: i for i, d in enumerate(cal)}

# 从日志恢复已完成
done = set()
if os.path.exists('compare_log.txt'):
    for line in open('compare_log.txt', encoding='utf-8'):
        m = re.match(r'(\d{6}\.[A-Z]{2}): ', line)
        if m: done.add(m.group(1))
print("已跳过:", len(done), file=sys.stderr)

results = {}
if os.path.exists('compare_result.json'):
    results = json.load(open('compare_result.json', encoding='utf-8'))["results"]

codes = [c for c in sorted(series.keys()) if c not in done]
print("剩余:", len(codes), file=sys.stderr)
for code in codes:
    s = series[code]
    try:
        raw = tencent_kline(code, period="day", adjust="", start="2016-06-01", end="2026-10-09")
        fac = sina_adjust_factor(code, "hfq")
        adj = apply_adjust(raw, fac, "hfq")
        tc = dict(zip(adj['date'], adj['close']))
        pairs = []
        for d in cal:
            w = s['close'][ci[d]]
            t = tc.get(d)
            if w is None or w <= 0 or t is None or t <= 0: continue
            pairs.append((d, t, w))
        n = len(pairs)
        miss_t = sum(1 for d in cal if d not in tc and s['close'][ci[d]] is not None and s['close'][ci[d]]>0)
        diffn = 0; maxd = 0.0; diff_days = []
        for i in range(1, n):
            rt = pairs[i][1]/pairs[i-1][1]-1
            rw = pairs[i][2]/pairs[i-1][2]-1
            dd = abs(rt-rw)
            if dd > 1e-3:
                diffn += 1
                if dd > maxd: maxd = dd
                if len(diff_days) < 6: diff_days.append((pairs[i][0], round(rt*100,3), round(rw*100,3), round(dd*100,4)))
        results[code] = {
            "n_tencent": len(raw), "n_aligned": n, "miss_tencent": miss_t,
            "diff_days": diffn, "max_diff_pct": round(maxd*100,4), "sample": diff_days,
            "ratio0": round(pairs[0][2]/pairs[0][1],4) if pairs else None,
            "ratio1": round(pairs[-1][2]/pairs[-1][1],4) if pairs else None, "ok": True
        }
        with open('compare_result.json','w',encoding='utf-8') as f:
            json.dump({"results": results}, f, ensure_ascii=False)
        print(f"{code}: n={n} missT={miss_t} diff={diffn} max={round(maxd*100,4)}%", flush=True)
    except Exception as e:
        results[code] = {"ok": False, "err": f"{type(e).__name__}: {str(e)[:120]}"}
        with open('compare_result.json','w',encoding='utf-8') as f:
            json.dump({"results": results}, f, ensure_ascii=False)
        print(f"{code}: ERROR {type(e).__name__}: {str(e)[:100]}", flush=True)
    time.sleep(0.35)

ok = sum(1 for r in results.values() if r.get("ok"))
print(f"\n完成: 成功 {ok}/{len(results)}", flush=True)
