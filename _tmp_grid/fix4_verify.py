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
    pg.on("console", lambda m: errs.append("CONSOLE-ERR: " + m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # ---- 保存轮动策略 ----
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(2)
    pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; var btn = document.querySelector('#mfAddBtn'); if (btn) btn.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; var btn = document.querySelector('#sellBtn'); if (btn) btn.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
    time.sleep(1)
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '轮动T4'; document.getElementById('saveSt').click(); })()")
    time.sleep(1)
    # ---- 保存网格策略 ----
    pg.click("#tabGrid")
    time.sleep(1.5)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    pg.click("#gridNextBtn")
    time.sleep(1.2)
    pg.evaluate("(() => { var n = document.getElementById('gridStName'); if (n) n.value = '网格T4'; window.GridView.gridSave(); })()")
    time.sleep(1)
    # ---- 保存再平衡策略 ----
    pg.click("#tabRebalance")
    time.sleep(1.5)
    pg.evaluate("(() => { var box = document.getElementById('poolBox'); box.querySelectorAll('input.pick').forEach(function (cb) { var c = cb.getAttribute('data-c') || ''; if (c === '510300.SH' || c === '159915.SZ') { if (!cb.checked) cb.click(); } }); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var box = document.getElementById('poolBox'); box.querySelectorAll('input.wIn').forEach(function (inp) { var c = inp.getAttribute('data-code') || ''; if (c === '510300.SH') inp.value = 60; if (c === '159915.SZ') inp.value = 40; inp.dispatchEvent(new Event('change')); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(2)
    pg.evaluate("(() => { if (window.WufuUI) WufuUI.run(); })()")
    pg.wait_for_function("var s = document.getElementById('runState'); s && s.textContent.indexOf('已更新') >= 0", timeout=120000)
    time.sleep(0.5)
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡T4'; document.getElementById('saveSt').click(); })()")
    time.sleep(1)
    # ---- 场景4：三类型标签 ----
    pg.click("#tabStrategies")
    time.sleep(3)
    out["tags"] = pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); var r = {}; rows.forEach(function (row) { var t = row.querySelector('.tag'); var txt = (row.querySelector('.nm') || {}).innerText || ''; if (txt.indexOf('轮动T4') >= 0) r['轮动T4'] = t ? t.innerText + ':' + t.style.color : 'no-tag'; if (txt.indexOf('网格T4') >= 0) r['网格T4'] = t ? t.innerText + ':' + t.style.color : 'no-tag'; if (txt.indexOf('再平衡T4') >= 0) r['再平衡T4'] = t ? t.innerText + ':' + t.style.color : 'no-tag'; }); return r; })()")
    # ---- 场景2：当前交易表（轮动详情）----
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('轮动T4') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(3)
    out["cur_tx_has_date_sell"] = pg.evaluate("(() => { var el = document.getElementById('stPosBuy'); var t = el ? el.innerText : ''; return { hasDate: t.indexOf('201') >= 0, hasSell: t.indexOf('卖') >= 0, hasBuy: t.indexOf('买') >= 0, hasRaw: t.indexOf('未复权') >= 0, rows: document.querySelectorAll('#stPosBuy tbody tr').length }; })()")
    out["stTx_gone"] = pg.evaluate("!document.getElementById('stTx')")
    out["cur_tx_title"] = pg.evaluate("(() => { var cards = document.querySelectorAll('#stDetail .card h2'); var r = []; cards.forEach(function (h) { r.push(h.innerText.slice(0, 30)); }); return r; })()")
    out["cur_lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stPosBuy tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    # ---- 场景3：点网格条目进详情（不跳回测页）----
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('网格T4') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(3)
    out["grid_click_detail"] = pg.evaluate("(() => { var d = document.getElementById('stDetail'); return { detailOpen: d ? d.style.display !== 'none' : false, gridViewHidden: document.getElementById('viewGrid').style.display === 'none', hasKpi: document.getElementById('stKpis').innerText.length > 20, hasCurTx: document.getElementById('stPosBuy').innerText.length > 10 }; })()")
    # ---- 场景1：起始日期改 2026-06-01 → 无红条 + 友好提示 ----
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('轮动T4') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(2)
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2026-06-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(4)
    out["late_start"] = pg.evaluate("(() => { var red = false; document.querySelectorAll('*').forEach(function (el) { if ((el.innerText || '').indexOf('页面脚本异常') >= 0) red = true; }); var kpi = document.getElementById('stKpis').innerText; return { noRedBar: !red, friendlyHint: kpi.indexOf('回测失败') >= 0 || kpi.indexOf('区间过短') >= 0, kpiSnip: kpi.slice(0, 120) }; })()")
    # 改回正常日期 → 可回测
    pg.evaluate("(() => { var inp = document.getElementById('stStartIn'); if (inp) { inp.value = '2016-06-01'; inp.dispatchEvent(new Event('change')); } })()")
    time.sleep(4)
    out["back_normal"] = pg.evaluate("(() => { var kpi = document.getElementById('stKpis').innerText; return { hasTotal: kpi.indexOf('总收益') >= 0, hasCagr: kpi.indexOf('年化') >= 0 }; })()")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
