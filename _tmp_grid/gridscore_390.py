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
    pg.click("#tabGrid")
    time.sleep(2)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; })()")
    # 勾选 518880
    pg.evaluate("(() => { var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(0.5)
    # 直调 computeScores
    pg.evaluate("(() => { window.GridView.computeScores(); })()")
    # 轮询
    for i in range(15):
        time.sleep(10)
        st = pg.evaluate("(() => { var t = document.getElementById('gridScoreTable'); return { len: t ? t.innerHTML.length : -1, snip: t ? t.innerHTML.slice(0, 60) : 'no-table' }; })()")
        if st["len"] > 500:
            out["score_done_after_s"] = (i + 1) * 10
            out["score_snip"] = st["snip"]
            out["grid_scored_overflow"] = pg.evaluate("(() => { var de = document.documentElement; return { scrollW: de.scrollWidth, vw: window.innerWidth }; })()")
            break
    else:
        out["score_timeout"] = True
        out["score_state"] = st
    out["errs"] = errs[:10]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
