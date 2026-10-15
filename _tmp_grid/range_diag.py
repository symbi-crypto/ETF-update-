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
    pg.evaluate("(() => { var hs = Array.prototype.slice.call(document.querySelectorAll('.sfold-h')); var target = hs.filter(function (h) { return h.textContent.indexOf('交易参数') >= 0; })[0]; if (target) target.click(); })()")
    time.sleep(0.8)
    out["chain"] = pg.evaluate("(() => { var el = document.getElementById('startSel'); var chain = []; var n = 0; while (el && n < 12) { var cs = getComputedStyle(el); chain.push({ tag: el.tagName, id: el.id || '', cls: (el.className || '').toString().slice(0, 30), display: cs.display, visibility: cs.visibility, pos: cs.position }); el = el.parentElement; n++; } return chain; })()")
    # 找隐藏 startSel 的 JS（搜索源码中 startSel 相关 display 操作）
    out["startSel_src"] = pg.evaluate("(() => { var s = window.__SRC__ || ''; return 'need-source'; })()")
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
