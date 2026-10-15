# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.click("#tabGrid")
    time.sleep(1.5)
    # 按钮样式对比（gridScoreBtn vs gridScoreHelpBtn）
    out["btn_style"] = pg.evaluate("(() => { var btnA = document.getElementById('gridScoreBtn'); var btnB = document.getElementById('gridScoreHelpBtn'); return {a: btnA.getAttribute('style'), b: btnB.getAttribute('style'), same: btnA.getAttribute('style') === btnB.getAttribute('style')}; })()")
    # 勾 518880 + 阈值50 → 评分 → 下一步（回测设置）
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    pg.click("#gridNextBtn")
    time.sleep(1)
    def param_tbl():
        return pg.evaluate("document.getElementById('gridParamTable').innerText")
    out["params_60"] = param_tbl()
    # 改 volWin 60 → 120
    pg.evaluate("(() => { var v = document.getElementById('gridVolWin'); v.value = 120; v.dispatchEvent(new Event('change')); })()")
    time.sleep(1.5)
    out["params_120"] = param_tbl()
    # 回测两次结果对比（60 与 120）
    pg.click("#gridRunBtn")
    pg.wait_for_function("var s=document.getElementById('gridRunState'); s && s.textContent.indexOf('完成') >= 0", timeout=150000)
    time.sleep(1.5)
    out["run_120_kpi"] = pg.evaluate("document.getElementById('gridKpis').innerText.slice(0,110)")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
