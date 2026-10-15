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
    # 轮动第二步
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    # 展开 sfg-core（② 交易参数折叠头—— sfg-core 的 sfold-h）
    out["rot_step2"] = pg.evaluate("(() => { var core = document.getElementById('sfg-core'); var h3s = core ? core.querySelectorAll('h3') : []; var startEl = document.getElementById('startSel'); var endEl = document.getElementById('endSel'); var rp = document.getElementById('realPoolSw'); var coreDisp = core ? getComputedStyle(core).display : '?'; var startVis = startEl ? startEl.offsetParent !== null : false; var h3texts = []; h3s.forEach(function (h) { h3texts.push(h.textContent); }); var coreParent = core ? core.parentElement.id : '?'; return { coreDisp: coreDisp, startVis: startVis, startParentVisible: startEl ? (startEl.closest('#sfg-core') !== null) : false, h3s: h3texts, coreParentId: coreParent }; })()")
    # 展开折叠区（点击 sfg-core 的折叠头）
    pg.evaluate("(() => { var core = document.getElementById('sfg-core'); if (core) { var h = core.parentElement.querySelector('.sfold-h'); if (h) h.click(); } })()")
    time.sleep(0.8)
    out["rot_expanded"] = pg.evaluate("(() => { var startEl = document.getElementById('startSel'); var endEl = document.getElementById('endSel'); var rp = document.getElementById('realPoolSw'); var core = document.getElementById('sfg-core'); return { coreDisp: getComputedStyle(core).display, startVis: startEl ? startEl.offsetParent !== null : false, endVis: endEl ? endEl.offsetParent !== null : false, rpVis: rp ? rp.offsetParent !== null : false, coreH3s: Array.prototype.map.call(core.querySelectorAll('h3'), function (h) { return h.textContent; }) }; })()")
    # 再平衡第二步
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    out["reb_step2"] = pg.evaluate("(() => { var startEl = document.getElementById('startSel'); var core = document.getElementById('sfg-core'); return { startVis: startEl ? startEl.offsetParent !== null : false, coreDisp: core ? getComputedStyle(core).display : '?', coreH3s: core ? Array.prototype.map.call(core.querySelectorAll('h3'), function (h) { return h.textContent; }) : [] }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
