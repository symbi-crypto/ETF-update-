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
    pg.click("#tabRebalance")
    time.sleep(1.5)
    out["reb_view"] = pg.evaluate("document.getElementById('viewRebalance').style.display !== 'none'")
    # 再平衡页标的勾选（rebalance 视图的池）
    out["reb_pool_boxes"] = pg.evaluate("(() => { var ids = ['rebPoolBox','poolBox']; var r = {}; ids.forEach(function (i) { var el = document.getElementById(i); r[i] = el ? el.children.length : null; }); return r; })()")
    # 勾选（尝试 rebPoolBox 或 poolBox）
    pg.evaluate("(() => { var box = document.getElementById('rebPoolBox') || document.getElementById('poolBox'); box.querySelectorAll('input[type=checkbox]').forEach(function (cb) { var c = cb.getAttribute('data-c') || ''; if (c === '510300.SH' || c === '159915.SZ') { if (!cb.checked) cb.click(); } }); })()")
    time.sleep(0.8)
    out["reb_next_btn"] = pg.evaluate("!!document.getElementById('nextBtn') && document.getElementById('nextBtn').offsetParent !== null")
    if out["reb_next_btn"]:
        pg.click("#nextBtn")
        time.sleep(2.5)
        out["reb_run_ok"] = True
        pg.evaluate("(() => { if (window.WufuUI) WufuUI.run(); })()")
        try:
            pg.wait_for_function("var s = document.getElementById('runState'); s && s.textContent.indexOf('已更新') >= 0", timeout=120000)
            out["reb_run_state"] = pg.evaluate("document.getElementById('runState').textContent")
        except Exception as ex:
            out["reb_run_state"] = "超时: " + str(ex)[:60]
    else:
        out["reb_run_ok"] = False
    # 保存再平衡
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡验证T'; var sb = document.getElementById('saveSt'); if (sb) sb.click(); })()")
    time.sleep(1.2)
    pg.click("#tabStrategies")
    time.sleep(3)
    out["reb_list_found"] = pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('再平衡验证T') >= 0) return true; } return false; })()")
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('再平衡验证T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(2.5)
    out["reb_tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["reb_tx_head"] = pg.evaluate("var el = document.getElementById('stTx'); el ? el.innerText.slice(0, 180) : 'no-stTx'")
    out["reb_lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
