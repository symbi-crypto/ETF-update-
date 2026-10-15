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
    out = {}
    # 从轮动保存的策略克隆参数 → 改 mode=rebalance + reb_weights（借用已保存的轮动验证T）
    out["clone"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufuStored') || localStorage.getItem('etfStrategies') || '{}'); return Object.keys(m); })()")
    # 直接用 window 存储接口：loadStored/storeAll 不在 window —— 用 localStorage 键名探测
    out["storage_keys"] = pg.evaluate("Object.keys(localStorage)")
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
