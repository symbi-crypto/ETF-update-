# -*- coding: utf-8 -*-
"""三项修复验证：再平衡无仅轮动/比例框、轮动因子第一步、导航顺序"""
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
    # ③ 导航顺序
    out["nav_order"] = pg.evaluate("""(() => {
      var ids = ['tabCorr','tabIc','tabRotation','tabRebalance','tabGrid','tabStrategies','tabCombo'];
      var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav button')).map(function(x){ return x.id; });
      return tabs.join(',');
    })()""")
    # ② 轮动第一步：因子区在标的池前
    out["rot_fac_before_pool"] = pg.evaluate("""(() => {
      var slot = document.getElementById('rotSh1Slot');
      var kids = Array.prototype.slice.call(slot.children);
      var facIdx = -1, poolIdx = -1;
      kids.forEach(function (k, i) { if (k.id === 'psecFactor') facIdx = i; });
      var sh1 = slot.querySelector('#sh1');
      if (sh1) poolIdx = Array.prototype.indexOf.call(slot.children, sh1);
      return {kids: kids.map(function(k){return k.id || k.className;}), facIdx: facIdx, poolIdx: poolIdx};
    })()""")
    # ② step2 结构（rotOnlyStep2 只含持有排名，psecTune 在 step2）
    out["rot_step2"] = pg.evaluate("""(() => {
      var ro = document.getElementById('rotOnlyStep2');
      var txt = ro ? ro.innerText.slice(0, 40) : 'MISSING';
      return {rotOnly_txt: txt, psecTune_in_step2: !!document.getElementById('step2').querySelector('#psecTune')};
    })()""")
    # ② 轮动因子区可见（step1 显示）
    out["rot_fac_visible"] = pg.evaluate("document.getElementById('psecFactor') ? document.getElementById('psecFactor').offsetParent !== null : false")
    # ① 再平衡：无仅轮动、比例框显示
    pg.click("#tabRebalance")
    time.sleep(1.5)
    out["reb_dom"] = pg.evaluate("""(() => {
      var wlab = document.querySelector('#poolBox .wlab');
      var rot = document.querySelector('#poolBox .rot');
      var wIn = document.querySelector('#poolBox .wIn');
      return {wlab_display: wlab ? getComputedStyle(wlab).display : 'MISSING',
              rot_display: rot ? getComputedStyle(rot).display : 'MISSING',
              wIn_exists: !!wIn,
              wSum_display: document.getElementById('wSum') ? getComputedStyle(document.getElementById('wSum')).display : 'MISSING'};
    })()""")
    # 再平衡勾选+填比例 → 合计联动
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510300.SH' || cb.getAttribute('data-c') === '510500.SH') cb.click();
      });
    })()""")
    time.sleep(1)
    pg.evaluate("""(() => {
      var w = document.querySelector('#poolBox .wIn[data-code="510300.SH"]');
      if (w) { w.value = 60; w.dispatchEvent(new Event('change', {bubbles:true})); }
      var w2 = document.querySelector('#poolBox .wIn[data-code="510500.SH"]');
      if (w2) { w2.value = 40; w2.dispatchEvent(new Event('change', {bubbles:true})); }
    })()""")
    time.sleep(1)
    out["reb_weights"] = pg.evaluate("window.WufuUI.getParams().reb_weights")
    out["reb_wsum"] = pg.evaluate("document.getElementById('wSum').textContent")
    # 回测跑通
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    try:
        pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(2)
        out["reb_kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:60]
    except Exception as e:
        out["reb_err"] = str(e)[:50]; out["reb_state"] = pg.evaluate("document.getElementById('runState').textContent")
    # 轮动回归
    pg.click("#tabRotation")
    time.sleep(1.5)
    pg.evaluate("""(() => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (cb.getAttribute('data-c') === '510300.SH' || cb.getAttribute('data-c') === '159915.SZ') cb.click();
      });
    })()""")
    time.sleep(1)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    try:
        pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
        time.sleep(2)
        out["rot_kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:40]
    except Exception as e:
        out["rot_err"] = str(e)[:50]; out["rot_state"] = pg.evaluate("document.getElementById('runState').textContent")
    b.close()
    out["console_errors"] = errs[:8]
    print(json.dumps(out, ensure_ascii=False, indent=1))
