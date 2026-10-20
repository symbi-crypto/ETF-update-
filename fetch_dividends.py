import json, sys, time, re, os
sys.path.insert(0, '.')
from askill import tencent_kline, sina_adjust_factor

emb = json.load(open('embedded_data.json', encoding='utf-8'))
series = emb['series']; cal = emb['calendar']

out = {}; fails = []
for code in sorted(series.keys()):
    try:
        raw = tencent_kline(code, period="day", adjust="", start="2016-06-01", end="2026-10-09")
        fac = sina_adjust_factor(code, "hfq")
        # 因子阶梯按日期升序
        fmap = {}
        for f in fac:
            d = f['date']
            if d >= cal[0]:
                fmap[d] = f['factor']
        # 每日因子（取不晚于该日的最近因子）
        fc = []
        cur = fmap.get(cal[0], 1.0)
        for d in cal:
            if d in fmap: cur = fmap[d]
            fc.append(cur)
        # 推导事件：因子跳变（升序相邻）
        events = []
        for i in range(1, len(fc)):
            if fc[i] != fc[i-1]:
                ratio = fc[i-1] / fc[i]   # >1 表示除权（后复权因子下降=分红/折算）
                if ratio > 1.0005:
                    # 未复权价（除权前一日）
                    p_before = raw['close'][i-1] if i-1 < len(raw) else None
                    ev = {"date": cal[i], "ratio": round(ratio, 6)}
                    if ratio >= 1.3:
                        ev["type"] = "split"      # 份额折算（拆/并）
                    else:
                        ev["type"] = "div"
                        ev["per_share"] = round(p_before * (1 - 1/ratio), 6) if p_before else None
                    events.append(ev)
        out[code] = events
        print(f"{code}: {len(events)} events", flush=True)
    except Exception as e:
        fails.append((code, f"{type(e).__name__}: {str(e)[:80]}"))
        print(f"{code}: FAIL {str(e)[:80]}", flush=True)
    time.sleep(0.4)

json.dump({"dividends": out, "fails": fails}, open('dividends.json','w',encoding='utf-8'), ensure_ascii=False)
n_ev = sum(len(v) for v in out.values())
print(f"\n完成: {len(out)}/{len(series)} 只, 事件总数 {n_ev}, 失败 {len(fails)}")
for f in fails: print(" ", f)
