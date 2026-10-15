# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # 清 localStorage 避免残留参数干扰
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.click("#tabRebalance")
    time.sleep(2)
    # 勾选 4 标的（poolBox 共享）
    out["pick"] = pg.evaluate("(() => { var n = 0; document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) { cb.click(); n++; } }); return n; })()")
    time.sleep(0.8)
    # 权重模式 fixed + 填 25
    pg.evaluate("(() => { var m = document.getElementById('rebWeightMode'); if (m) { m.value = 'equal'; m.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.8)
    out["wfill"] = pg.evaluate("(() => { var n = 0; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { x.value = '25'; x.dispatchEvent(new Event('change', { bubbles: true })); n++; }); return n; })()")
    time.sleep(0.8)
    out["wsum"] = pg.evaluate("(() => { var w = document.getElementById('wSum'); return w ? w.textContent : 'no'; })()")
    # 下一步
    pg.click("#nextBtn")
    time.sleep(3)
    # 起始日期
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) { st.value = '2017-01-01'; st.dispatchEvent(new Event('change')); } })()")
    time.sleep(0.5)
    # run
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    done = False
    for i in range(25):
        time.sleep(8)
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st: done = True; break
    out["run_done"] = done
    out["runState"] = (st or "")[:60]
    if done:
        time.sleep(2)
        out["metrics"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : '?'; })()")
        out["trades"] = pg.evaluate("(() => { var t = document.getElementById('tradeTable'); return t ? t.querySelectorAll('tbody tr').length : -1; })()")
    # 保存策略（填名）
    out["save"] = pg.evaluate("(() => { var nm = document.getElementById('stName'); if (nm) nm.value = '永久组合'; var b = document.getElementById('saveSt'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()")
    time.sleep(1.5)
    # 我的策略 → 详情
    pg.click("#tabStrategies")
    time.sleep(3)
    out["stRows"] = pg.evaluate("document.querySelectorAll('#stListV .srow').length")
    if out["stRows"]:
        pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); if (rows.length) rows[0].click(); })()")
        time.sleep(6)
        out["detail"] = pg.evaluate("(() => { var tx = document.getElementById('stPosBuy'); var rows = tx ? tx.querySelectorAll('tbody tr').length : -1; var txt = document.body.innerText; var m = txt.match(/共\\s*(\\d+)\\s*笔/); var hdr = tx ? tx.querySelector('thead') : null; return { txRows: rows, totalNote: m ? m[1] : '?', hasDetail: !!document.getElementById('stDetail') && document.getElementById('stDetail').style.display !== 'none' }; })()")
    out["errs"] = errs[:6]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
