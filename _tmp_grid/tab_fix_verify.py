# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
def vis(pg, vid):
    return pg.evaluate("var el = document.getElementById('%s'); el ? el.style.display !== 'none' : false" % vid)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    out = {}
    # 场景 a：URL 带 #/strategies 打开 → 初始显示「我的策略」
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE + "#/strategies", wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out["a_initial_strategies"] = vis(pg, "viewStrategies")
    out["a_initial_rotation_hidden"] = not vis(pg, "viewRotation")
    # 点「我的策略」tab（相同 hash）→ 应保持/可切换
    pg.click("#tabStrategies")
    time.sleep(0.6)
    out["a_reclick_strategies"] = vis(pg, "viewStrategies")
    # 点其他 tab 再点回来
    pg.click("#tabGrid")
    time.sleep(0.6)
    out["a_grid_ok"] = vis(pg, "viewGrid")
    pg.click("#tabStrategies")
    time.sleep(0.6)
    out["a_back_strategies"] = vis(pg, "viewStrategies")
    out["a_errs"] = errs[:4]
    pg.close()
    # 场景 b：干净 hash 打开 → 初始轮动第一步 + 7 tab 全切换
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs2 = []
    pg.on("pageerror", lambda e: errs2.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out["b_initial_rotation"] = vis(pg, "viewRotation")
    tabs = [("tabRebalance", "viewRebalance"), ("tabGrid", "viewGrid"), ("tabStrategies", "viewStrategies"),
            ("tabCorr", "viewCorr"), ("tabCombo", "viewCombo"), ("tabIc", "viewIc"), ("tabRotation", "viewRotation")]
    out["b_tabs"] = {}
    for tid, vid in tabs:
        pg.click("#" + tid)
        time.sleep(0.4)
        out["b_tabs"][tid] = vis(pg, vid)
    # 相同 tab 重复点击（再点一次 grid）
    pg.click("#tabGrid")
    time.sleep(0.4)
    out["b_grid_reclick"] = vis(pg, "viewGrid")
    out["b_errs"] = errs2[:4]
    pg.close()
    # 场景 c：网格策略应用入口（applyGridStrategy 已在 8075181 先 showView("grid")）
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs3 = []
    pg.on("pageerror", lambda e: errs3.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("(() => { if (window.applyGridStrategy) applyGridStrategy('x'); })()")
    time.sleep(0.8)
    out["c_applygrid_ok"] = vis(pg, "viewGrid")
    out["c_errs"] = errs3[:4]
    pg.close()
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
