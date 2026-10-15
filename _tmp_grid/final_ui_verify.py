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
    # 主回测锚点
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(1)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; var btn = document.querySelector('#mfAddBtn'); if (btn) btn.click(); })()")
    time.sleep(0.5)
    pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; var btn = document.querySelector('#sellBtn'); if (btn) btn.click(); })()")
    time.sleep(0.5)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    pg.wait_for_function("document.getElementById('runState').textContent.indexOf('已更新') >= 0", timeout=120000)
    time.sleep(1.5)
    out["main_kpi"] = pg.evaluate("document.getElementById('kpis').innerText")[:40].replace(chr(10), " | ")
    # 网格页：两步式流程
    pg.click("#tabGrid")
    time.sleep(1.5)
    # 第一步无流动性控件
    out["liq_gone"] = pg.evaluate("!document.querySelector('input[name=gridLiqMode]') && !document.getElementById('gridLiqFixed')")
    # 无压力测试页容器
    out["stress_step_gone"] = pg.evaluate("!document.getElementById('gridNext2Btn') && !document.getElementById('gridStressBtn') && !document.getElementById('gridStressDepth')")
    # 勾 518880 + 阈值50
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; var box = document.getElementById('gridPoolBox'); box.querySelectorAll('label').forEach(function (lb) { var t2 = lb.innerText || ''; if (t2.indexOf('518880.SH') >= 0) { var cb = lb.querySelector('input[type=checkbox]'); if (cb && !cb.checked) cb.click(); } }); })()")
    time.sleep(1)
    pg.click("#gridScoreBtn")
    pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=60000)
    time.sleep(1)
    out["score_snip"] = pg.evaluate("document.getElementById('gridScoreTable').innerText.slice(0, 220)")
    # 评分标准弹窗（无流动性条目）—— 第一步内检查
    pg.click("#gridScoreHelpBtn")
    time.sleep(0.8)
    out["modal_no_liq"] = pg.evaluate("document.getElementById('gridScoreHelpModal').innerText.indexOf('流动性') < 0")
    out["modal_has_adx"] = pg.evaluate("document.getElementById('gridScoreHelpModal').innerText.indexOf('ADX14') >= 0")
    pg.click("#gridScoreHelpClose")
    time.sleep(0.4)
    # 下一步 → 直达回测设置（无压力测试页）
    pg.click("#gridNextBtn")
    time.sleep(1)
    out["step2_title"] = pg.evaluate("var s = document.getElementById('gridStep2'); s ? (s.style.display !== 'none' ? 'visible' : 'hidden') : 'no-el'")
    out["step2_has_hist_btn"] = pg.evaluate("!!document.getElementById('gridHistBtn') && document.getElementById('gridHistBtn').offsetParent !== null")
    out["step2_has_param_table"] = pg.evaluate("!!document.getElementById('gridParamTable') && document.getElementById('gridParamTable').offsetParent !== null")
    # 运行网格回测
    pg.click("#gridRunBtn")
    try:
        pg.wait_for_function("var s=document.getElementById('gridRunState'); s && (s.textContent.indexOf('完成') >= 0 || s.textContent.indexOf('已更新') >= 0)", timeout=150000)
        time.sleep(1.5)
        out["grid_run"] = pg.evaluate("document.getElementById('gridRunState').textContent")
        out["grid_kpi"] = pg.evaluate("var el=document.getElementById('gridKpis'); el ? el.innerText.slice(0,110) : 'no-kpis'")
    except Exception as e:
        out["grid_err"] = str(e)[:60]
    # 历史回放入口（回测设置区）
    pg.click("#gridHistBtn")
    pg.wait_for_function("document.getElementById('gridStressResult').innerHTML.indexOf('历史极端段回放') >= 0", timeout=60000)
    time.sleep(1)
    out["hist_snip"] = pg.evaluate("document.getElementById('gridStressResult').innerText.slice(0, 500)")
    out["hist_no_breach"] = pg.evaluate("document.getElementById('gridStressResult').innerText.indexOf('破网情景模拟') < 0")
    out["hist_no_perturb"] = pg.evaluate("document.getElementById('gridStressResult').innerText.indexOf('参数扰动对比') < 0")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
