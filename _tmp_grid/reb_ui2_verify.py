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
    # 初始（等比例默认）→ wIn 隐藏（行渲染后）
    out["init_equal"] = pg.evaluate("(() => { var wl = document.querySelectorAll('#poolBox .wlab')[0]; var sel = document.getElementById('rebWeightMode'); var ss = document.getElementById('rebStyleSel'); return { wm: sel.value, style: ss.value, wlab: wl ? wl.style.display : '?', wSum: document.getElementById('wSum') ? document.getElementById('wSum').textContent : '?' }; })()")
    # 切自定义 → wIn 显示
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.6)
    out["custom_show"] = pg.evaluate("(() => { var wl = document.querySelectorAll('#poolBox .wlab')[0]; return { wlab: wl ? wl.style.display : '?' }; })()")
    # 切回等比例 → wIn 隐藏
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'equal'; ss.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.6)
    out["equal_hide"] = pg.evaluate("(() => { var wl = document.querySelectorAll('#poolBox .wlab')[0]; return { wlab: wl ? wl.style.display : '?' }; })()")
    # 等比例下勾选 4 标的 → 重渲染 → wIn 仍隐藏
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    out["after_pick_equal"] = pg.evaluate("(() => { var wl = document.querySelectorAll('#poolBox .wlab')[0]; var p = window.WufuUI.getParams(); return { wlab: wl ? wl.style.display : '?', w: p.reb_weights }; })()")
    # 修正2：布局（rebPeriodOn 单独 + rebBandOn 在偏离行）
    out["layout"] = pg.evaluate("(() => { var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); var poRow = po ? po.closest('.row, div[style*=\"display:flex\"]') : null; var boRow = bo ? bo.closest('.row') : null; var dev = document.getElementById('rebDevIn'); return { pOn: po && po.checked, bOn: bo && bo.checked, boInRow: boRow ? boRow.contains(dev) : false, poSolo: po ? (po.parentElement.parentElement.querySelectorAll('input[type=checkbox]').length === 1) : false, hasDev: !!dev }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
