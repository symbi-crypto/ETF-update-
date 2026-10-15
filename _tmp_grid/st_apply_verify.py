# -*- coding: utf-8 -*-
"""我的策略：保存/应用三类型（rotation/rebalance/grid）"""
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
    # ① 轮动页保存策略
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510300.SH' || cb.getAttribute('data-c') === '159915.SZ') cb.click();
      });
    })()""")
    time.sleep(1)
    out["stSave_exist"] = pg.evaluate("!!document.getElementById('stSaveBtn')")
    # 打开我的策略面板
    pg.click("#tabStrategies")
    time.sleep(1.5)
    out["strategies_view"] = pg.evaluate("document.getElementById('viewStrategies').style.display !== 'none'")
    # 返回轮动（保存按钮在回测视图）
    pg.click("#tabRotation")
    time.sleep(1.5)
    # 保存按钮（若有）
    sv = pg.query_selector("#stSaveBtn")
    if sv:
        pg.evaluate("""(() => {
          var inp = document.getElementById('stName');
          if (inp) { inp.value = '验-轮动2标'; }
          var btn = document.getElementById('stSaveBtn');
          if (btn) btn.click();
        })()""")
        time.sleep(1)
        out["saved_rotation"] = pg.evaluate("(() => { var ls = localStorage.getItem('wufu_strategies_v1'); if (!ls) return 'no-ls'; try { var a = JSON.parse(ls); return a.length ? (a[a.length-1].type || a[a.length-1].mode || 'no-type') : 'empty'; } catch(e) { return 'parse-err'; } })()")
    else:
        out["saved_rotation"] = "no-save-btn"
    # ② 再平衡页保存
    pg.click("#tabRebalance")
    time.sleep(1.5)
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510300.SH') cb.click();
      });
      var w = document.querySelector('#poolBox .wIn[data-code="510300.SH"]');
      if (w) { w.value = 100; w.dispatchEvent(new Event('change', {bubbles:true})); }
    })()""")
    time.sleep(1)
    pg.evaluate("""(() => {
      var inp = document.getElementById('stName');
      if (inp) { inp.value = '验-再平衡1标'; }
      var btn = document.getElementById('stSaveBtn');
      if (btn) btn.click();
    })()""")
    time.sleep(1)
    out["saved_rebalance"] = pg.evaluate("(() => { var ls = localStorage.getItem('wufu_strategies_v1'); if (!ls) return 'no-ls'; try { var a = JSON.parse(ls); return a[a.length-1].type || a[a.length-1].mode || 'no-type'; } catch(e) { return 'parse-err'; } })()")
    # ③ 应用再平衡策略 → 应切到再平衡视图
    pg.evaluate("""(() => {
      var ls = localStorage.getItem('wufu_strategies_v1');
      if (!ls) return;
      var a = JSON.parse(ls);
      var last = a[a.length-1];
      window.WufuUI.applyParams ? window.WufuUI.applyParams(last) : null;
    })()""")
    time.sleep(2)
    out["applied_view"] = pg.evaluate("(() => ({rotation: document.getElementById('viewRotation').style.display, rebalance: document.getElementById('viewRebalance').style.display}))")
    out["applied_mode"] = pg.evaluate("(() => { try { return window.WufuUI.getParams().mode; } catch(e) { return 'ERR'; } })()")
    b.close()
    out["console_errors"] = errs[:6]
    print(json.dumps(out, ensure_ascii=False, indent=1))
