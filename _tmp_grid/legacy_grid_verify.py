# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # 注入老策略（无 _warm_start）→ 详情应正常回测
    pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); m['老策略兼容T'] = { codes: ['510300.SH','159915.SZ'], mode: 'rotation', start_date: '2016-06-01', end_date: '2026-10-09', factors: [{kind:'roc',window:20,usage:'rank'}], sell_conds: [{kind:'hold_days',value:5}], initial_capital: 1000000, _saved_at: new Date().toISOString() }; localStorage.setItem('wufu_strategies_v1', JSON.stringify(m)); })()")
    pg.reload(wait_until="load")
    time.sleep(3)
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('老策略兼容T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(5)
    out["legacy"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); var kpi = document.getElementById('stKpis').innerText; var t = kpi.match(/总收益\\n([^\\n]+)/); return { redBar: el.style.display !== 'none', totalReturn: t ? t[1] : '?', hasTrade: document.querySelectorAll('#stPosBuy tbody tr').length }; })()")
    # 网格回归：518880 阈值50 → 评分 → 回测设置 → run
    pg.click("#tabGrid")
    time.sleep(1.5)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    pg.click("#gridNextBtn")
    time.sleep(1.5)
    out["grid_setting"] = pg.evaluate("(() => { var vol = document.getElementById('gridVolWin'); var inv = document.getElementById('gridInvest'); var run = document.getElementById('gridRunBtn'); return { volWin: vol ? vol.value : 'no', invest: inv ? inv.value : 'no', runBtn: !!run }; })()")
    pg.click("#gridRunBtn")
    pg.wait_for_function("document.getElementById('gridResult').innerText.indexOf('518880') >= 0", timeout=120000)
    time.sleep(1.5)
    out["grid_result"] = pg.evaluate("(() => { var t = document.getElementById('gridResult').innerText; var tr = (t.match(/累计收益?\\s*([-+0-9.]+%)/) || [])[1]; var dd = (t.match(/最大回撤\\s*([-+0-9.]+%)/) || [])[1]; return { snip: t.slice(0, 220), total: tr, dd: dd }; })()")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
