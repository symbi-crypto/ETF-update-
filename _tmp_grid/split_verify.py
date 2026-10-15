# -*- coding: utf-8 -*-
"""拆分后 UI 验证 v2：轮动/再平衡独立回测 + 状态隔离 + KPI"""
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"

def pick(pg, codes):
    pg.evaluate("""(codes) => {
      document.querySelectorAll('#poolBox .pick').forEach(function (cb) {
        if (codes.indexOf(cb.getAttribute('data-c')) >= 0) cb.click();
      });
    }""", codes)

def setW(pg, wmap):
    pg.evaluate("""(wmap) => {
      document.querySelectorAll('#poolBox .wIn').forEach(function (w) {
        var c = w.getAttribute('data-code');
        if (c in wmap) { w.value = wmap[c]; w.dispatchEvent(new Event('change', {bubbles:true})); }
      });
    }""", wmap)

def addFactor(pg):
    pg.evaluate("""(() => {
      var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank';
      var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc';
      var btn = document.querySelector('#mfAddBtn'); if (btn) btn.click();
    })()""")

def addSell(pg):
    pg.evaluate("""(() => {
      var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days';
      var v = document.querySelector('#sellVal'); if (v) v.value = 5;
      var btn = document.querySelector('#sellBtn'); if (btn) btn.click();
    })()""")

def runBtn(pg):
    rn = pg.query_selector("#runBtn")
    if rn: pg.click("#runBtn")
    else: pg.evaluate("(() => { window.WufuUI.run(); })()")

def main():
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=EXE)
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
        pg.goto(HTML, wait_until="load", timeout=120000)
        pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
        time.sleep(2)
        # ① 默认轮动视图结构
        out["default_rotation"] = pg.evaluate("document.getElementById('viewRotation').style.display !== 'none'")
        out["sh1_in"] = pg.evaluate("document.getElementById('sh1').parentNode.id")
        # ② 轮动 2 标回测（锚点 8.04%）
        pick(pg, ["510300.SH", "159915.SZ"])
        time.sleep(1)
        pg.click("#nextBtn")
        time.sleep(3)
        out["rot_step2"] = pg.evaluate("document.getElementById('step2').style.display !== 'none'")
        addFactor(pg); time.sleep(0.4)
        addSell(pg); time.sleep(0.4)
        runBtn(pg)
        try:
            pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
            time.sleep(2)
            out["rot_runState"] = pg.evaluate("document.getElementById('runState').textContent")
            out["rot_kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:160]
            out["rot_rotOnly_in"] = pg.evaluate("document.getElementById('rotOnlyStep2').parentNode.id")
        except Exception as e:
            out["rot_err"] = str(e)[:60]; out["rot_state"] = pg.evaluate("document.getElementById('runState').textContent"); out["rot_notice"] = pg.evaluate("document.getElementById('notice').textContent")
        # ③ 切再平衡：3 只 + 权重 30/30/40 回测
        pg.click("#tabRebalance")
        time.sleep(2)
        out["reb_view"] = pg.evaluate("document.getElementById('viewRebalance').style.display !== 'none'")
        out["reb_sh1_in"] = pg.evaluate("document.getElementById('sh1').parentNode.id")
        out["reb_exe_hidden"] = pg.evaluate("document.getElementById('sfg-exe').style.display === 'none'")
        out["reb_rotOnly_hidden"] = pg.evaluate("document.getElementById('rotOnlyStep2').style.display === 'none'")
        pick(pg, ["510300.SH", "510500.SH", "159915.SZ"])
        time.sleep(1)
        setW(pg, {"510300.SH": 30, "510500.SH": 30, "159915.SZ": 40})
        time.sleep(1)
        out["reb_weights"] = pg.evaluate("window.WufuUI.getParams().reb_weights")
        out["reb_wsum"] = pg.evaluate("document.getElementById('wSum').textContent")
        pg.click("#nextBtn")
        time.sleep(3)
        runBtn(pg)
        try:
            pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
            time.sleep(2)
            out["reb_runState"] = pg.evaluate("document.getElementById('runState').textContent")
            out["reb_kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:160]
        except Exception as e:
            out["reb_err"] = str(e)[:60]; out["reb_state"] = pg.evaluate("document.getElementById('runState').textContent"); out["reb_notice"] = pg.evaluate("document.getElementById('notice').textContent")
        # ④ 状态隔离
        pg.click("#tabRotation")
        time.sleep(1.5)
        out["rot_codes"] = pg.evaluate("window.WufuUI.getParams().codes")
        pg.click("#tabRebalance")
        time.sleep(1.5)
        out["reb_codes"] = pg.evaluate("window.WufuUI.getParams().codes")
        out["reb_mode"] = pg.evaluate("window.WufuUI.getParams().mode")
        # ⑤ 网格/其他视图不受影响
        pg.click("#tabGrid")
        time.sleep(1.5)
        out["grid_view"] = pg.evaluate("document.getElementById('viewGrid').style.display !== 'none'")
        b.close()
    out["console_errors"] = errs[:10]
    return out

print(json.dumps(main(), ensure_ascii=False, indent=1))
