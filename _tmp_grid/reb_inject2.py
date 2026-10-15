# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
# 注入一个再平衡策略（等权 2 标的 + 周期 20 日）
REB = {
  "type": "reb",
  "mode": "rebalance",
  "codes": ["510300.SH", "159915.SZ"],
  "only_rotation_codes": [],
  "cooldown_days": 0,
  "factors": [{"kind": "roc", "window": 20, "weight": 1, "direction": 1}],
  "reb_weights": {},                 # 空=等权
  "reb_weight_mode": "fixed",
  "rebalance_mode": "period",
  "rebalance_interval": 20,
  "rebalance_unit": "日",
  "rank_n": 1, "rank_m": 2, "top_n": 2,
  "sell_conds": [], "hold_conds": [], "buy_add": [],
  "initial_capital": 1000000, "start_date": "2016-06-01",
  "benchmark": "H00300.CSI",
  "commission_rate": 0.00025, "slippage_rate": 0.0005, "min_commission": 0,
  "_saved_at": "2026-10-14T00:00:00.000Z"
}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.setItem('wufu_strategies_v1', JSON.stringify({ '再平衡注入T': " + json.dumps(REB, ensure_ascii=False) + " })); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=60000)
    time.sleep(2)
    out = {}
    pg.click("#tabStrategies")
    time.sleep(3)
    out["list_found"] = pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('再平衡注入T') >= 0) return rows[i].innerText.slice(0, 150); } return '未找到'; })()")
    pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); for (var i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').indexOf('再平衡注入T') >= 0) { rows[i].click(); return; } } })()")
    time.sleep(3)
    out["tx_count"] = pg.evaluate("document.querySelectorAll('#stTx tbody tr').length")
    out["tx_head"] = pg.evaluate("var el = document.getElementById('stTx'); el ? el.innerText.slice(0, 200) : 'no-stTx'")
    out["lot_check"] = pg.evaluate("(() => { var tr = document.querySelectorAll('#stTx tbody tr'); if (!tr.length) return null; var cells = tr[0].querySelectorAll('td'); var amtTxt = cells[5].innerText.replace(/,/g,''); var amt = Math.abs(parseInt(amtTxt)); var px = parseFloat(cells[3].innerText); var sh = parseInt(cells[4].innerText.replace(/,/g,'')); return { amt: amt, px: px, sh: sh, expected: Math.floor(amt/px/100)*100, ok: sh === Math.floor(amt/px/100)*100 }; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
