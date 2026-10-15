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
    # 再平衡模式：切 mode → 勾 2 标的 → 下一步 → run → 保存
    pg.evaluate("(() => { var md = document.getElementById('modeSel'); if (md) md.value = 'rebalance'; })()")
    time.sleep(0.8)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(2.5)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    pg.wait_for_function("var s = document.getElementById('runState'); s && s.textContent.indexOf('已更新') >= 0", timeout=120000)
    time.sleep(1)
    # 保存再平衡策略
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡验证T'; document.getElementById('saveSt').click(); })()")
    time.sleep(1.2)
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('再平衡验证T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(2)
    out["reb_tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["reb_tx_sample"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var t = tr[0]; return t.innerText.replace(/\\t/g,' | '); })()")
    out["reb_lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
