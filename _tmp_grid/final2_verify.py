# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
for vw, name in [(390, "mob"), (1440, "desk")]:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=EXE)
        pg = b.new_page(viewport={"width": vw, "height": 844 if vw == 390 else 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
        pg.goto(BASE, wait_until="load", timeout=120000)
        pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
        time.sleep(2)
        o = {}
        # 轮动 step2 折叠
        pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
        time.sleep(0.5)
        pg.click("#nextBtn")
        time.sleep(2)
        o["panel_order"] = pg.evaluate("(() => { var hs = document.getElementById('panel').querySelectorAll('.sfold-h'); return Array.prototype.map.call(hs, function (h) { return (h.querySelector('b') || {}).innerText; }); })()")
        o["fac_open"] = pg.evaluate("!document.getElementById('sfg-fac').classList.contains('hide')")
        o["nested"] = pg.evaluate("(() => { var p = document.getElementById('sfg-fac'); return p.parentElement.className + '>' + p.parentElement.parentElement.className; })()")
        pg.evaluate("(() => { var h = document.querySelector('.sfold-h[data-g=core]'); if (h) h.click(); })()")
        time.sleep(0.6)
        o["core_toggle"] = pg.evaluate("!document.getElementById('sfg-core').classList.contains('hide')")
        # 主回测 run（配因子+卖出）
        pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; document.querySelector('#mfAddBtn').click(); })()")
        time.sleep(0.5)
        pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; document.querySelector('#sellBtn').click(); })()")
        time.sleep(0.5)
        pg.evaluate("(() => { window.WufuUI.run(); })()")
        done = False
        for i in range(25):
            time.sleep(8)
            st = pg.evaluate("document.getElementById('runState').textContent")
            if "已更新" in st:
                done = True; o["run_s"] = (i + 1) * 8; break
        o["run_done"] = done
        o["run_state"] = st if done else (st or "")[:80]
        if done:
            time.sleep(1.5)
            o["total_return"] = pg.evaluate("(() => { var t = document.body.innerText.match(/总收益\\s*([\\d.-]+%)/); return t ? t[1] : '?'; })()")
            o["overflow"] = pg.evaluate("document.documentElement.scrollWidth")
        # 再平衡模式
        pg.click("#tabRebalance")
        time.sleep(2)
        o["reb_fac_hidden"] = pg.evaluate("document.getElementById('sfg-fac').classList.contains('hide')")
        o["reb_core_open"] = pg.evaluate("!document.getElementById('sfg-core').classList.contains('hide')")
        pg.click("#tabRotation")
        time.sleep(2)
        o["rot_restore"] = pg.evaluate("!document.getElementById('sfg-fac').classList.contains('hide')")
        o["errs"] = errs[:5]
        out[name] = o
        b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
