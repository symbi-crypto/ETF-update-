# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var m = document.getElementById('rebWeightMode'); if (m) { m.value = 'fixed'; m.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.6)
    # 填权重：用 dispatchEvent 尝试不同事件
    pg.evaluate("(() => { var n = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { if (x.offsetParent !== null || n < 5) { x.value = '25'; ['input', 'change', 'keyup'].forEach(function (ev) { x.dispatchEvent(new Event(ev, { bubbles: true })); }); n++; } }); return n; })()")
    time.sleep(0.8)
    out = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return { reb_weights: p.reb_weights, mode: p.mode, rebalance_mode: p.rebalance_mode, codes: p.codes.slice(0, 6) }; })()")
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
