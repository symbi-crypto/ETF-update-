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
    pg.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # 保存轮动策略（默认起始 2016-06-01）
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
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '预热验证T'; document.getElementById('saveSt').click(); })()")
    time.sleep(1)
    # 进详情（未修改起始 → 基准结果）
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('预热验证T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(4)
    out["saved_warm"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); var s = m['预热验证T']; var kpi = document.getElementById('stKpis').innerText; var t = kpi.match(/总收益\\n([^\\n]+)/); return { warm: s._warm_start, start: s.start_date, totalReturn: t ? t[1] : '?', hasTrade: document.querySelectorAll('#stPosBuy tbody tr').length }; })()")
    # 场景①：改起始 2026-09-01（旧代码会 throw 区间过短，新代码应成功且有交易）
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2026-09-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(5)
    out["s1"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); var kpi = document.getElementById('stKpis').innerText; return { redBar: el.style.display !== 'none', redText: el.textContent.slice(0, 60), friendly: kpi.indexOf('回测失败') >= 0, hasKpi: kpi.indexOf('总收益') >= 0, txRows: document.querySelectorAll('#stPosBuy tbody tr').length, warm: JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}')['预热验证T']._warm_start }; })()")
    # 场景②：改起始 2026-12-01（晚于数据末 2026-10-09）→ 黄色提示不清空
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2026-12-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(4)
    out["s2"] = pg.evaluate("(() => { var el = document.getElementById('pageErr'); var kpi = document.getElementById('stKpis').innerText; var inp = document.getElementById('stStartIn'); return { redBar: el.style.display !== 'none', friendly: kpi.indexOf('起始日期晚于最新行情日期') >= 0 || kpi.indexOf('回测失败') >= 0, kept: inp.value, hasKpi: kpi.indexOf('总收益') >= 0 }; })()")
    # 场景③：改回 2016-06-01 → 结果与基准一致（_warm_start===start_date → 原逻辑）
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2016-06-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(5)
    out["s3"] = pg.evaluate("(() => { var kpi = document.getElementById('stKpis').innerText; var t = kpi.match(/总收益\\n([^\\n]+)/); return { totalReturn: t ? t[1] : '?', hasTrade: document.querySelectorAll('#stPosBuy tbody tr').length }; })()")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
