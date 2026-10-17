# -*- coding: utf-8 -*-
# 剥离后全链回归：加载无错 + 网格剥离检查 + tab 布局(桌面/390) + 主题色板 + 轮动8.04% + 再平衡详情 + 重名询问 + localStorage网格数据保留不展示
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"

out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    cons = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)

    # ---- 0) 加载错误 ----
    out["load_errs"] = errs[:6]
    out["console_errs"] = [c for c in cons if "favicon" not in c][:6]

    # ---- 1) 网格剥离检查 ----
    out["grid_removed"] = pg.evaluate("(() => { var ids = ['tabGrid','viewGrid','gridStep1','gridStep2','gridSaveBtn','gridScoreTable','gridParamTable','gridCalcHelpModal','gridScoreHelpModal','gridHoldDetail']; var found = ids.filter(function (x) { return document.getElementById(x); }); return { found: found, hasGridView: typeof window.GridView !== 'undefined', hasGridEngine: typeof window.WufuEngine !== 'undefined' && !!(window.WufuEngine && window.WufuEngine.backtestGrid), hasTabGrid: !!document.getElementById('tabGrid') }; })()")

    # ---- 2) tab 布局（桌面）----
    out["tabs_desktop"] = pg.evaluate("(() => { var btns = document.querySelectorAll('.nav button'); var names = Array.prototype.map.call(btns, function (x) { return x.textContent.trim(); }); var nav = document.querySelector('.nav'); return { names: names, count: btns.length, scrollW: nav.scrollWidth, clientW: nav.clientWidth, overflow: nav.scrollWidth > nav.clientWidth + 1 }; })()")

    # ---- 3) 主题提亮色板 ----
    out["theme"] = pg.evaluate("(() => { var s = getComputedStyle(document.body); var card = document.querySelector('.card'); var cs = card ? getComputedStyle(card) : null; return { bg: s.backgroundColor, card: cs ? cs.backgroundColor : '?', text: s.color }; })()")

    # ---- 4) localStorage 网格数据保留 + 列表过滤 ----
    out["ls_grid_kept"] = pg.evaluate("(() => { try { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); m['__测试网格策略__'] = { type: 'grid', grid: { codes: ['510300.SH'], settings: { capital: 1000000, period_n: 12, period_unit: '周', mgmt: 'B' } } }; localStorage.setItem('wufu_strategies_v1', JSON.stringify(m)); } catch (e) {} return true; })()")
    pg.click("#tabStrategies")
    time.sleep(2)
    out["list_filter"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); var keys = Object.keys(m); var gridKeys = keys.filter(function (k) { return m[k] && m[k].type === 'grid'; }); var rows = document.querySelectorAll('#stListV .srow'); var rowTexts = Array.prototype.map.call(rows, function (r) { return r.textContent; }); var shownGrid = rowTexts.filter(function (t) { return t.indexOf('__测试网格策略__') >= 0; }); return { storedGridKeys: gridKeys, shownGridRows: shownGrid.length, totalRows: rows.length }; })()")
    # 清理测试条目（保留数据原则：删测试条目本身）
    pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); delete m['__测试网格策略__']; localStorage.setItem('wufu_strategies_v1', JSON.stringify(m)); })()")

    # ---- 5) 轮动锚点 8.04% ----
    pg.click("#tabRotation")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); var k = document.getElementById('mfAddKind'); var b = document.getElementById('mfAddBtn'); if (u) { u.value = 'rank'; u.dispatchEvent(new Event('change')); } if (k) { k.value = 'roc'; k.dispatchEvent(new Event('change')); } if (b) b.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var s = document.getElementById('sellKind'); var v = document.getElementById('sellVal'); if (s) { s.value = 'hold_days'; s.dispatchEvent(new Event('change')); } if (v) { v.value = '5'; v.dispatchEvent(new Event('change')); } var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    done = False
    for i in range(30):
        time.sleep(8)
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st: done = True; break
    time.sleep(2)
    out["rot"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return { ret: m ? m[1] : '?', done: " + str(done).lower() + ", runState: document.getElementById('runState').textContent.slice(0,40) }; })()")

    # ---- 6) 再平衡：custom 40/30/20/10 → run → 保存（重名询问另存）→ 详情持仓比例 ----
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } var vals = { '513500.SH': '40', '518880.SH': '30', '511010.SH': '20', '511990.SH': '10' }; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { var c = x.getAttribute('data-code'); if (vals[c]) { x.value = vals[c]; x.dispatchEvent(new Event('change', { bubbles: true })); } }); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { document.getElementById('nextBtn').click(); })()")
    time.sleep(4)
    out["reb_D"] = pg.evaluate("(() => { return { calLen: (window.D && window.D.calendar) ? window.D.calendar.length : -1, hasRebRunState: !!document.getElementById('rebRunState') }; })()")
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    done2 = False
    for i in range(30):
        time.sleep(8)
        st2 = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st2: done2 = True; break
    time.sleep(2)
    out["reb"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return { ret: m ? m[1] : '?', done: " + str(done2).lower() + " }; })()")
    # 保存（重名询问：先存一次，再存同名触发 dupModal）
    pg.evaluate("(() => { document.getElementById('stName').value = '剥离后再平衡测试'; document.getElementById('saveSt').click(); })()")
    time.sleep(1.5)
    out["dup1"] = pg.evaluate("(() => { return { modal: !!document.getElementById('dupModal') && document.getElementById('dupModal').style.display !== 'none' }; })()")
    # 同名再存 → 弹窗
    pg.evaluate("(() => { document.getElementById('stName').value = '剥离后再平衡测试'; document.getElementById('saveSt').click(); })()")
    time.sleep(1.5)
    out["dup2"] = pg.evaluate("(() => { var d = document.getElementById('dupModal'); return { shown: !!d && d.style.display !== 'none', hasOverwrite: !!document.getElementById('dupOverwrite'), hasNew: !!document.getElementById('dupNew'), hasCancel: !!document.getElementById('dupCancel') }; })()")
    # 选「保存为新策略」
    pg.evaluate("(() => { document.getElementById('dupNew').click(); })()")
    time.sleep(1.5)
    out["dup_new"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return { keys: Object.keys(m), hasSuffix: Object.keys(m).filter(function (k) { return k.indexOf('剥离后再平衡测试') >= 0; }) }; })()")
    # 详情持仓比例
    pg.click("#tabStrategies")
    time.sleep(2)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); if (rows.length) { rows[0].click(); } })()")
    time.sleep(5)
    out["detail"] = pg.evaluate("(() => { var pb = document.getElementById('stPosBuy'); var tx = document.getElementById('stTx'); var kpi = document.getElementById('stKpis'); return { posText: pb ? pb.textContent.slice(0, 200) : '?', hasHolding: pb ? (pb.textContent.indexOf('当前持仓') >= 0 && pb.textContent.indexOf('空仓') < 0) : false, kpiLen: kpi ? kpi.textContent.length : 0 }; })()")
    # 清理测试策略
    pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); Object.keys(m).forEach(function (k) { if (k.indexOf('剥离后再平衡测试') >= 0) delete m[k]; }); localStorage.setItem('wufu_strategies_v1', JSON.stringify(m)); })()")

    out["errs"] = errs[:6]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
