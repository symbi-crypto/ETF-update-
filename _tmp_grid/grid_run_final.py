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
    pg.click("#tabGrid")
    time.sleep(1.5)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    out["score_snip"] = pg.evaluate("document.getElementById('gridScoreTable').innerText.slice(0, 300)")
    pg.click("#gridNextBtn")
    time.sleep(1)
    pg.click("#gridNext2Btn")
    time.sleep(1)
    pg.click("#gridRunBtn")
    try:
        pg.wait_for_function("var s=document.getElementById('gridRunState'); s && (s.textContent.indexOf('完成') >= 0 || s.textContent.indexOf('已更新') >= 0)", timeout=150000)
        time.sleep(1.5)
        out["grid_run"] = pg.evaluate("document.getElementById('gridRunState').textContent")
        out["grid_kpi"] = pg.evaluate("var el=document.getElementById('gridKpis'); el ? el.innerText.slice(0,180) : 'no-kpis'")
    except Exception as e:
        out["grid_err"] = str(e)[:60]
        out["grid_state"] = pg.evaluate("var s=document.getElementById('gridRunState'); s ? s.textContent : 'no-el'")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
