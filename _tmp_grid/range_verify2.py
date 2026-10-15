# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
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
    # 初始：sfg-core 折叠状态 + 所有 sfold-h（含文本）
    out["init"] = pg.evaluate("(() => { var core = document.getElementById('sfg-core'); var hs = Array.prototype.map.call(document.querySelectorAll('.sfold-h'), function (h) { return h.textContent.trim(); }); var startVis = document.getElementById('startSel') ? document.getElementById('startSel').offsetParent !== null : false; return { coreDisp: getComputedStyle(core).display, sfoldHs: hs, startVis: startVis }; })()")
    # 点击「② 交易参数」折叠头（找含"交易参数"的 sfold-h）
    pg.evaluate("(() => { var hs = Array.prototype.slice.call(document.querySelectorAll('.sfold-h')); var target = hs.filter(function (h) { return h.textContent.indexOf('交易参数') >= 0; })[0]; if (target) { target.click(); } return !!target; })()")
    time.sleep(0.8)
    out["after_click"] = pg.evaluate("(() => { var core = document.getElementById('sfg-core'); var startEl = document.getElementById('startSel'); var endEl = document.getElementById('endSel'); var rp = document.getElementById('realPoolSw'); var h3s = core ? Array.prototype.map.call(core.querySelectorAll('h3'), function (h) { return h.textContent; }) : []; return { coreDisp: core ? getComputedStyle(core).display : '?', startVis: startEl ? startEl.offsetParent !== null : false, endVis: endEl ? endEl.offsetParent !== null : false, rpVis: rp ? rp.offsetParent !== null : false, h3s: h3s }; })()")
    # 顺序：startSel 相对 topnRow/调仓设置/交易成本
    out["order"] = pg.evaluate("(() => { var core = document.getElementById('sfg-core'); var els = Array.prototype.slice.call(core.querySelectorAll('h3, input[id=startSel], input[id=endSel], input[id=realPoolSw]')); var seq = els.map(function (e) { return e.id || e.textContent.trim().slice(0, 10); }); return seq; })()")
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
