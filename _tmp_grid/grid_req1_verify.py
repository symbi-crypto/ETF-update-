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
    # 勾 510300 → 计算适配度评分
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { if (cb.getAttribute('data-c') === '510300.SH') cb.click(); }); })()")
    time.sleep(0.6)
    # 点「计算适配度评分」按钮
    pg.evaluate("(() => { var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var t = btns.filter(function (x) { return x.textContent.indexOf('计算适配度评分') >= 0; })[0]; if (t) t.click(); return !!t; })()")
    time.sleep(4)
    out["params_table"] = pg.evaluate("(() => { var t = document.getElementById('gridParamTable'); if (!t) return { err: 'no table' }; var rows = t.querySelectorAll('tbody tr'); var r = rows.length ? rows[0] : null; if (!r) return { err: 'no rows' }; var inp = function (k) { var e = r.querySelector('[data-k=' + k + ']'); return e ? e.value : null; }; var lower = parseFloat(inp('lower')), upper = parseFloat(inp('upper')), nLev = parseInt(inp('nLevels'), 10), step = parseFloat(inp('step')); var pctEl = r.querySelector('[data-k=nLevels] + span'); return { lower: lower, upper: upper, nLev: nLev, step: step, perPctText: pctEl ? pctEl.textContent : null, ok: lower > 0 && upper > lower && nLev >= 1 && pctEl && pctEl.textContent.indexOf('每格') >= 0 }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
