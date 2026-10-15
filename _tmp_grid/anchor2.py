# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.5)
    pg.click("#nextBtn")
    time.sleep(2)
    pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; document.querySelector('#mfAddBtn').click(); })()")
    time.sleep(0.5)
    pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; document.querySelector('#sellBtn').click(); })()")
    time.sleep(0.5)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    st = ""
    for i in range(15):
        time.sleep(6)
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st: break
    time.sleep(2)
    out = {"runState": st[:60]}
    out["kpi"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : 'none'; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False))
