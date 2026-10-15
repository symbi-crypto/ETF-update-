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
    pg.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    def scan(tag):
        return pg.evaluate("((tag) => { var de = document.documentElement; var w = de.scrollWidth; var bad = []; document.querySelectorAll('div,table,section,aside,main').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > 402 || r.left < -12)) { var id = el.id || el.className || el.tagName; if (bad.length < 10) bad.push({ id: String(id).slice(0,50), left: Math.round(r.left), right: Math.round(r.right), sw: el.scrollWidth, cw: el.clientWidth }); } }); return { tag: tag, scrollW: w, overflow: w > 392, bad: bad }; })('" + tag + "')")
    # 注入策略 + 打开详情
    pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); if (!m['溢出详情T']) m['溢出详情T'] = { codes: ['510300.SH','159915.SZ'], mode: 'rotation', start_date: '2016-06-01', end_date: '2026-10-09', factors: [{kind:'roc',window:20,usage:'rank'}], initial_capital: 1000000, _saved_at: new Date().toISOString() }; localStorage.setItem('wufu_strategies_v1', JSON.stringify(m)); })()")
    pg.reload(wait_until="load")
    time.sleep(3)
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('溢出详情T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(5)
    out["detail"] = scan("detail")
    # 因子说明弹窗
    pg.click("#tabRotation")
    time.sleep(2)
    pg.evaluate("(() => { var b = document.getElementById('factorHelpBtn'); if (b) b.click(); })()")
    time.sleep(1.5)
    out["factor_modal"] = scan("factor_modal")
    pg.evaluate("(() => { var mo = document.getElementById('factorHelpModal'); if (mo) mo.style.display = 'none'; })()")
    time.sleep(0.5)
    # 网格评分（长等待诊断）
    pg.click("#tabGrid")
    time.sleep(2)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; })()")
    pg.evaluate("(() => { var btn = document.getElementById('gridScoreBtn'); btn.click(); })()")
    try:
        pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=100000)
        out["grid_score_ok"] = True
        out["grid_scored"] = scan("grid_scored")
    except Exception as e:
        out["grid_score_ok"] = False
        out["grid_score_err"] = pg.evaluate("(() => { var t = document.getElementById('gridScoreTable'); return t ? t.innerHTML.slice(0, 200) : 'no-table'; })()")
    # 网格回测结果（若可）
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(1.5)
    out["grid_step2"] = scan("grid_step2")
    pg.evaluate("(() => { var rb = document.getElementById('gridRunBtn'); if (rb) rb.click(); })()")
    try:
        pg.wait_for_function("document.getElementById('gridResult').innerText.length > 100", timeout=120000)
        time.sleep(1)
        out["grid_result"] = scan("grid_result")
    except Exception as e:
        out["grid_result_ok"] = False
    out["errs"] = errs[:10]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
