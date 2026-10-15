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
    def run_main():
        # 勾 510300 + 159915
        pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
        time.sleep(0.8)
        pg.click("#nextBtn")
        time.sleep(2)
        # 加 roc20 因子（rank）
        pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); if (u) u.value = 'rank'; var k = document.getElementById('mfAddKind'); if (k) k.value = 'roc'; var b2 = document.getElementById('mfAddBtn'); if (b2) b2.click(); })()")
        time.sleep(0.8)
        # 卖出：持有5日
        pg.evaluate("(() => { var sk = document.getElementById('sellKind'); if (sk) sk.value = 'hold_days'; var sv = document.getElementById('sellVal'); if (sv) sv.value = 5; var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
        time.sleep(0.8)
        pg.evaluate("(() => { window.WufuUI.run(); })()")
        pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(1)
    run_main()
    out["main_anchor"] = pg.evaluate("document.getElementById('kpis').innerText")[:50].replace(chr(10), " | ")
    # 保存轮动策略
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '轮动验证T'; document.getElementById('saveSt').click(); })()")
    time.sleep(1.2)
    # 进我的策略 → 点详情
    pg.click("#tabStrategies")
    time.sleep(2.5)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('轮动验证T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(1.5)
    out["rot_tx_rows"] = pg.evaluate("document.getElementById('stTx').innerText.slice(0, 300)")
    out["rot_tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["rot_tx_sample"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var t = tr[Math.floor(tr.length/2)]; return t.innerText.replace(/\\t/g,' | '); })()")
    # 验证数量口径：取第一行对比
    out["rot_lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    # 网格保存 + 详情
    pg.click("#tabGrid")
    time.sleep(1.5)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    pg.click("#gridNextBtn")
    time.sleep(1.2)
    pg.evaluate("(() => { if (window.GridView && GridView.gridSave) GridView.gridSave('网格验证T'); })()")
    time.sleep(1.2)
    pg.click("#tabStrategies")
    time.sleep(3)
    out["grid_row_txt"] = pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('网格验证T') >= 0) return rows[i].innerText.slice(0, 200); } return '未找到网格行'; })()")
    # 点网格行「详情·交易明细」
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { var lk = rows[i].querySelector('.txLk'); if (lk && (rows[i].innerText || '').indexOf('网格验证T') >= 0) { lk.click(); return; } } })()")
    time.sleep(2)
    out["grid_tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["grid_tx_sample"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var t = tr[0]; return t.innerText.replace(/\\t/g,' | '); })()")
    out["grid_tx_lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    out["grid_kpi_row"] = pg.evaluate("document.getElementById('stKpis').innerText.slice(0, 160)")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
