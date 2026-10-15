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
    out["step1"] = pg.evaluate("(() => { var sw = document.documentElement.scrollWidth; var wl = document.querySelectorAll('#poolBox .wlab')[0]; return { scrollW: sw, noOverflow: sw <= 390, wlab: wl ? wl.style.display : '?' }; })()")
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    out["step2"] = pg.evaluate("(() => { var sw = document.documentElement.scrollWidth; var rsp = document.getElementById('rebSetPsec'); var po = document.getElementById('rebPeriodOn'); var bo = document.getElementById('rebBandOn'); var dev = document.getElementById('rebDevIn'); return { scrollW: sw, noOverflow: sw <= 390, title: rsp ? rsp.querySelector('h3').textContent : '?', pOn: po && po.checked, bOn: bo && bo.checked, hasDev: !!dev }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
