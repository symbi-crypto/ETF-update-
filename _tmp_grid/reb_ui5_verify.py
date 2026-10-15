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
    pg.click("#tabRebalance")
    time.sleep(2)
    # 自定义：勾 10 只（前 10 只），手填每只 9% → 90%
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var i = 0; document.querySelectorAll('#poolBox .pick').forEach(function (cb) { if (i < 10) { cb.click(); i++; } }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var i = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { if (i < 10) { x.value = '9'; x.dispatchEvent(new Event('change', { bubbles: true })); i++; } }); })()")
    time.sleep(0.8)
    out["custom_90"] = pg.evaluate("(() => { var h3 = document.querySelector('#psecPool h3'); return { html: h3.innerHTML, text: h3.textContent }; })()")
    # 等比例：只显示 N只（wSum 隐藏）
    pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); var ss = document.getElementById('rebStyleSel'); sel.value = 'fixed'; sel.dispatchEvent(new Event('change')); ss.value = 'equal'; ss.dispatchEvent(new Event('change')); })()")
    time.sleep(0.8)
    out["equal"] = pg.evaluate("(() => { var h3 = document.querySelector('#psecPool h3'); var ws = document.getElementById('wSum'); return { text: h3.textContent, wSumDisplay: ws.style.display }; })()")
    # 自定义 100%（10 只每只 10%）→ 无第二行
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } var i = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { if (i < 10) { x.value = '10'; x.dispatchEvent(new Event('change', { bubbles: true })); i++; } }); })()")
    time.sleep(0.8)
    out["custom_100"] = pg.evaluate("(() => { var ws = document.getElementById('wSum'); return { html: ws.innerHTML, hasSecondLine: ws.innerHTML.indexOf('<br>') >= 0 }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
