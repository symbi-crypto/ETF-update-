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
    # 网格保存流程
    pg.click("#tabGrid")
    time.sleep(1.5)
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    pg.click("#gridNextBtn")
    time.sleep(1.2)
    # 设名称 + 保存
    pg.evaluate("(() => { var n = document.getElementById('gridStName'); if (n) n.value = '网格验证T'; window.GridView.gridSave(); })()")
    time.sleep(1.5)
    # 我的策略 → 找网格行
    pg.click("#tabStrategies")
    time.sleep(3)
    out["grid_row_found"] = pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('网格验证T') >= 0) return { found: true, hasLk: !!rows[i].querySelector('.txLk'), txt: rows[i].innerText.slice(0, 160) }; } return { found: false, hasLk: false, txt: '' }; })()")
    # 点「详情·交易明细」
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { var lk = rows[i].querySelector('.txLk'); if (lk && (rows[i].innerText || '').indexOf('网格验证T') >= 0) { lk.click(); return; } } })()")
    time.sleep(2.5)
    out["grid_tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["grid_tx_head"] = pg.evaluate("document.getElementById('stTx').innerText.slice(0, 220)")
    out["grid_tx_lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    # 未复权价 vs 后复权价：抽查除息日（比较 raw_open 与后复权 open 是否不同——存在分红即不同）
    out["raw_vs_adj"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); var diff = 0, same = 0, n = Math.min(tr.length, 30); for (var i = 0; i < n; i++) { var cells = tr[i].querySelectorAll('td'); var code = (cells[2].innerText || ''); } return { note: '按行渲染无法直接比对后复权，改用数据层校验' }; })()")
    # 数据层校验：518880 后复权 open vs raw_open 不同日数（除息存在）
    out["data_raw_vs_adj"] = pg.evaluate("(() => { var D = window.WufuEngine ? null : null; return 'engine-not-window'; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
