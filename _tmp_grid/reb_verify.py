# -*- coding: utf-8 -*-
"""再平衡视图权重配置回测验证"""
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
    pg.click("#tabRebalance")
    time.sleep(1.5)
    # 勾选 3 只 + 权重 30/30/40
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        var c = cb.getAttribute('data-c');
        if (c === '510300.SH' || c === '510500.SH' || c === '159915.SZ') cb.click();
      });
    })()""")
    time.sleep(1)
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .wIn').forEach(function (w) {
        var c = w.getAttribute('data-c');
        if (c === '510300.SH') w.value = 30; w.dispatchEvent(new Event('change', {bubbles:true}));
        if (c === '510500.SH') w.value = 30; w.dispatchEvent(new Event('change', {bubbles:true}));
        if (c === '159915.SZ') w.value = 40; w.dispatchEvent(new Event('change', {bubbles:true}));
      });
      document.getElementById('updateWSum') && document.getElementById('updateWSum').click ? document.getElementById('updateWSum').click() : null;
    })()""")
    time.sleep(1)
    gp = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return {mode:p.mode, codes:p.codes, wmode:p.reb_weight_mode, weights:p.reb_weights}; })()")
    print("params:", json.dumps(gp, ensure_ascii=False)[:400])
    pg.click("#nextBtn")
    time.sleep(3)
    rn = pg.query_selector("#runBtn")
    if rn: pg.click("#runBtn")
    else: pg.evaluate("(() => { window.WufuUI.run(); })()")
    try:
        pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(2)
        print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
        print("KPI:", pg.evaluate("document.getElementById('kpis').innerText")[:350])
    except Exception as e:
        print("超时:", str(e)[:80], "| runState:", pg.evaluate("document.getElementById('runState').textContent"), "| notice:", pg.evaluate("document.getElementById('notice').textContent"))
    print("errors:", json.dumps(errs[:8], ensure_ascii=False))
    b.close()
