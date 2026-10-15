# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.click("#tabRebalance")
    time.sleep(2)
    # 自定义 10 只 90%
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    pg.evaluate("(() => { var i = 0; document.querySelectorAll('#poolBox .pick').forEach(function (cb) { if (i < 10) { cb.click(); i++; } }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var i = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { if (i < 10) { x.value = '9'; x.dispatchEvent(new Event('change', { bubbles: true })); i++; } }); })()")
    time.sleep(0.8)
    out["step1"] = pg.evaluate("(() => { var sw = document.documentElement.scrollWidth; var h3 = document.querySelector('#psecPool h3'); return { scrollW: sw, noOverflow: sw <= 390, html: h3.innerHTML }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
