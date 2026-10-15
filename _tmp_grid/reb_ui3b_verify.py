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
    pg.evaluate("(() => { window.rebalanceChecked = {}; })()")
    time.sleep(0.3)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    # 等比例：只显示 N只（wSum 隐藏）
    out["equal"] = pg.evaluate("(() => { var pc = document.getElementById('poolCount'); var ws = document.getElementById('wSum'); return { poolCount: pc.textContent, wSumDisplay: ws.style.display }; })()")
    # 自定义：N只 + 权重合计
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } document.querySelectorAll('#poolBox .wIn').forEach(function (x) { x.value = '50'; x.dispatchEvent(new Event('change', { bubbles: true })); }); })()")
    time.sleep(0.8)
    out["custom"] = pg.evaluate("(() => { var pc = document.getElementById('poolCount'); var ws = document.getElementById('wSum'); return { poolCount: pc.textContent, wSum: ws.textContent, wSumDisplay: ws.style.display }; })()")
    # inv_vol：同自定义
    pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); if (sel) { sel.value = 'inv_vol'; sel.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.8)
    out["invvol"] = pg.evaluate("(() => { var pc = document.getElementById('poolCount'); var ws = document.getElementById('wSum'); return { poolCount: pc.textContent, wSum: ws.textContent, wSumDisplay: ws.style.display }; })()")
    # 修正2 恢复：rebBandOn 存在 + 双勾选
    out["band_restored"] = pg.evaluate("(() => { var bo = document.getElementById('rebBandOn'); var po = document.getElementById('rebPeriodOn'); return { hasBandOn: !!bo, pOn: po && po.checked, bOn: bo && bo.checked }; })()")
    # 引擎触发（干净 4 标的高波动池）
    pg.evaluate("(() => { window.rebalanceChecked = {}; })()")
    time.sleep(0.3)
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
        return pg.evaluate("(() => { var p = window.WufuUI.getParams(); var r = window.WufuEngine.backtest(window.__RD, p); return { tx: r.tx.length, ret: (r.metrics.total_return * 100).toFixed(2) + '%', pOn: p.reb_period_on, bOn: p.reb_band_on }; })()")
    # 都勾 + dev 100 = 纯周期
    pg.evaluate("(() => { var d = document.getElementById('rebDevIn'); if (d) { d.value = '100'; d.dispatchEvent(new Event('change')); } var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); po.checked = true; bo.checked = true; })()")
    time.sleep(0.4)
    out["both_dev100"] = run()
    # 只勾偏离 + dev 1 = 纯偏离
    pg.evaluate("(() => { var d = document.getElementById('rebDevIn'); if (d) { d.value = '1'; d.dispatchEvent(new Event('change')); } var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); po.checked = false; bo.checked = true; })()")
    time.sleep(0.4)
    out["band_only"] = run()
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
