# -*- coding: utf-8 -*-
"""评分模型 UI 验证：弹窗打开/关闭、评分表、流动性剔除、回测"""
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # ① 网格页 → 评分标准弹窗
    pg.click("#tabGrid")
    time.sleep(1.5)
    out["help_btn"] = pg.evaluate("!!document.getElementById('gridScoreHelpBtn')")
    pg.click("#gridScoreHelpBtn")
    time.sleep(1)
    out["modal_open"] = pg.evaluate("document.getElementById('gridScoreHelpModal').style.display === 'block'")
    out["modal_text"] = pg.evaluate("document.getElementById('gridScoreHelpModal').innerText.slice(0, 160)")
    pg.click("#gridScoreHelpClose")
    time.sleep(0.5)
    out["modal_closed"] = pg.evaluate("document.getElementById('gridScoreHelpModal').style.display === 'none'")
    # ② 评分（勾 3 只主流）
    pg.evaluate("""(() => {
      document.querySelectorAll('#gridPoolBox .pick, #gridPoolBox input[type=checkbox]').forEach(function (cb) {
        var c = cb.getAttribute('data-c') || cb.getAttribute('data-code') || '';
        if (c === '510300.SH' || c === '159915.SZ' || c === '518880.SH') cb.click();
      });
    })()""")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    try:
        pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
        time.sleep(1)
        out["score_table"] = pg.evaluate("document.getElementById('gridScoreTable').innerText.slice(0, 300)")
    except Exception as e:
        out["score_err"] = str(e)[:60]
        out["notice"] = pg.evaluate("document.getElementById('notice').textContent")
    # ③ 网格回测跑通
    pg.evaluate("(() => { var n = document.getElementById('gridNextBtn'); if (n) n.click(); })()")
    time.sleep(1.5)
    # 逐步进入回测设置步（两步式：选标的→压力测试→回测设置）
    pg.evaluate("(() => { var n = document.getElementById('gridNextBtn'); if (n) n.click(); })()")
    time.sleep(1)
    pg.evaluate("(() => { var n = document.getElementById('gridNext2Btn'); if (n) n.click(); })()")
    time.sleep(1.5)
    out["run_visible"] = pg.evaluate("!!document.getElementById('gridRunBtn') && document.getElementById('gridRunBtn').offsetParent !== null")
    pg.click("#gridRunBtn")
    try:
        pg.wait_for_function("document.getElementById('gridRunState') && document.getElementById('gridRunState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(1)
        out["grid_run"] = pg.evaluate("document.getElementById('gridRunState').textContent")
    except Exception as e:
        out["grid_err"] = str(e)[:60]
        out["grid_state"] = pg.evaluate("document.getElementById('gridRunState') ? document.getElementById('gridRunState').textContent : 'no-el'")
    b.close()
    out["console_errors"] = errs[:8]
    print(json.dumps(out, ensure_ascii=False, indent=1))
