# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var hs = Array.prototype.slice.call(document.querySelectorAll('.sfold-h')); var target = hs.filter(function (h) { return h.textContent.indexOf('交易参数') >= 0; })[0]; if (target) target.click(); })()")
    time.sleep(0.8)
    r = pg.evaluate("(() => { var sw = document.documentElement.scrollWidth; var startVis = document.getElementById('startSel') ? document.getElementById('startSel').offsetParent !== null : false; return { scrollW: sw, noOverflow: sw <= 390, startVis: startVis }; })()")
    print(json.dumps({"mobile": r, "errs": errs[:3]}, ensure_ascii=False))
    b.close()
