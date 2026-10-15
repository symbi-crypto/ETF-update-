# -*- coding: utf-8 -*-
"""纠正验证：轮动第一步=选标的+第二步因子置顶；再平衡比例框；导航滑动"""
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
    # ① 轮动第一步：只选标的（无因子区）
    out["step1_title"] = pg.evaluate("document.querySelector('#viewRotation #step1 h2').textContent")
    out["step1_has_factor"] = pg.evaluate("!!document.querySelector('#viewRotation #step1 #sfg-fac')")
    # ② 轮动第二步：因子区在顶部（panel 之前）
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510300.SH') cb.click();
      });
    })()""")
    time.sleep(1)
    pg.click("#nextBtn")
    time.sleep(3)
    out["step2_order"] = pg.evaluate("""(() => {
      var s2 = document.getElementById('step2');
      var kids = Array.prototype.slice.call(s2.children).filter(function (k) { return k.style.display !== 'none'; });
      var idx = {};
      kids.forEach(function (k, i) {
        if (k.querySelector('#sfg-fac')) idx.fac = i;
        if (k.id === 'rotOnlyStep2') idx.topn = i;
        if (k.querySelector('#psecTune')) idx.tune = i;
        if (k.querySelector('#panel')) idx.panel = i;
      });
      return {kids: kids.map(function(k){ return k.id || k.className || '?'; }), idx: idx};
    })()""")
    # ③ 再平衡：无仅轮动 + 比例框
    pg.click("#tabRebalance")
    time.sleep(1.5)
    out["reb"] = pg.evaluate("""(() => {
      var wlab = document.querySelector('#poolBox .wlab');
      var rot = document.querySelector('#poolBox .rot');
      return {wlab: wlab ? getComputedStyle(wlab).display : 'MISSING',
              rot: rot ? getComputedStyle(rot).display : 'MISSING',
              wIn: document.querySelectorAll('#poolBox .wIn').length};
    })()""")
    # ④ 导航（手机宽度 390）
    pg.set_viewport_size({"width": 390, "height": 844})
    time.sleep(1)
    out["nav_mobile"] = pg.evaluate("""(() => {
      var nav = document.querySelector('.nav');
      var tabs = Array.prototype.slice.call(nav.querySelectorAll('button'));
      var scrollW = nav.scrollWidth, clientW = nav.clientWidth;
      var lastVisible = -1;
      tabs.forEach(function (t, i) {
        var r = t.getBoundingClientRect();
        if (r.left < clientW) lastVisible = i;
      });
      return {scrollW: scrollW, clientW: clientW, scrollable: scrollW > clientW, visible_count: lastVisible + 1, total: tabs.length};
    })()""")
    # ⑤ 激活 tab 滚入视口（切到网格验证）
    pg.evaluate("(() => { try { window.GridView ? null : null; } catch(e){} })()")
    pg.click("#tabGrid")
    time.sleep(1)
    out["grid_scroll"] = pg.evaluate("""(() => {
      var t = document.getElementById('tabGrid');
      var r = t.getBoundingClientRect();
      var nav = document.querySelector('.nav').getBoundingClientRect();
      return {tab_left: r.left, tab_right: r.right, nav_left: nav.left, nav_right: nav.right, in_view: r.left >= nav.left && r.right <= nav.right};
    })()""")
    b.close()
    out["console_errors"] = errs[:8]
    print(json.dumps(out, ensure_ascii=False, indent=1))
