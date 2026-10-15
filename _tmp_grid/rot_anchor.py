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
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    # 轮动第一步：勾 510300.SH + 159915.SZ
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    # 排名因子 roc20 rank
    pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); var k = document.getElementById('mfAddKind'); var b = document.getElementById('mfAddBtn'); if (u) { u.value = 'rank'; u.dispatchEvent(new Event('change')); } if (k) { k.value = 'roc'; k.dispatchEvent(new Event('change')); } if (b) b.click(); })()")
    time.sleep(0.8)
    # 卖出 hold_days 5
    pg.evaluate("(() => { var s = document.getElementById('sellKind'); var v = document.getElementById('sellVal'); if (s) { s.value = 'hold_days'; s.dispatchEvent(new Event('change')); } if (v) { v.value = '5'; v.dispatchEvent(new Event('change')); } var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
    time.sleep(0.8)
    # run
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    done = False
    for i in range(30):
        time.sleep(8)
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st: done = True; break
    out["run_done"] = done
    out["runState"] = (st or "")[:60]
    if done:
        time.sleep(2)
        out["metrics"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : '?'; })()")
        out["excess"] = pg.evaluate("(() => { var m = document.body.innerText.match(/超额收益[\\s\\S]{0,10}?([\\d.-]+pp)/); return m ? m[1] : '?'; })()")
    out["errs"] = errs[:5]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
