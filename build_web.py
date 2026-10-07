# -*- coding: utf-8 -*-
"""
build_web.py — 构建交互式网页版（单文件自包含）
=================================================
拼接：js_engine.js（引擎）+ js_ui.js（界面）+ web_data.json（数据）
输出：output/ETF动量轮动回测系统.html（可直接双击打开，离线可用）
"""
import base64
import gzip
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "output", "ETF动量轮动回测系统.html")


def main():
    with open(os.path.join(ROOT, "templates", "web_template.html"), "r", encoding="utf-8") as f:
        tpl = f.read()
    with open(os.path.join(ROOT, "js_engine.js"), "r", encoding="utf-8") as f:
        engine_js = f.read()
    with open(os.path.join(ROOT, "js_ui.js"), "r", encoding="utf-8") as f:
        ui_js = f.read()
    with open(os.path.join(ROOT, "js_tune.js"), "r", encoding="utf-8") as f:
        tune_js = f.read()
    with open(os.path.join(ROOT, "corr_view.js"), "r", encoding="utf-8") as f:
        corr_js = f.read()
    with open(os.path.join(ROOT, "ic_view.js"), "r", encoding="utf-8") as f:
        ic_js = f.read()
    with open(os.path.join(ROOT, "output", "web_data.json"), "r", encoding="utf-8") as f:
        data_json = f.read()
    with open(os.path.join(ROOT, "echarts.min.js"), "r", encoding="utf-8") as f:
        echarts_js = f.read()

    # 标的池元信息（即时可用，约 15KB）与行情大数据（延迟 JSON.parse，首屏不解析）
    wd = json.loads(data_json)
    pool_meta = json.dumps(wd["pool"], ensure_ascii=False)

    # 每只标的首个有效交易日（幸存者偏差披露用）：close 首个非空且>0 的日期
    cal = wd["calendar"]
    first_date = {}
    for c, s in wd["series"].items():
        arr = s.get("close")
        if not arr:
            continue
        for i, v in enumerate(arr):
            if v is not None and v > 0:
                first_date[c] = cal[i]
                break
    first_meta = json.dumps(first_date, ensure_ascii=False)

    # 行情大数据：gzip 压缩 + base64 内联（10.4MB JSON → 约 3.8MB），浏览器端 DecompressionStream 解压
    gz = gzip.compress(data_json.encode("utf-8"), compresslevel=9)
    data_gz_b64 = base64.b64encode(gz).decode("ascii")

    html = tpl.replace("/*__POOL__*/", pool_meta)
    html = html.replace("/*__FIRSTDATE__*/", first_meta)
    html = html.replace("/*__DATA_GZ_B64__*/", data_gz_b64)
    html = html.replace("/*__ENGINE__*/", engine_js)
    html = html.replace("/*__UI__*/", ui_js)
    html = html.replace("/*__TUNE__*/", tune_js)
    html = html.replace("/*__CORR__*/", corr_js)
    html = html.replace("/*__IC__*/", ic_js)
    html = html.replace("/*__ECHARTS__*/", echarts_js)

    # 安全检查：占位符都必须被替换
    for marker in ["/*__POOL__*/", "/*__FIRSTDATE__*/", "/*__DATA_GZ_B64__*/", "/*__ENGINE__*/", "/*__UI__*/", "/*__TUNE__*/", "/*__CORR__*/", "/*__IC__*/", "/*__ECHARTS__*/"]:
        if marker in html:
            raise SystemExit(f"占位符 {marker} 未被替换，构建中止")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"网页版已生成: {OUT}")
    print(f"体积: {os.path.getsize(OUT)/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
