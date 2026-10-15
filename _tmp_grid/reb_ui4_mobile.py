# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
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
    out["step1_equal"] = pg.evaluate("(() => { var sw = document.documentElement.scrollWidth; var pc = document.getElementById('poolCount'); var ws = document.getElementById('wSum'); return { scrollW: sw, noOverflow: sw <= 390, poolCount: pc.textContent, wSumDisplay: ws.style.display }; })()")
    # 自定义文字
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } document.querySelectorAll('#poolBox .wIn').forEach(function (x) { x.value = '50'; x.dispatchEvent(new Event('change', { bubbles: true })); }); })()")
    time.sleep(0.8)
    out["step1_custom"] = pg.evaluate("(() => { var pc = document.getElementById('poolCount'); var ws = document.getElementById('wSum'); return { poolCount: pc.textContent, wSum: ws.textContent }; })()")
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    out["step2"] = pg.evaluate("(() => { var sw = document.documentElement.scrollWidth; var rsp = document.getElementById('rebSetPsec'); var h3 = rsp ? rsp.querySelector('h3').textContent : '?'; var ru = document.getElementById('rebUnit'); var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); return { scrollW: sw, noOverflow: sw <= 390, h3: h3, rebUnit: ru ? ru.textContent : '?', pOn: po && po.checked, bOn: bo && bo.checked }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
