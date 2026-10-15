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
    # 切再平衡
    pg.click("#tabRebalance")
    time.sleep(2)
    # 勾选 4 标的（在 reb 池）
    pg.evaluate("(() => { var box = document.getElementById('rebPoolBox') || document.getElementById('poolBox'); if (!box) return 'no-pool'; var n = 0; box.querySelectorAll('.pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0 && n < 4) { cb.click(); n++; } }); return 'checked:' + n; })()")
    time.sleep(1)
    out["pool"] = pg.evaluate("(() => { var box = document.getElementById('rebPoolBox'); return { has: !!box, picks: box ? box.querySelectorAll('.pick.on').length : -1 }; })()")
    # 权重模式 fixed + 填权重
    pg.evaluate("(() => { var m = document.getElementById('rebWeightMode'); if (m) m.value = 'fixed'; var ins = document.querySelectorAll('.wIn'); var n = 0; ins.forEach(function (x) { if (x.value !== undefined && x.style.display !== 'none') { x.value = 25; n++; } }); return 'wIn:' + n; })()")
    time.sleep(1)
    out["wIns"] = pg.evaluate("(() => { var ins = document.querySelectorAll('.wIn'); var a = []; ins.forEach(function (x) { a.push({ v: x.value, d: getComputedStyle(x).display }); }); return a.slice(0, 8); })()")
    # 下一步
    pg.evaluate("(() => { var nb = document.querySelector('#rebNextBtn') || document.getElementById('nextBtn'); if (nb) nb.click(); return !!nb; })()")
    time.sleep(2)
    out["step2"] = pg.evaluate("(() => { var s2 = document.getElementById('step2'); return { display: getComputedStyle(s2).display, hasReb: !!document.getElementById('rebSh2Slot') }; })()")
    # 起始日期
    pg.evaluate("(() => { var st = document.getElementById('startSel'); if (st) st.value = '2017-01-01'; })()")
    # run
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    done = False
    for i in range(25):
        time.sleep(8)
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st:
            done = True; break
    out["run_done"] = done
    out["runState"] = (st or "")[:60]
    if done:
        time.sleep(2)
        out["metrics"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : '?'; })()")
        # 直接读引擎结果 tradeRecords 数（通过 DOM：成交表行数）
        out["trade_rows"] = pg.evaluate("(() => { var t = document.getElementById('tradeTable'); return t ? t.querySelectorAll('tbody tr').length : -1; })()")
        out["recs"] = pg.evaluate("(() => { var w = window; var m = document.body.innerText.match(/共\\s*(\\d+)\\s*笔/); return m ? m[1] : '?'; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
