# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.click("#tabGrid")
    time.sleep(1.5)
    # auto 模式评分（勾 512550 富时A50）
    pg.evaluate("(() => { var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t = lb.innerText || ''; if (t.indexOf('512550.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    out["gate_auto"] = pg.evaluate("(() => { var found=''; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { if ((lb.innerText||'').indexOf('512550.SH') >= 0) found = lb.innerText; }); return found; })()")
    # fixed 5000万 重评
    pg.evaluate("(() => { var r = document.querySelector('input[name=gridLiqMode][value=fixed]'); if (r) r.click(); })()")
    time.sleep(0.5)
    pg.click("#gridScoreBtn")
    time.sleep(1.5)
    out["gate_fixed"] = pg.evaluate("(() => { var found=''; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { if ((lb.innerText||'').indexOf('512550.SH') >= 0) found = lb.innerText; }); return found; })()")
    out["errs"] = errs[:4]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
