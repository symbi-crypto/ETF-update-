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
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    # 自定义比例 40/30/20/10
    pg.evaluate("(() => { var m = document.getElementById('rebWeightMode'); if (m) { m.value = 'custom'; m.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var vals = { '513500.SH': '40', '518880.SH': '30', '511010.SH': '20', '511990.SH': '10' }; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { var c = x.getAttribute('data-code'); if (vals[c]) { x.value = vals[c]; x.dispatchEvent(new Event('change', { bubbles: true })); } }); })()")
    time.sleep(0.6)
    out["custom_params"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return { wm: p.reb_weight_mode, w: p.reb_weights }; })()")
    # 旧策略兼容：手动注入 fixed + 无比例 → 加载（applyParams 模拟）
    out["old_fix"] = pg.evaluate("(() => { var p = { mode: 'rebalance', reb_weight_mode: 'fixed', reb_weights: {}, codes: ['513500.SH','518880.SH','511010.SH','511990.SH'], start_date: '2017-01-01' }; var sel = document.getElementById('rebWeightMode'); var v1 = sel.value; window.WufuUI.applyParams && window.WufuUI.applyParams(p); var v2 = sel.value; var p2 = window.WufuUI.getParams(); return { before: v1, after: v2, w: p2.reb_weights }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
