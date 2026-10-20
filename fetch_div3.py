import json, sys, time, re, requests
emb = json.load(open('embedded_data.json', encoding='utf-8'))
series = emb['series']
H = {"User-Agent":"Mozilla/5.0"}
out = {}; fails = []
def parse_div_page(code):
    url = f"https://fundf10.eastmoney.com/fhsp_{code}.html"
    r = requests.get(url, timeout=20, headers=H)
    t = r.text
    m = re.search(r'<tbody[^>]*>(.*?)</tbody>', t, re.S)
    if not m: return []
    rows = []
    for tr in re.split(r'<tr', m.group(1)):
        cells = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if not cells: continue
        joined = "|".join(re.sub(r'<[^>]+>','',c).strip() for c in cells)
        mm = re.search(r'每10份派现金([\d.]+)元', joined)
        dd = re.search(r'(\d{4}-\d{2}-\d{2})', joined)
        if mm and dd:
            rows.append([dd.group(1), round(float(mm.group(1))/10, 6)])
    return rows
for code in sorted(series.keys()):
    c6 = code.split('.')[0]
    try:
        divs = parse_div_page(c6)
        out[code] = divs
        print(f"{code}: div={len(divs)}", flush=True)
    except Exception as e:
        fails.append((code, str(e)[:60])); print(f"{code}: FAIL {str(e)[:60]}", flush=True)
    time.sleep(0.25)
json.dump({"dividends": out, "fails": fails}, open('div_events.json','w',encoding='utf-8'), ensure_ascii=False)
nd = sum(len(v) for v in out.values())
print(f"\n完成 {len(out)}/{len(series)}, 分红事件 {nd}, 失败 {len(fails)}")
for f in fails: print(" ", f)
