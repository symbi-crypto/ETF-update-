# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
HTML = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})   # 手机端重点
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(HTML, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    pg.click("#tabGrid")
    time.sleep(1.5)
    # ① 第一步控件可见
    out["step1_liq"] = {
        "radio_auto": pg.evaluate("!!document.querySelector('input[name=gridLiqMode][value=auto]')"),
        "radio_fixed": pg.evaluate("!!document.querySelector('input[name=gridLiqMode][value=fixed]')"),
        "fixed_input": pg.evaluate("!!document.getElementById('gridLiqFixed')"),
        "hint": pg.evaluate("document.getElementById('gridLiqHint') ? document.getElementById('gridLiqHint').textContent : ''"),
        "visible": pg.evaluate("document.getElementById('gridLiqFixed').offsetParent !== null || document.querySelector('input[name=gridLiqMode]').offsetParent !== null")
    }
    # ② 切 fixed → 输入框显示
    pg.evaluate("(() => { var r = document.querySelector('input[name=gridLiqMode][value=fixed]'); if (r) r.click(); })()")
    time.sleep(0.5)
    out["fixed_visible"] = pg.evaluate("document.getElementById('gridLiqFixed').style.display === ''")
    out["hint_fixed"] = pg.evaluate("document.getElementById('gridLiqHint').textContent")
    pg.evaluate("(() => { var r = document.querySelector('input[name=gridLiqMode][value=auto]'); if (r) r.click(); })()")
    time.sleep(0.3)
    # ③ 评分（勾 512690 酒ETF + 512550 富时A50（auto 剔））→ auto 400万 gate 文案
    pg.evaluate("(() => { var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t = lb.innerText || ''; if (t.indexOf('512690.SH') >= 0 || t.indexOf('512550.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    out["score_auto"] = pg.evaluate("document.getElementById('gridScoreTable').innerText.slice(0, 200)")
    # ④ 切 fixed 5000万 → 重评 → gate 文案变化
    pg.evaluate("(() => { var r = document.querySelector('input[name=gridLiqMode][value=fixed]'); if (r) r.click(); })()")
    time.sleep(0.5)
    pg.click("#gridScoreBtn")
    time.sleep(1.5)
    out["score_fixed"] = pg.evaluate("document.getElementById('gridScoreTable').innerText.slice(0, 200)")
    # ⑤ 第二步无重复控件
    pg.evaluate("(() => { var r = document.querySelector('input[name=gridLiqMode][value=auto]'); if (r) r.click(); })()")
    time.sleep(0.3)
    pg.click("#gridNextBtn")
    time.sleep(1)
    out["step2_has_liq"] = pg.evaluate("document.querySelectorAll('#gridStep2 input[name=gridLiqMode]').length > 0")
    pg.click("#gridNext2Btn")
    time.sleep(1)
    pg.click("#gridRunBtn")
    try:
        pg.wait_for_function("var s=document.getElementById('gridRunState'); s && (s.textContent.indexOf('完成') >= 0 || s.textContent.indexOf('已更新') >= 0)", timeout=150000)
        time.sleep(1.5)
        out["grid_run"] = pg.evaluate("document.getElementById('gridRunState').textContent")
        out["grid_kpi"] = pg.evaluate("var el=document.getElementById('gridKpis'); el ? el.innerText.slice(0,120) : 'no-kpis'")
    except Exception as e:
        out["grid_err"] = str(e)[:60]
        out["grid_state"] = pg.evaluate("var s=document.getElementById('gridRunState'); s ? s.textContent : 'no-el'")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
