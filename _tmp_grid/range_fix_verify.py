# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    # 轮动第二步：勾选 → 展开 ② 交易参数
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var hs = Array.prototype.slice.call(document.querySelectorAll('.sfold-h')); var target = hs.filter(function (h) { return h.textContent.indexOf('交易参数') >= 0; })[0]; if (target) target.click(); })()")
    time.sleep(0.8)
    out["rot"] = pg.evaluate("(() => { var core = document.getElementById('sfg-core'); var startEl = document.getElementById('startSel'); var endEl = document.getElementById('endSel'); var rp = document.getElementById('realPoolSw'); var reb = document.getElementById('rebSetPsec'); var seq = Array.prototype.slice.call(core.querySelectorAll('h3, input[id=startSel], input[id=endSel], input[id=realPoolSw]')).map(function (e) { return e.id || e.textContent.trim().slice(0, 8); }); return { startVis: startEl ? startEl.offsetParent !== null : false, endVis: endEl ? endEl.offsetParent !== null : false, rpVis: rp ? rp.offsetParent !== null : false, rebDisp: getComputedStyle(reb).display, seq: seq }; })()")
    # 再平衡第二步
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    out["reb"] = pg.evaluate("(() => { var startEl = document.getElementById('startSel'); var reb = document.getElementById('rebSetPsec'); return { startVis: startEl ? startEl.offsetParent !== null : false, rebDisp: getComputedStyle(reb).display }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
