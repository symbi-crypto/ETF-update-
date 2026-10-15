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
    out["fold_toggle"] = pg.evaluate("(() => { var btn = document.querySelector('.sfold-h[data-g=\"tune\"]'); var body = document.getElementById('sfg-tune'); var r1 = body.classList.contains('hide'); btn.click(); var r2 = body.classList.contains('hide'); btn.click(); var r3 = body.classList.contains('hide'); return { before: r1, afterOpen: r2, afterClose: r3, label: document.querySelector('.sfold-h[data-g=\"tune\"] .sf-a').textContent }; })()")
    # 移动端（390）
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
