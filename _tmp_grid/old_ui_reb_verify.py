# -*- coding: utf-8 -*-
"""拆分前（备份版）UI 再平衡同配置 KPI：3 只 30/30/40"""
import json, time, glob
from playwright.sync_api import sync_playwright
bak = sorted(glob.glob("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_backup/index-before-split-*.html"))
if not bak:
    print("NO_BACKUP"); raise SystemExit
HTML = "file://" + bak[-1]
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    # 旧 UI：modeSel 切再平衡
    pg.evaluate("""(() => {
      var s = document.getElementById('modeSel');
      if (s) { s.value = 'rebalance'; s.dispatchEvent(new Event('change', {bubbles:true})); }
    })()""")
    time.sleep(1.5)
    out = {}
    out["mode_sel"] = pg.evaluate("document.getElementById('modeSel') ? document.getElementById('modeSel').value : 'no-modeSel'")
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        var c = cb.getAttribute('data-c');
        if (c === '510300.SH' || c === '510500.SH' || c === '159915.SZ') cb.click();
      });
      document.querySelectorAll('#poolBox .wIn').forEach(function (w) {
        var c = w.getAttribute('data-code');
        if (c === '510300.SH') { w.value = 30; w.dispatchEvent(new Event('change', {bubbles:true})); }
        if (c === '510500.SH') { w.value = 30; w.dispatchEvent(new Event('change', {bubbles:true})); }
        if (c === '159915.SZ') { w.value = 40; w.dispatchEvent(new Event('change', {bubbles:true})); }
      });
    })()""")
    time.sleep(1)
    out["weights"] = pg.evaluate("window.WufuUI.getParams().reb_weights")
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { try { window.WufuUI.run(); } catch(e) { document.getElementById('runBtn').click(); } })()")
    try:
        pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(2)
        out["kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:90]
    except Exception as e:
        out["err"] = str(e)[:60]; out["state"] = pg.evaluate("document.getElementById('runState').textContent")
        out["notice"] = pg.evaluate("document.getElementById('notice').textContent")
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
