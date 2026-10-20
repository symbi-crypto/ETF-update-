import json, sys, time, math, traceback
sys.path.insert(0, '.')
from askill import tencent_kline, sina_adjust_factor, apply_adjust

emb = json.load(open('embedded_data.json', encoding='utf-8'))
cal = emb['calendar']; series = emb['series']
ci = {d: i for i, d in enumerate(cal)}

results = {}
errors = []
for code in sorted(series.keys()):
    s = series[code]
    try:
        raw = tencent_kline(code, period="day", adjust="", start="2016-06-01", end="2026-10-09")
        fac = sina_adjust_factor(code, "hfq")
        adj = apply_adjust(raw, fac, "hfq")
        tc = dict(zip(adj['date'], adj['close']))
        # 对齐：内嵌 close（Wind后复权） vs 腾讯标准后复权
        pairs = []
        for d in cal:
            w = s['close'][ci[d]]
            t = tc.get(d)
            if w is None or w <= 0 or t is None or t <= 0:
                continue
            pairs.append((d, t, w))
        n = len(pairs)
        miss_w = sum(1 for d in cal if (s['close'][ci[d]] is None or s['close'][ci[d]]<=0) and d in tc)
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
        ratio0 = pairs[0][2]/pairs[0][1] if pairs else None
        ratio1 = pairs[-1][2]/pairs[-1][1] if pairs else None
        results[code] = {
            "n_tencent": len(raw), "n_aligned": n, "miss_wind_none": miss_w, "miss_tencent": miss_t,
            "diff_days": diffn, "max_diff_pct": round(maxd*100,4), "sample": diff_days,
            "ratio0": round(ratio0,4) if ratio0 else None, "ratio1": round(ratio1,4) if ratio1 else None,
            "ok": True
        }
        print(f"{code}: n={n} missT={miss_t} diff={diffn} max={round(maxd*100,4)}%", flush=True)
    except Exception as e:
        errors.append({"code": code, "err": f"{type(e).__name__}: {str(e)[:120]}"})
        results[code] = {"ok": False, "err": f"{type(e).__name__}: {str(e)[:120]}"}
        print(f"{code}: ERROR {type(e).__name__}: {str(e)[:100]}", flush=True)
    time.sleep(0.35)

json.dump({"results": results, "errors": errors}, open('compare_result.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
ok = sum(1 for r in results.values() if r.get("ok"))
print(f"\n完成: 成功 {ok}/{len(results)}, 失败 {len(errors)}")
for e in errors: print(" ", e)
