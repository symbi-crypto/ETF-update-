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
        # 交易参数折叠区：展开 core，读区内标签顺序
        pg.evaluate("(() => { var h = document.querySelector('.sfold-h[data-g=core]'); if (h) h.click(); })()")
        time.sleep(0.8)
        o["core_order"] = pg.evaluate("(() => { var c = document.getElementById('sfg-core'); var rows = c.querySelectorAll('h3, .row, label.row'); var r = []; rows.forEach(function (el) { var t = el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 30); if (t) r.push(t); }); return r; })()")
        o["core_open"] = pg.evaluate("!document.getElementById('sfg-core').classList.contains('hide')")
        # 主区无重复
        o["main_dup"] = pg.evaluate("(() => { var s2 = document.getElementById('step2'); var ids = ['tdRank', 'tdReb']; var dup = {}; ids.forEach(function (id) { var els = s2.querySelectorAll('#' + id); dup[id] = els.length; }); return dup; })()")
        # 调优区剩余内容（主区 tdWindow 等在）
        o["main_tune"] = pg.evaluate("(() => { var s2 = document.getElementById('step2'); return { hasTdWindow: !!s2.querySelector('#tdWindow'), hasTdWeight: !!s2.querySelector('#tdWeight') }; })()")
        # 参数读写：勾选 tdRank + 改 tdRebVal → js_tune 读取
        o["tune_read"] = pg.evaluate("(() => { var tr = document.getElementById('tdRank'); tr.checked = true; var tv = document.getElementById('tdRebVal'); tv.value = 'weekly,daily'; var w = window.WufuUI; if (!w || !w.getParams) return 'no-getParams'; var p = w.getParams(); return { tdRankChecked: tr.checked, tdRebVal: tv.value }; })()")
        # 主回测锚点
        pg.evaluate("(() => { var u = document.querySelector('#mfAddUsage'); if (u) u.value = 'rank'; var k = document.querySelector('#mfAddKind'); if (k) k.value = 'roc'; document.querySelector('#mfAddBtn').click(); })()")
        time.sleep(0.5)
        pg.evaluate("(() => { var k = document.querySelector('#sellKind'); if (k) k.value = 'hold_days'; var v = document.querySelector('#sellVal'); if (v) v.value = 5; document.querySelector('#sellBtn').click(); })()")
        time.sleep(0.5)
        pg.evaluate("(() => { window.WufuUI.run(); })()")
        done = False
        for i in range(20):
            time.sleep(8)
            st = pg.evaluate("document.getElementById('runState').textContent")
            if "已更新" in st:
                done = True; break
        o["run_done"] = done
        if done:
            time.sleep(1.5)
            o["anchor"] = pg.evaluate("(() => { var t = document.body.innerText.match(/累计收益\\n([\\d.-]+%)/); return t ? t[1] : '?'; })()")
            o["overflow"] = pg.evaluate("document.documentElement.scrollWidth")
        # 再平衡：sfg-core 内容
        pg.click("#tabRebalance")
        time.sleep(2)
        o["reb_core"] = pg.evaluate("(() => { var c = document.getElementById('sfg-core'); var vis = getComputedStyle(c).display; var hasTune = c.innerText.indexOf('调优维度') >= 0; return { display: vis, hasTune: hasTune }; })()")
        o["errs"] = errs[:5]
        out[name] = o
        b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
