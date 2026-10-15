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
    # 用完整策略结构注入（删 _warm_start 模拟老策略）
    s = json.load(open("_tmp_grid/strategy_dump.json"))
    s.pop("_warm_start", None)
    s["_saved_at"] = "2026-09-01T00:00:00.000Z"
    pg.evaluate("((s) => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); m['老策略完整T'] = s; localStorage.setItem('wufu_strategies_v1', JSON.stringify(m)); })(" + json.dumps(s) + ")")
    pg.reload(wait_until="load")
    time.sleep(3)
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('老策略完整T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(5)
    out["legacy_full"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); var kpi = document.getElementById('stKpis').innerText; var t = kpi.match(/总收益\\n([^\\n]+)/); return { redBar: el.style.display !== 'none', totalReturn: t ? t[1] : '?', hasTrade: document.querySelectorAll('#stPosBuy tbody tr').length, warmField: !JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}')['老策略完整T']._warm_start }; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
