# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.5)
    pg.click("#nextBtn")
    time.sleep(2)
    t0 = time.time()
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    done = False
    for i in range(30):
        time.sleep(10)
        st = pg.evaluate("(() => { var s = document.getElementById('runState'); var canv = document.querySelectorAll('#step2 canvas, #viewRotation canvas').length; return { txt: s ? s.textContent : 'no', canv: canv }; })()")
        if "已更新" in st["txt"]:
            done = True
            out["run_done_s"] = (i + 1) * 10
            break
    out["run_done"] = done
    out["runState"] = st
    # 结果区溢出
    if done:
        time.sleep(2)
        out["overflow"] = pg.evaluate("(() => { var de = document.documentElement; var bad = []; document.querySelectorAll('table').forEach(function (t) { var r = t.getBoundingClientRect(); if (r.width > 0 && r.right > 402) { var p = t.parentElement; bad.push({ cls: t.className, right: Math.round(r.right), parent: p ? p.className.slice(0, 30) : '?', pOverflow: p ? getComputedStyle(p).overflowX : '?' }); } }); return { scrollW: de.scrollWidth, bad: bad.slice(0, 6) }; })()")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
