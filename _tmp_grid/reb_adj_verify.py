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
    # ==== 再平衡视图：结构 ====
    pg.click("#tabRebalance")
    time.sleep(2)
    out["reb_ui"] = pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); var opts = Array.prototype.map.call(sel.options, function (o) { return o.value; }); var wInVis = document.querySelectorAll('#poolBox .wlab')[0] ? document.querySelectorAll('#poolBox .wlab')[0].style.display : '?'; var rsp = document.getElementById('rebSetPsec'); var hasDev = !!document.getElementById('rebDevIn'); var noIdle = !document.getElementById('idleSel'); return { opts: opts, selVal: sel.value, wlabDisplay: wInVis, rebSetDisplay: rsp ? rsp.style.display : '?', hasDevIn: hasDev, noIdleSel: noIdle }; })()")
    # 等比例→自定义切换（wIn 显隐）
    out["toggle"] = pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); sel.value = 'custom'; sel.dispatchEvent(new Event('change')); var d1 = document.querySelectorAll('#poolBox .wlab')[0] ? document.querySelectorAll('#poolBox .wlab')[0].style.display : '?'; sel.value = 'equal'; sel.dispatchEvent(new Event('change')); var d2 = document.querySelectorAll('#poolBox .wlab')[0] ? document.querySelectorAll('#poolBox .wlab')[0].style.display : '?'; return { custom: d1, equal: d2 }; })()")
    # ==== 引擎：偏离阈值触发对比 ====
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) { st.value = '2017-01-01'; st.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    # 周期 = 月（rebChips 第3个=月）+ dev 100（纯周期）
    pg.evaluate("(() => { var dev = document.getElementById('rebDevIn'); if (dev) { dev.value = '100'; dev.dispatchEvent(new Event('change')); } var chips = document.querySelectorAll('#rebChips button'); if (chips.length >= 3) chips[2].click(); })()")
    time.sleep(0.8)
    out["run_dev100"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); window.__RD = null; window.WufuUI.ensureData(function () { window.__RD = window.WufuUI.getData(); }); return { mode: p.rebalance_mode, dev: p.reb_dev_pct, weights: p.reb_weights }; })()")
    for i in range(50):
        time.sleep(2)
        if pg.evaluate("!!window.__RD"): break
    out["engine_dev100"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); var r = window.WufuEngine.backtest(window.__RD, p); return { tx: r.tx.length, ret: (r.metrics.total_return * 100).toFixed(2) + '%' }; })()")
    # dev=1（偏离触发）
    pg.evaluate("(() => { var dev = document.getElementById('rebDevIn'); if (dev) { dev.value = '1'; dev.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    out["engine_dev1"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); var r = window.WufuEngine.backtest(window.__RD, p); return { tx: r.tx.length, ret: (r.metrics.total_return * 100).toFixed(2) + '%' }; })()")
    # ==== 轮动视图：rebSetPsec 隐藏 + 锚点 ====
    pg.click("#tabRotation")
    time.sleep(2)
    out["rot_ui"] = pg.evaluate("(() => { var rsp = document.getElementById('rebSetPsec'); return { rebSetDisplay: rsp ? rsp.style.display : '?', noIdle: !document.getElementById('idleSel') }; })()")
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); var k = document.getElementById('mfAddKind'); var b = document.getElementById('mfAddBtn'); if (u) { u.value = 'rank'; u.dispatchEvent(new Event('change')); } if (k) { k.value = 'roc'; k.dispatchEvent(new Event('change')); } if (b) b.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var s = document.getElementById('sellKind'); var v = document.getElementById('sellVal'); if (s) { s.value = 'hold_days'; s.dispatchEvent(new Event('change')); } if (v) { v.value = '5'; v.dispatchEvent(new Event('change')); } var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    for i in range(30):
        time.sleep(8)
        if "已更新" in pg.evaluate("document.getElementById('runState').textContent"): break
    time.sleep(2)
    out["rot_anchor"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : '?'; })()")
    out["errs"] = errs[:6]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
