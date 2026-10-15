# -*- coding: utf-8 -*-
"""快速验证：弹窗 + 评分表 + step 前进"""
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.click("#tabGrid")
    time.sleep(1.5)
    out["help_btn"] = pg.evaluate("!!document.getElementById('gridScoreHelpBtn')")
    pg.click("#gridScoreHelpBtn")
    time.sleep(0.8)
    out["modal_open"] = pg.evaluate("document.getElementById('gridScoreHelpModal').style.display")
    out["modal_snip"] = pg.evaluate("document.getElementById('gridScoreHelpModal').innerText.slice(0, 120)")
    pg.click("#gridScoreHelpClose")
    time.sleep(0.5)
    out["modal_closed"] = pg.evaluate("document.getElementById('gridScoreHelpModal').style.display")
    # 勾选
    pg.evaluate("""(() => {
      var box = document.getElementById('gridPoolBox');
      var n = 0;
      box.querySelectorAll('label').forEach(function (lb) {
        var t = lb.innerText || '';
        if (t.indexOf('510300.SH') >= 0 || t.indexOf('159915.SZ') >= 0 || t.indexOf('518880.SH') >= 0) {
          var cb = lb.querySelector('input[type=checkbox]');
          if (cb && !cb.checked) { cb.click(); n++; }
        }
      });
    })()""")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    try:
        pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
        time.sleep(1)
        out["score_ok"] = True
        out["score_snip"] = pg.evaluate("document.getElementById('gridScoreTable').innerText.slice(0, 420)")
    except Exception as e:
        out["score_ok"] = False
        out["score_err"] = str(e)[:50]
        out["notice"] = pg.evaluate("var n=document.getElementById('notice'); n?n.textContent:''")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
