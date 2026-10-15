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
    out = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); var r = {}; r['再平衡验证T'] = m['再平衡验证T'] ? { codes: m['再平衡验证T'].codes, mode: m['再平衡验证T'].mode, reb_weights: m['再平衡验证T'].reb_weights, reb_weight_mode: m['再平衡验证T'].reb_weight_mode, rebalance_days: m['再平衡验证T'].rebalance_days, type: m['再平衡验证T'].type } : null; r.keys = Object.keys(m); return r; })()")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    b.close()
