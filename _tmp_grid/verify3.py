# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
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
    # ==== 轮动视图结构 ====
    out["rot_struct"] = pg.evaluate("(() => { var r = {}; r.tuneFold = !!document.querySelector('.sfold-h[data-g=\"tune\"]'); r.sfgTune = !!document.getElementById('sfg-tune'); r.psecTuneInPanel = !!document.getElementById('panel').querySelector('#psecTune'); r.robBtnInTune = !!document.getElementById('sfg-tune').querySelector('#robBtn'); r.noPsecTuneMain = !document.querySelector('main #psecTune') && !document.querySelector('#step2 #psecTune'); r.noRotOnly = !document.getElementById('rotOnlyStep2'); r.noCollapseBtn = !document.getElementById('collapseBtn'); r.foldLabels = Array.prototype.map.call(document.querySelectorAll('.sfold-h b'), function (x) { return x.textContent; }); return r; })()")
    # ⑤ 展开/收起
    out["fold_toggle"] = pg.evaluate("(() => { var btn = document.querySelector('.sfold-h[data-g=\"tune\"]'); var body = document.getElementById('sfg-tune'); var r1 = body.classList.contains('hide'); btn.click(); var r2 = body.classList.contains('hide'); btn.click(); var r3 = body.classList.contains('hide'); return { before: r1, afterOpen: r2, afterClose: r3 }; })()")
    # ==== 再平衡视图：⑤ 隐藏 ====
    pg.click("#tabRebalance")
    time.sleep(2)
    out["reb_struct"] = pg.evaluate("(() => { var t = document.getElementById('sfg-tune'); return { tuneHidden: !!t && t.classList.contains('hide'), tuneHeaderHidden: document.querySelector('.sfold-h[data-g=\"tune\"]') ? document.querySelector('.sfold-h[data-g=\"tune\"]').style.display === 'none' : null, topnHidden: document.getElementById('topnRow') ? document.getElementById('topnRow').style.display === 'none' : null }; })()")
    # ==== 轮动锚点 8.04% ====
    pg.click("#tabRotation")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.6)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); var k = document.getElementById('mfAddKind'); var b = document.getElementById('mfAddBtn'); if (u) { u.value = 'rank'; u.dispatchEvent(new Event('change')); } if (k) { k.value = 'roc'; k.dispatchEvent(new Event('change')); } if (b) b.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var s = document.getElementById('sellKind'); var v = document.getElementById('sellVal'); if (s) { s.value = 'hold_days'; s.dispatchEvent(new Event('change')); } if (v) { v.value = '5'; v.dispatchEvent(new Event('change')); } var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    for i in range(30):
        time.sleep(8)
        if "已更新" in pg.evaluate("document.getElementById('runState').textContent"): break
    time.sleep(2)
    out["anchor"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : '?'; })()")
    out["errs"] = errs[:6]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
