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
    pg.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type in ("error", "warning") else None)
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # 保存轮动策略（快速流程）
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(2)
    pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; document.querySelector('#mfAddBtn').click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; document.querySelector('#sellBtn').click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
    time.sleep(0.5)
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '轮动日期T'; document.getElementById('saveSt').click(); })()")
    time.sleep(1)
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('轮动日期T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(3)
    # 改日期到 2026-06-01（极端晚）
    out["before"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); return { display: el.style.display, text: el.textContent }; })()")
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2026-06-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(4)
    out["after"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); var kpi = document.getElementById('stKpis').innerText; return { display: el.style.display, text: el.textContent.slice(0, 120), kpiSnip: kpi.slice(0, 100), hasFriendly: kpi.indexOf('回测失败') >= 0 || kpi.indexOf('区间过短') >= 0 }; })()")
    # 改更晚 2026-09-01（warmup 也过短）
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2026-09-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(4)
    out["after2"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); var kpi = document.getElementById('stKpis').innerText; return { display: el.style.display, text: el.textContent.slice(0, 140), kpiSnip: kpi.slice(0, 140), hasFriendly: kpi.indexOf('回测失败') >= 0 || kpi.indexOf('区间过短') >= 0 }; })()")
    # 改回正常
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2016-06-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(4)
    out["back"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); return { display: el.style.display, text: el.textContent.slice(0, 80), hasKpi: document.getElementById('stKpis').innerText.indexOf('总收益') >= 0 }; })()")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
