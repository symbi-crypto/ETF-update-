# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(1)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; var btn = document.querySelector('#mfAddBtn'); if (btn) btn.click(); })()")
    time.sleep(0.5)
    pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; var btn = document.querySelector('#sellBtn'); if (btn) btn.click(); })()")
    time.sleep(0.5)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
    time.sleep(1.5)
    out["main_kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:40].replace(chr(10), " | ")
    pg.click("#tabGrid")
    time.sleep(1.5)
    pg.evaluate("(() => { var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t = lb.innerText || ''; if (t.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    pg.click("#gridNextBtn")
    time.sleep(1)
    pg.click("#gridNext2Btn")
    time.sleep(1)
    out["run_visible"] = pg.evaluate("!!document.getElementById('gridRunBtn') && document.getElementById('gridRunBtn').offsetParent !== null")
    pg.click("#gridRunBtn")
    try:
        pg.wait_for_function("var s=document.getElementById('gridRunState'); s && s.textContent.indexOf('已更新') >= 0", timeout=150000)
        time.sleep(1.5)
        out["grid_run"] = pg.evaluate("document.getElementById('gridRunState').textContent")
        out["grid_kpi"] = pg.evaluate("var el=document.getElementById('gridKpis'); el ? el.innerText.slice(0,160) : 'no-kpis'")
    except Exception as e:
        out["grid_err"] = str(e)[:60]
        out["grid_state"] = pg.evaluate("var s=document.getElementById('gridRunState'); s ? s.textContent : 'no-el'")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
