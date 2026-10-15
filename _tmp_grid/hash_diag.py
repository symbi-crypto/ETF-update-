# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: print("PAGEERR:", e))
    pg.goto(BASE + "#/strategies", wait_until="domcontentloaded", timeout=120000)
    time.sleep(1)
    print("load 后 hash:", pg.evaluate("location.hash"))
    print("viewStrategies display:", pg.evaluate("document.getElementById('viewStrategies').style.display"))
    print("viewRotation display:", pg.evaluate("document.getElementById('viewRotation').style.display"))
    # 手动触发 boot 同步看是否生效
    pg.evaluate("(() => { if (window.hashView) { var v = window.hashView(); if (window.showView) window.showView(v); return v; } return 'no-fn'; })()")
    time.sleep(0.5)
    print("手动同步后 strategies display:", pg.evaluate("document.getElementById('viewStrategies').style.display"))
    print("hashView():", pg.evaluate("window.hashView()"))
    b.close()
