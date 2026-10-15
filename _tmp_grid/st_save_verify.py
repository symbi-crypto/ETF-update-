# -*- coding: utf-8 -*-
"""策略保存/应用（对象格式 loadStored）三类型"""
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
    def save(name):
        pg.evaluate("""(nm) => {
          var inp = document.getElementById('stName'); if (inp) inp.value = nm;
          var btn = document.getElementById('saveSt'); if (btn) btn.click();
        }""", name)
        time.sleep(1)
    def stored_modes():
        return pg.evaluate("""(() => {
          var ls = localStorage.getItem('wufu_strategies_v1'); if (!ls) return 'no-ls';
          try { var m = JSON.parse(ls); return Object.keys(m).map(function(k){ return k + ':' + (m[k].mode || m[k].type || '?'); }); } catch(e) { return 'parse-err:' + ls.slice(0,60); }
        })()""")
    # ① 轮动保存
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510300.SH') cb.click();
      });
    })()""")
    time.sleep(0.8)
    save("验-轮动1标")
    out["rot_saved"] = stored_modes()
    # ② 再平衡保存
    pg.click("#tabRebalance")
    time.sleep(1.5)
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510500.SH') cb.click();
      });
      var w = document.querySelector('#poolBox .wIn[data-code="510500.SH"]');
      if (w) { w.value = 100; w.dispatchEvent(new Event('change', {bubbles:true})); }
    })()""")
    time.sleep(0.8)
    save("验-再平衡1标")
    out["reb_saved"] = stored_modes()
    # ③ 用 loadSt 应用再平衡（模拟用户点加载）
    pg.evaluate("""(() => {
      var sel = document.getElementById('stList');
      for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === '验-再平衡1标') { sel.value = sel.options[i].value; break; } }
      document.getElementById('loadSt').click();
    })()""")
    time.sleep(2)
    out["applied_reb"] = pg.evaluate("(() => ({mode: window.WufuUI.getParams().mode, view: document.getElementById('viewRebalance').style.display !== 'none'}))")
    # ④ loadSt 应用轮动
    pg.evaluate("""(() => {
      var sel = document.getElementById('stList');
      for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === '验-轮动1标') { sel.value = sel.options[i].value; break; } }
      document.getElementById('loadSt').click();
    })()""")
    time.sleep(2)
    out["applied_rot"] = pg.evaluate("(() => ({mode: window.WufuUI.getParams().mode, view: document.getElementById('viewRotation').style.display !== 'none'}))")
    pg.evaluate("localStorage.removeItem('wufu_strategies_v1')")
    b.close()
    out["console_errors"] = errs[:6]
    print(json.dumps(out, ensure_ascii=False, indent=1))
