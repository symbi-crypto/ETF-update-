# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # 轮动 step2：panel 顺序
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.5)
    pg.click("#nextBtn")
    time.sleep(2)
    out["panel_order"] = pg.evaluate("(() => { var panel = document.getElementById('panel'); var hs = panel.querySelectorAll('.sfold-h'); var r = []; hs.forEach(function (h) { r.push((h.querySelector('b') || {}).innerText || h.getAttribute('data-g')); }); var step2 = document.getElementById('step2'); return { panel: r, step2HasFac: !!step2.querySelector('[data-g=fac]'), step2Top: (step2.innerText || '').slice(0, 60) }; })()")
    # 默认展开状态：fac 开 / core 关
    out["default_fold"] = pg.evaluate("(() => { var f = document.getElementById('sfg-fac'); var c = document.getElementById('sfg-core'); return { facOpen: f ? !f.classList.contains('hide') : 'no', coreOpen: c ? !c.classList.contains('hide') : 'no' }; })()")
    # 展开/收起交互
    pg.evaluate("(() => { var h = document.querySelector('.sfold-h[data-g=core]'); if (h) h.click(); })()")
    time.sleep(0.8)
    out["after_core_click"] = pg.evaluate("(() => { var c = document.getElementById('sfg-core'); return c ? !c.classList.contains('hide') : 'no'; })()")
    # 切再平衡：fac 隐藏、core 平铺
    pg.click("#tabRebalance")
    time.sleep(2)
    out["reb_mode"] = pg.evaluate("(() => { var f = document.getElementById('sfg-fac'); var c = document.getElementById('sfg-core'); var hs = document.querySelectorAll('.sfold-h'); var vis = []; hs.forEach(function (h) { vis.push(getComputedStyle(h).display); }); return { facHidden: f ? f.classList.contains('hide') : 'no', coreOpen: c ? !c.classList.contains('hide') : 'no', hDisplay: vis }; })()")
    # 切回轮动：恢复
    pg.click("#tabRotation")
    time.sleep(2)
    out["back_rot"] = pg.evaluate("(() => { var f = document.getElementById('sfg-fac'); var hs = document.querySelectorAll('.sfold-h'); return { facOpen: f ? !f.classList.contains('hide') : 'no', hCount: hs.length }; })()")
    # 390 溢出复扫
    out["overflow"] = pg.evaluate("(() => { var de = document.documentElement; return { scrollW: de.scrollWidth }; })()")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
