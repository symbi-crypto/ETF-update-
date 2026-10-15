# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.click("#tabRebalance")
    time.sleep(1.5)
    # 勾选（用 .pick）
    pg.evaluate("(() => { var box = document.getElementById('poolBox'); box.querySelectorAll('input.pick').forEach(function (cb) { var c = cb.getAttribute('data-c') || ''; if (c === '510300.SH' || c === '159915.SZ') { if (!cb.checked) cb.click(); } }); })()")
    time.sleep(0.8)
    out["reb_checked_after"] = pg.evaluate("(() => { var box = document.getElementById('poolBox'); var r = []; box.querySelectorAll('input.pick').forEach(function (cb) { if (cb.checked) r.push(cb.getAttribute('data-c')); }); return r; })()")
    # 填比例（510300=60 / 159915=40）→ 权重合计更新
    pg.evaluate("(() => { var box = document.getElementById('poolBox'); box.querySelectorAll('input.wIn').forEach(function (inp) { var c = inp.getAttribute('data-code') || ''; if (c === '510300.SH') inp.value = 60; if (c === '159915.SZ') inp.value = 40; inp.dispatchEvent(new Event('change')); }); })()")
    time.sleep(0.8)
    out["wsum"] = pg.evaluate("var el = document.getElementById('wSum'); el ? el.innerText : 'no-wSum'")
    # 下一步 → run → 保存
    pg.click("#nextBtn")
    time.sleep(2)
    pg.evaluate("(() => { if (window.WufuUI) WufuUI.run(); })()")
    try:
        pg.wait_for_function("var s = document.getElementById('runState'); s && s.textContent.indexOf('已更新') >= 0", timeout=120000)
        out["run_ok"] = True
    except Exception:
        out["run_ok"] = False
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡验证T'; var sb = document.getElementById('saveSt'); if (sb) sb.click(); })()")
    time.sleep(1)
    # 读保存参数
    out["saved"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); var k = Object.keys(m).filter(function (x) { return x.indexOf('再平衡') >= 0; }); var o = {}; k.forEach(function (x) { var p = m[x]; o[x] = { codes: p.codes, mode: p.mode, reb_weights: p.reb_weights, reb_weight_mode: p.reb_weight_mode }; }); return o; })()")
    # 进详情 → 交易明细
    pg.click("#tabStrategies")
    time.sleep(3)
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('再平衡验证T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(3)
    out["tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["tx_head"] = pg.evaluate("var el = document.getElementById('stTx'); el ? el.innerText.slice(0, 200) : 'no-stTx'")
    out["lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
