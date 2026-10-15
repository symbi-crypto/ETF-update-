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
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var m = document.getElementById('rebWeightMode'); if (m) { m.value = 'fixed'; m.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.4)
    pg.evaluate("(() => { var n = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { if (x.offsetParent !== null) { x.value = '25'; x.dispatchEvent(new Event('input', { bubbles: true })); n++; } }); return n; })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) { st.value = '2017-01-01'; st.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    # 直接调（ensureData 后）
    pg.evaluate("(() => { window.__RD = null; window.WufuUI.ensureData(function () { window.__RD = window.WufuUI.getData(); }); })()")
    for i in range(40):
        time.sleep(2)
        if pg.evaluate("!!window.__RD"):
            break
    out = pg.evaluate("(() => { var d = window.__RD; if (!d) return { noD: true }; var p = window.WufuUI.getParams(); var t0 = Date.now(); var r = window.WufuEngine.backtest(d, p); return { ms: Date.now() - t0, totalReturn: (r.metrics.total_return * 100).toFixed(2) + '%', n_trades: r.metrics.n_trades, tx: r.tx.length, buyTx: r.tx.filter(function (t) { return t.side === 'BUY'; }).length, sellTx: r.tx.filter(function (t) { return t.side === 'SELL'; }).length, reb: { mode: p.rebalance_mode, interval: p.rebalance_interval, weights: p.reb_weights }, firstTx: r.tx.slice(0, 3).map(function (t) { return t.d + ' ' + t.code.slice(0, 8) + ' ' + t.side; }), lastTx: r.tx.slice(-3).map(function (t) { return t.d + ' ' + t.code.slice(0, 8) + ' ' + t.side; }) }; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
