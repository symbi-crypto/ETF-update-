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
    pg.click("#tabGrid")
    time.sleep(2)
    pg.wait_for_function("document.getElementById('gridPoolBox').children.length > 0", timeout=15000)
    pg.evaluate("(() => { if (window.GridView) { window.GridView.checked['510300.SH'] = true; window.GridView.renderPoolBox(); } return !!window.GridView; })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    time.sleep(5)
    out["params_table"] = pg.evaluate("(() => { var t = document.getElementById('gridParamTable'); if (!t) return { err: 'no table' }; var rows = t.querySelectorAll('tbody tr'); var r = rows.length ? rows[0] : null; if (!r) return { err: 'no rows', html: t.innerHTML.slice(0, 300) }; var inp = function (k) { var e = r.querySelector('[data-k=' + k + ']'); return e ? e.value : null; }; var lower = parseFloat(inp('lower')), upper = parseFloat(inp('upper')), nLev = parseInt(inp('nLevels'), 10), step = parseFloat(inp('step')); var pctEl = r.querySelector('[data-k=nLevels] + span'); var mid = (lower + upper) / 2; return { lower: lower, upper: upper, nLev: nLev, step: step, perPctText: pctEl ? pctEl.textContent : null, perPctCalc: (step / mid * 100), min1ok: (step / mid * 100) >= 1, nLevCalc: Math.max(1, Math.floor((upper - lower) / (mid * 0.01))) }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
