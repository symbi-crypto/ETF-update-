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
        pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
        time.sleep(0.5)
        pg.click("#nextBtn")
        time.sleep(2)
        # 轮动：调优维度可见 + 顺序
        pg.evaluate("(() => { var h = document.querySelector('.sfold-h[data-g=core]'); if (h) h.click(); })()")
        time.sleep(0.6)
        o["rot_tune_vis"] = pg.evaluate("(() => { var t = document.getElementById('psecTuneDim'); var c = document.getElementById('sfg-core'); var rows = c.querySelectorAll('#psecTuneDim .row'); var labels = []; rows.forEach(function (r) { labels.push(r.innerText.trim().slice(0, 10)); }); return { display: getComputedStyle(t).display, labels: labels }; })()")
        # 主区唯一性：panel 外无 tdRank
        o["panel_only"] = pg.evaluate("(() => { var panel = document.getElementById('panel'); var s2 = document.getElementById('step2'); return { inPanel: !!panel.querySelector('#tdRank'), outOfPanel: !!Array.prototype.find.call(s2.querySelectorAll('#tdRank'), function (el) { return !panel.contains(el); }) }; })()")
        # 再平衡：调优维度隐藏、sfg-core 平铺
        pg.click("#tabRebalance")
        time.sleep(2)
        o["reb_tune"] = pg.evaluate("(() => { var t = document.getElementById('psecTuneDim'); var c = document.getElementById('sfg-core'); return { tuneDisplay: getComputedStyle(t).display, coreDisplay: getComputedStyle(c).display }; })()")
        # 切回轮动：恢复可见
        pg.click("#tabRotation")
        time.sleep(2)
        o["rot_restore"] = pg.evaluate("getComputedStyle(document.getElementById('psecTuneDim')).display")
        # 主回测锚点
        pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; document.querySelector('#mfAddBtn').click(); })()")
        time.sleep(0.5)
        pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; document.querySelector('#sellBtn').click(); })()")
        time.sleep(0.5)
        pg.evaluate("(() => { window.WufuUI.run(); })()")
        for i in range(20):
            time.sleep(8)
            if "已更新" in pg.evaluate("document.getElementById('runState').textContent"): break
        time.sleep(1.5)
        o["anchor"] = pg.evaluate("(() => { var t = document.body.innerText.match(/累计收益\\n([\\d.-]+%)/); return t ? t[1] : '?'; })()")
        o["overflow"] = pg.evaluate("document.documentElement.scrollWidth")
        o["errs"] = errs[:5]
        out[name] = o
        b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
