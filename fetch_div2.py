import json, sys, time, re, requests
sys.path.insert(0, '.')
from askill import tencent_kline

emb = json.load(open('embedded_data.json', encoding='utf-8'))
series = emb['series']; cal = emb['calendar']
H = {"User-Agent":"Mozilla/5.0"}

out = {"px_raw": {}, "dividends": {}, "splits": {}}
fails = []
def parse_div_page(code):
    url = f"https://fundf10.eastmoney.com/fhsp_{code}.html"
    r = requests.get(url, timeout=20, headers=H)
    t = r.text
    m = re.search(r'<tbody[^>]*>(.*?)</tbody>', t, re.S)
    if not m: return []
    txt = m.group(1)
    rows = re.findall(r'每10份派现金([\d.]+)元', txt)
    dates = re.findall(r'\d{4}-\d{2}-\d{2}', txt)
    # 结构：年份 | 权益登记日 | 除息日 | 每10份派现金X元 | 派发日（行序）
    # 简化：取"每10份派现金"前的两个日期——除息日=第二列日期
    out_rows = []
    lines = re.split(r'<tr>', txt)
    for ln in lines:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', ln, re.S)
        if not cells: continue
        txts = [re.sub(r'<[^>]+>','',c).strip() for c in cells]
        joined = "|".join(txts)
        mm = re.search(r'每10份派现金([\d.]+)元', joined)
        if not mm: continue
        dd = re.search(r'\d{4}-\d{2}-\d{2}', joined)
        per10 = float(mm.group(1))
        if dd: out_rows.append([dd.group(0), round(per10/10, 6)])
    return out_rows

for code in sorted(series.keys()):
    c6 = code.split('.')[0]
    try:
        raw = tencent_kline(c6, period="day", adjust="", start="2016-06-01", end="2026-10-09")
        out["px_raw"][code] = [round(float(x), 4) for x in raw['close']]
        # 折算检测：单日 |收益|>30%（未复权）
        splits = []
        for i in range(1, len(raw)):
            p0, p1 = float(raw['close'][i-1]), float(raw['close'][i])
            if p0 > 0 and p1 > 0:
                r_ = p1/p0 - 1
                if abs(r_) >= 0.30:
                    date = raw['date'][i]
                    ratio = 1 + r_          # 折算比例（价格乘数）
                    splits.append([date, round(ratio, 6)])
        out["splits"][code] = splits
        # 分红
        try:
            divs = parse_div_page(c6)
            out["dividends"][code] = divs
        except Exception as e:
            out["dividends"][code] = []
            fails.append((code, "div:" + str(e)[:60]))
        print(f"{code}: px={len(raw)} div={len(divs)} split={len(splits)}", flush=True)
    except Exception as e:
        fails.append((code, f"{type(e).__name__}: {str(e)[:80]}"))
        print(f"{code}: FAIL {str(e)[:80]}", flush=True)
    time.sleep(0.4)

json.dump(out, open('div_data.json','w',encoding='utf-8'), ensure_ascii=False)
nd = sum(len(v) for v in out["dividends"].values())
ns = sum(len(v) for v in out["splits"].values())
print(f"\n完成: {len(out['px_raw'])}/{len(series)} 只, 分红事件 {nd}, 折算事件 {ns}, 失败 {len(fails)}")
for f in fails[:10]: print(" ", f)
