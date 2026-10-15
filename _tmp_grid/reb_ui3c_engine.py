# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
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
    # 干净：fixed+equal + 4 标的高波动池
    pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); if (sel) { sel.value = 'fixed'; sel.dispatchEvent(new Event('change')); } var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'equal'; ss.dispatchEvent(new Event('change')); } window.rebalanceChecked = {}; })()")
    time.sleep(0.5)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) { st.value = '2017-01-01'; st.dispatchEvent(new Event('change')); } var chips = document.querySelectorAll('#rebChips button'); if (chips.length >= 3) chips[2].click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.__RD = null; window.WufuUI.ensureData(function () { window.__RD = window.WufuUI.getData(); }); })()")
    for i in range(50):
        time.sleep(2)
        if pg.evaluate("!!window.__RD"): break
    def run():
        return pg.evaluate("(() => { var p = window.WufuUI.getParams(); var r = window.WufuEngine.backtest(window.__RD, p); return { tx: r.tx.length, ret: (r.metrics.total_return * 100).toFixed(2) + '%', wm: p.reb_weight_mode, style: p.reb_style, pOn: p.reb_period_on, bOn: p.reb_band_on, w: p.reb_weights }; })()")
    # 都勾 + dev100（纯周期）
    pg.evaluate("(() => { var d = document.getElementById('rebDevIn'); if (d) { d.value = '100'; d.dispatchEvent(new Event('change')); } var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); po.checked = true; bo.checked = true; })()")
    time.sleep(0.4)
    out["both_dev100"] = run()
    # 都勾 + dev1（周期+偏离）
    pg.evaluate("(() => { var d = document.getElementById('rebDevIn'); if (d) { d.value = '1'; d.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.4)
    out["both_dev1"] = run()
    # 只勾偏离 + dev1（纯偏离）
    pg.evaluate("(() => { var po = document.getElementById('rebPeriodOn'); po.checked = false; })()")
    time.sleep(0.4)
    out["band_only_dev1"] = run()
    # 只勾周期 + dev100（纯周期）
    pg.evaluate("(() => { var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); var d = document.getElementById('rebDevIn'); po.checked = true; bo.checked = false; if (d) { d.value = '100'; d.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.4)
    out["period_only"] = run()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
