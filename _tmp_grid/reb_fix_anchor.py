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
    # 再平衡：fixed+custom 手填组装 + inv_vol 隐藏
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } var vals = { '513500.SH': '40', '518880.SH': '30', '511010.SH': '20', '511990.SH': '10' }; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { var c = x.getAttribute('data-code'); if (vals[c]) { x.value = vals[c]; x.dispatchEvent(new Event('change', { bubbles: true })); } }); })()")
    time.sleep(0.6)
    out["custom"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return { wm: p.reb_weight_mode, style: p.reb_style, w: p.reb_weights }; })()")
    pg.evaluate("(() => { var sel = document.getElementById('rebWeightMode'); if (sel) { sel.value = 'inv_vol'; sel.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    out["invvol"] = pg.evaluate("(() => { var sb = document.getElementById('rebStyleBox'); var wl = document.querySelectorAll('#poolBox .wlab')[0]; return { styleBox: sb.style.display, wlab: wl ? wl.style.display : '?', wm: window.WufuUI.getParams().reb_weight_mode }; })()")
    # 轮动锚点（干净状态）
    pg.click("#tabRotation")
    time.sleep(2)
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
    out["rot"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); var rsp = document.getElementById('rebSetPsec'); return { ret: m ? m[1] : '?', rebSetDisplay: rsp ? rsp.style.display : '?', runState: document.getElementById('runState').textContent }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
