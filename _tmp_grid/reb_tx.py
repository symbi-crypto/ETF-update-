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
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var m = document.getElementById('rebWeightMode'); if (m) { m.value = 'fixed'; m.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.6)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .wIn').forEach(function (x) { x.value = '25'; x.dispatchEvent(new Event('input')); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) { st.value = '2017-01-01'; st.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    for i in range(25):
        time.sleep(8)
        if "已更新" in pg.evaluate("document.getElementById('runState').textContent"): break
    time.sleep(2)
    # 直接调引擎拿 res 结构
    out["res"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); var r = window.WufuEngine.backtest(window.WufuUI.getData(), p); return { n_trades: r.metrics.n_trades, trades: r.trades.length, tx: r.tx.length, firstTx: r.tx.slice(0, 3).map(function (t) { return t.d + ' ' + t.code + ' ' + t.side; }), lastTx: r.tx.slice(-3).map(function (t) { return t.d + ' ' + t.code + ' ' + t.side; }), totalReturn: r.metrics.total_return }; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
