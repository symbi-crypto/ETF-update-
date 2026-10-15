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
    pg.evaluate("(() => { var n = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { if (x.offsetParent !== null) { x.value = '25'; x.dispatchEvent(new Event('input', { bubbles: true })); n++; } }); return n; })()")
    time.sleep(0.6)
    out1 = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return { w: p.reb_weights }; })()")
    # ensureData 后再读
    pg.evaluate("(() => { window.__RD = null; window.WufuUI.ensureData(function () { window.__RD = window.WufuUI.getData(); }); })()")
    for i in range(40):
        time.sleep(2)
        if pg.evaluate("!!window.__RD"): break
    out2 = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return { w: p.reb_weights }; })()")
    # 构造完整 params 直测引擎（绕过 UI 状态问题）
    out3 = pg.evaluate("(() => { var d = window.__RD; var p = window.WufuUI.getParams(); p.reb_weights = { '513500.SH': 0.25, '518880.SH': 0.25, '511010.SH': 0.25, '511990.SH': 0.25 }; p.rebalance_mode = 'monthly'; p.start_date = '2017-01-01'; p.mode = 'rebalance'; var r = window.WufuEngine.backtest(d, p); return { totalReturn: (r.metrics.total_return * 100).toFixed(2) + '%', tx: r.tx.length, buy: r.tx.filter(function (t) { return t.side === 'BUY'; }).length, sell: r.tx.filter(function (t) { return t.side === 'SELL'; }).length, firstTx: r.tx.slice(0, 2).map(function (t) { return t.d + ' ' + t.code.slice(0, 8) + ' ' + t.side; }), lastTx: r.tx.slice(-2).map(function (t) { return t.d + ' ' + t.code.slice(0, 8) + ' ' + t.side; }) }; })()")
    b.close()
    print(json.dumps({"before_ensure": out1, "after_ensure": out2, "engine_fix_test": out3}, ensure_ascii=False, indent=1))
