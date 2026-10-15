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
    # 第一步标的池文字（等比例）
    pg.evaluate("(() => { window.rebalanceChecked = {}; })()")
    time.sleep(0.3)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    out["pool_equal"] = pg.evaluate("(() => { var pc = document.getElementById('poolCount'); var ws = document.getElementById('wSum'); return { poolCount: pc.textContent, wSumDisplay: ws.style.display }; })()")
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    # 调仓设置标题 + rebUnit 位置
    out["title"] = pg.evaluate("(() => { var rsp = document.getElementById('rebSetPsec'); var h3 = rsp.querySelector('h3'); var ru = document.getElementById('rebUnit'); var row = ru ? ru.closest('div[style*=\"justify-content:space-between\"]') : null; var rowStyle = row ? row.style.cssText : ''; var ruInH3 = h3.contains(ru); var labelInRow = row ? row.contains(document.getElementById('rebPeriodOn')) : false; return { h3: h3.textContent, rebUnit: ru.textContent, ruInH3: ruInH3, labelInRow: labelInRow, rowFlex: rowStyle }; })()")
    # 周期切换同步（周→月）
    out["rebunit_before"] = pg.evaluate("document.getElementById('rebUnit').textContent")
    pg.evaluate("(() => { var chips = document.querySelectorAll('#rebChips button'); if (chips.length >= 3) chips[2].click(); })()")
    time.sleep(0.6)
    out["rebunit_after_month"] = pg.evaluate("document.getElementById('rebUnit').textContent")
    # 锚点切换（月末）
    pg.evaluate("(() => { var ac = document.querySelectorAll('#rebAnchorChips button'); if (ac.length >= 2) ac[1].click(); })()")
    time.sleep(0.6)
    out["rebunit_after_anchor"] = pg.evaluate("document.getElementById('rebUnit').textContent")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
