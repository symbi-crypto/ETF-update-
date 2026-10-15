# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 360, "height": 780})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    def scan(tag):
        return pg.evaluate("((tag) => { var de = document.documentElement; var bad = []; document.querySelectorAll('div,table,section').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > 370 || r.left < -10)) { var id = el.id || String(el.className).slice(0, 20) || el.tagName; if (bad.length < 6) bad.push(id + ':' + Math.round(r.right)); } }); return { tag: tag, scrollW: de.scrollWidth, overflow: de.scrollWidth > 362, bad: bad }; })('" + tag + "')")
    out["rot1"] = scan("rot1")
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.5)
    pg.click("#nextBtn")
    time.sleep(2)
    out["rot2"] = scan("rot2")
    pg.click("#tabGrid")
    time.sleep(2)
    out["grid1"] = scan("grid1")
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; window.GridView.computeScores(); })()")
    time.sleep(12)
    out["grid1_scored"] = scan("grid1_scored")
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(1.5)
    out["grid2"] = scan("grid2")
    pg.click("#tabStrategies")
    time.sleep(3)
    out["strat"] = scan("strat")
    if pg.evaluate("document.querySelectorAll('#stListV .srow').length"):
        pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); if (rows.length) rows[0].click(); })()")
        time.sleep(4)
        out["detail"] = scan("detail")
    pg.click("#tabCorr")
    time.sleep(2)
    out["corr"] = scan("corr")
    pg.click("#tabIc")
    time.sleep(2)
    out["ic"] = scan("ic")
    pg.click("#tabCombo")
    time.sleep(2)
    out["combo"] = scan("combo")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
