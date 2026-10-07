# -*- coding: utf-8 -*-
"""构建「标的相关性分析」独立页面：从 web_data.json 提取后复权收盘价，gzip base64 内嵌。"""
import os, json, gzip, base64

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "output", "web_data.json")
TPL = os.path.join(ROOT, "corr_template.html")
ECH = os.path.join(ROOT, "echarts.min.js")
OUT = os.path.join(ROOT, "output", "标的相关性分析.html")

d = json.load(open(DATA, "r", encoding="utf-8"))
cal = d["calendar"]
pool = d["pool"]

close = {}
for p in pool:
    s = d["series"].get(p["code"])
    close[p["code"]] = s.get("close", [None] * len(cal)) if s else [None] * len(cal)

# 指数序列（web_data.json 的 index 值即点位列表）
idx = {}
for ic, v in d.get("index", {}).items():
    idx[ic] = v if isinstance(v, list) else (v.get("close", [None] * len(cal)) if isinstance(v, dict) else [None] * len(cal))

out = {"calendar": cal, "pool": pool, "close": close, "idx": idx,
       "indexNames": d.get("indexNames", [])}

blob = json.dumps(out, separators=(",", ":")).encode("utf-8")
gz = gzip.compress(blob, compresslevel=9)
b64 = base64.b64encode(gz).decode("ascii")

tpl = open(TPL, "r", encoding="utf-8").read()
echarts_js = open(ECH, "r", encoding="utf-8").read()

# 注入
tpl = tpl.replace("/*__ECHARTS__*/", echarts_js)
tpl = tpl.replace("/*__DATA_GZ__*/", b64)

# 占位符完整性检查
for marker in ["/*__ECHARTS__*/", "/*__DATA_GZ__*/"]:
    if marker in tpl:
        raise SystemExit("未替换占位符: " + marker)

open(OUT, "w", encoding="utf-8").write(tpl)
print("已生成:", OUT)
print("数据 gzip: %.1f KB, base64: %.1f KB, 页面: %.2f MB" % (
    len(gz) / 1024, len(b64) / 1024, len(tpl) / 1024 / 1024))
print("标的:", len(pool), "指数:", len(idx), "日历:", len(cal), "截止:", cal[-1])
