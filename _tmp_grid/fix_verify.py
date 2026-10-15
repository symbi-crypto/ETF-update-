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
        # 交易参数展开：顺序
        pg.evaluate("(() => { var h = document.querySelector('.sfold-h[data-g=core]'); if (h) h.click(); })()")
        time.sleep(0.8)
        o["core_order"] = pg.evaluate("(() => { var c = document.getElementById('sfg-core'); var rows = c.querySelectorAll('h3'); return Array.prototype.map.call(rows, function (h) { return h.innerText.replace(/\\s+/g, ' ').trim().slice(0, 20); }); })()")
        o["topn_in_core"] = pg.evaluate("(() => { var c = document.getElementById('sfg-core'); return { hasTopn: !!c.querySelector('#topnRow'), topnFirst: c.querySelector('#topnRow') === c.firstElementChild, rankVals: [document.getElementById('rankNIn').value, document.getElementById('rankMIn').value] }; })()")
        # 调优维度在主区 psecTune（优化目标前）
        o["tune"] = pg.evaluate("(() => { var s2 = document.getElementById('step2'); var p = document.getElementById('psecTune'); var rows = Array.prototype.map.call(p.querySelectorAll('.row'), function (r) { return r.innerText.slice(0, 8); }); return { inPsecTune: p.querySelector('#tdRank') !== null, inPanel: !!document.getElementById('panel').querySelector('#tdRank'), firstRows: rows.slice(0, 4) }; })()")
        # 主区无重复 topn
        o["dup"] = pg.evaluate("(() => { var s2 = document.getElementById('step2'); return { topnCount: s2.querySelectorAll('#topnRow').length, tdRankCount: s2.querySelectorAll('#tdRank').length }; })()")
        # 参数读写
        o["rw"] = pg.evaluate("(() => { document.getElementById('rankNIn').value = 2; var p = window.WufuUI.getParams(); var back = p.rank_n; document.getElementById('rankNIn').value = 1; return { readRankN: back }; })()")
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
        o["anchor"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : 'none'; })()")
        o["overflow"] = pg.evaluate("document.documentElement.scrollWidth")
        # 再平衡：topnRow 隐藏 + psecTune（主区轮动专属）不可见
        pg.click("#tabRebalance")
        time.sleep(2)
        o["reb"] = pg.evaluate("(() => { var t = document.getElementById('topnRow'); var p = document.getElementById('psecTune'); var c = document.getElementById('sfg-core'); return { topnDisplay: getComputedStyle(t).display, tuneVisible: p ? getComputedStyle(p).display : 'no', coreDisplay: getComputedStyle(c).display }; })()")
        # 切回轮动恢复
        pg.click("#tabRotation")
        time.sleep(2)
        o["rot_restore"] = pg.evaluate("getComputedStyle(document.getElementById('topnRow')).display")
        o["errs"] = errs[:5]
        out[name] = o
        b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
