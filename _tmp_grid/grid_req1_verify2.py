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
    pg.wait_for_function("document.getElementById('gridPoolBox').children.length > 0 || document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('gridPoolBox').children.length > 0 || document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.click("#tabGrid")
    time.sleep(2)
    # 网格标的池：勾 510300
    out["poolbox"] = pg.evaluate("(() => { var box = document.getElementById('gridPoolBox'); var picks = box ? box.querySelectorAll('.pick') : []; var total = box ? box.children.length : 0; var has510 = 0; picks.forEach(function (cb) { if (cb.getAttribute('data-c') === '510300.SH') has510++; }); return { total: total, pickCount: picks.length, has510: has510 }; })()")
    pg.evaluate("(() => { var box = document.getElementById('gridPoolBox'); var picks = box ? box.querySelectorAll('.pick') : []; var done = 0; picks.forEach(function (cb) { if (cb.getAttribute('data-c') === '510300.SH') { cb.click(); done++; } }); return done; })()")
    time.sleep(0.8)
    pg.click("#gridScoreBtn")
    time.sleep(5)
    out["params_table"] = pg.evaluate("(() => { var t = document.getElementById('gridParamTable'); if (!t) return { err: 'no table', text: document.getElementById('gridScoreTable') ? document.getElementById('gridScoreTable').textContent.slice(0, 120) : '' }; var rows = t.querySelectorAll('tbody tr'); var r = rows.length ? rows[0] : null; if (!r) return { err: 'no rows', html: t.innerHTML.slice(0, 200) }; var inp = function (k) { var e = r.querySelector('[data-k=' + k + ']'); return e ? e.value : null; }; var lower = parseFloat(inp('lower')), upper = parseFloat(inp('upper')), nLev = parseInt(inp('nLevels'), 10), step = parseFloat(inp('step')); var pctEl = r.querySelector('[data-k=nLevels] + span'); return { lower: lower, upper: upper, nLev: nLev, step: step, perPctText: pctEl ? pctEl.textContent : null, mid: (lower + upper) / 2, perPctCalc: step / ((lower + upper) / 2) * 100, ok: lower > 0 && upper > lower && nLev >= 1 && pctEl && pctEl.textContent.indexOf('每格') >= 0 }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
