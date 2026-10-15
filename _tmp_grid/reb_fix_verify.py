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
    # ==== UI 显隐 ====
    out["ui"] = pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); var sb = document.getElementById('rebStyleBox'); var ss = document.getElementById('rebStyleSel'); var wlab = document.querySelectorAll('#poolBox .wlab')[0]; var title = document.querySelector('#rebSetPsec h3').textContent; var pOn = document.getElementById('rebPeriodOn'); var bOn = document.getElementById('rebBandOn'); var dev = document.getElementById('rebDevIn'); var r1 = { opts: Array.prototype.map.call(sel.options, function (o) { return o.value; }), sel: sel.value, styleBox: sb.style.display, styleSel: ss ? ss.value : null, wlab: wlab ? wlab.style.display : '?', title: title, pOn: pOn && pOn.checked, bOn: bOn && bOn.checked, hasDev: !!dev, noIdle: !document.getElementById('idleSel') }; sel.value = 'custom'; sel.dispatchEvent(new Event('change')); var r2 = { styleBox: sb.style.display, wlab: wlab ? wlab.style.display : '?' }; sel.value = 'fixed'; sel.dispatchEvent(new Event('change')); ss.value = 'custom'; ss.dispatchEvent(new Event('change')); var r3 = { wlabCustom: wlab ? wlab.style.display : '?' }; ss.value = 'equal'; ss.dispatchEvent(new Event('change')); var r4 = { wlabEqual: wlab ? wlab.style.display : '?' }; sel.value = 'inv_vol'; sel.dispatchEvent(new Event('change')); var r5 = { styleBoxInv: sb.style.display, wlabInv: wlab ? wlab.style.display : '?' }; sel.value = 'fixed'; sel.dispatchEvent(new Event('change')); return { def: r1, custom: r2, wCustom: r3, wEqual: r4, invvol: r5 }; })()")
    # ==== 引擎触发模式 ====
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) { st.value = '2017-01-01'; st.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    # 月频 chips
    pg.evaluate("(() => { var chips = document.querySelectorAll('#rebChips button'); if (chips.length >= 3) chips[2].click(); })()")
    time.sleep(0.6)
    # 加载数据
    pg.evaluate("(() => { window.__RD = null; window.WufuUI.ensureData(function () { window.__RD = window.WufuUI.getData(); }); })()")
    for i in range(50):
        time.sleep(2)
        if pg.evaluate("!!window.__RD"): break
    def run(mode):
        return pg.evaluate("(() => { var p = window.WufuUI.getParams(); var r = window.WufuEngine.backtest(window.__RD, p); return { tx: r.tx.length, ret: (r.metrics.total_return * 100).toFixed(2) + '%', pOn: p.reb_period_on, bOn: p.reb_band_on, dev: p.reb_dev_pct, wm: p.reb_weight_mode, style: p.reb_style, w: p.reb_weights }; })()")
    # 都勾 + dev 100 → 纯周期
    pg.evaluate("(() => { var d = document.getElementById('rebDevIn'); if (d) { d.value = '100'; d.dispatchEvent(new Event('change')); } var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); po.checked = true; bo.checked = true; })()")
    time.sleep(0.4)
    out["m_both_dev100"] = run(None)
    # 只勾周期（band off, dev 100）
    pg.evaluate("(() => { var bo = document.getElementById('rebBandOn'); bo.checked = false; })()")
    time.sleep(0.4)
    out["m_period_only"] = run(None)
    # 只勾偏离（period off, dev 1）
    pg.evaluate("(() => { var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); var d = document.getElementById('rebDevIn'); po.checked = false; bo.checked = true; if (d) { d.value = '1'; d.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.4)
    out["m_band_only"] = run(None)
    # 都勾 + dev 1
    pg.evaluate("(() => { var po = document.getElementById('rebPeriodOn'); po.checked = true; })()")
    time.sleep(0.4)
    out["m_both_dev1"] = run(None)
    # ==== 旧策略兼容：上轮 equal → fixed+equal ====
    out["old_equal"] = pg.evaluate("(() => { var p = { mode: 'rebalance', reb_weight_mode: 'equal', codes: ['513500.SH','518880.SH','511010.SH','511990.SH'] }; window.WufuUI.applyParams && window.WufuUI.applyParams(p); var sel = document.getElementById('rebWeightMode'); var ss = document.getElementById('rebStyleSel'); var p2 = window.WufuUI.getParams(); return { wm: sel.value, style: ss.value, w: p2.reb_weights }; })()")
    # ==== 轮动视图：rebSetPsec 隐藏 + 锚点 ====
    pg.click("#tabRotation")
    time.sleep(2)
    out["rot_ui"] = pg.evaluate("(() => { var rsp = document.getElementById('rebSetPsec'); var rsb = document.getElementById('rebStyleBox'); return { rebSetDisplay: rsp ? rsp.style.display : '?', styleBoxRot: rsb ? rsb.style.display : '?' }; })()")
    out["errs"] = errs[:6]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
