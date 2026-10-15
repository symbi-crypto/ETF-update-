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
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    def scan(tag):
        return pg.evaluate("((tag) => { var de = document.documentElement; return { tag: tag, scrollW: de.scrollWidth, overflow: de.scrollWidth > 392 }; })('" + tag + "')")
    # 主回测 run 后（轮动 step2 结果区）
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.5)
    pg.click("#nextBtn")
    time.sleep(2)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    try:
        pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(1.5)
        out["main_run"] = scan("main_run")
    except Exception as e:
        out["main_run_ok"] = False
    # IC run 后
    pg.click("#tabIc")
    time.sleep(3)
    pg.evaluate("(() => { var rb = document.querySelector('#icRunBtn, #icRun, [id*=icRun]'); if (rb) rb.click(); })()")
    time.sleep(6)
    out["ic_run"] = scan("ic_run")
    # corr run 后
    pg.click("#tabCorr")
    time.sleep(3)
    pg.evaluate("(() => { var rb = document.querySelector('#corrRunBtn, #corrRun, [id*=corrRun]'); if (rb) rb.click(); })()")
    time.sleep(6)
    out["corr_run"] = scan("corr_run")
    # combo run 后
    pg.click("#tabCombo")
    time.sleep(3)
    pg.evaluate("(() => { var rb = document.querySelector('#comboRunBtn, #comboRun, [id*=comboRun]'); if (rb) rb.click(); })()")
    time.sleep(6)
    out["combo_run"] = scan("combo_run")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
