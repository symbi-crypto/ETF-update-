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
    pg.click("#tabGrid")
    time.sleep(2)
    # 勾 510300 → 计算适配度评分
    pg.evaluate("(() => { var gb = document.getElementById('gridPoolBox'); if (gb) { var cbs = gb.querySelectorAll('label input[type=checkbox]'); cbs.forEach(function (cb) { var lab = cb.closest('label'); if (lab && (lab.textContent||'').indexOf('510050.SH') >= 0) cb.click(); }); } })()")
    time.sleep(0.6)
    out["checked"] = pg.evaluate("(() => { var g = window.GridView; return g && g.checked ? (g.checked['510050.SH'] === true) : null; })()")
    pg.evaluate("(() => { var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var t = btns.filter(function (x) { return x.textContent.indexOf('计算适配度评分') >= 0; })[0]; if (t) t.click(); return !!t; })()")
    # 走 UI 正常路径：GridView._ensureD('scores') 触发数据解析，完成后自动重跑 computeScores
    pg.evaluate("(() => { window.GridView._ensureD('scores'); })()")
    # 轮询等评分完成：gridScoreTable 出现 tbody tr（computeScores 同步写评分表）
    scored = False
    for i in range(30):
        time.sleep(2)
        n = pg.evaluate("(() => { var t = document.getElementById('gridScoreTable'); return t ? t.querySelectorAll('tbody tr').length : 0; })()")
        if n > 0: scored = True; break
    out["scored"] = scored
    # 进入第二步（renderParamsTable 填充网格参数表）
    if scored:
        pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
        time.sleep(1.5)
        out["params_rows"] = pg.evaluate("(() => { var t = document.getElementById('gridParamTable'); return t ? t.querySelectorAll('tbody tr').length : 0; })()")
    # ===== 修正1：gridParams 区间（去极值 P2-P98）与 banBuy =====
    out["grid"] = pg.evaluate("(() => { var D = window.__GRID_D || globalThis.D; var p = WufuEngine.gridParams('510300.SH', 600, 500000, 0.00075, 60, WufuEngine.gridQMode('p2p98')); var cal = D.calendar; var lo = Math.max(0, 600-60+1); var cArr = D.series['510300.SH'].close; var vals=[]; for (var j=lo;j<=600;j++) if (!isNaN(cArr[j])) vals.push(cArr[j]); vals.sort(function(a,b){return a-b;}); function q(pq){var pos=pq*(vals.length-1),i0=Math.floor(pos),i1=Math.ceil(pos); return i0===i1?vals[i0]:vals[i0]+(vals[i1]-vals[i0])*(pos-i0);} var loQ=q(0.02), hiQ=q(0.98); var mn=vals[0], mx=vals[vals.length-1]; return { lower: p.lower, upper: p.upper, loQ: loQ, hiQ: hiQ, mn: mn, mx: mx, nLev: p.nLevels, step: p.step, mid: p.mid, banBuy: p.banBuy, gapPct: (p.step/p.mid*100), warns: p.warns || [] }; })()")
    # 极值对照（min/max 应与 P2/P98 不同）
    out["grid2"] = pg.evaluate("(() => { var p = WufuEngine.gridParams('510300.SH', 600, 500000, 0.00075, 60, WufuEngine.gridQMode('p10p90')); return { lower: p.lower, upper: p.upper, nLev: p.nLevels }; })()")
    # ===== 新增2：计算说明弹层（评分已完成，body 显示实际计算值）=====
    out["help_btn"] = pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); return !!b; })()")
    pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); if (b) b.click(); })()")
    time.sleep(0.6)
    out["help_modal"] = pg.evaluate("(() => { var m = document.getElementById('gridCalcHelpModal'); var body = document.getElementById('gridCalcHelpBody'); return { shown: m ? m.style.display : null, bodyText: body ? (body.textContent||'').slice(0,220) : null, rows: body ? body.querySelectorAll('tbody tr').length : 0 }; })()")
    pg.evaluate("(() => { var m = document.getElementById('gridCalcHelpModal'); if (m) { m.style.display='none'; document.body.style.overflow=''; } })()")
    # ===== 微调3：gridStart/gridEnd 各占一行 =====
    out["startend"] = pg.evaluate("(() => { var s = document.getElementById('gridStart'), e = document.getElementById('gridEnd'); var sr = s ? s.parentElement : null, er = e ? e.parentElement : null; return { startRowText: sr ? sr.textContent.replace(/\\s+/g,' ').trim().slice(0,30) : null, endRowText: er ? er.textContent.replace(/\\s+/g,' ').trim().slice(0,30) : null, sameRow: sr === er }; })()")
    # ===== 微调4：单位（万分之/bp） =====
    out["units"] = pg.evaluate("(() => { var c = document.getElementById('gridComm'), sl = document.getElementById('gridSlip'); return { commVal: c ? c.value : null, commStep: c ? c.step : null, slipVal: sl ? sl.value : null, slipStep: sl ? sl.step : null }; })()")
    # run() 一次，看结果正常 + 无 pageerror（等价换算）
    pg.evaluate("(() => { var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var r = btns.filter(function (x) { return x.id === 'gridRunBtn'; })[0] || btns.filter(function (x) { return x.textContent.indexOf('开始回测') >= 0; })[0]; if (r) r.click(); })()")
    done = False
    for i in range(40):
        time.sleep(6)
        st = pg.evaluate("(() => { var el = document.getElementById('gridRunState'); return el ? el.textContent : ''; })()")
        if st and ("完成" in st or "已更新" in st or "回测完成" in st):
            done = True; break
    out["grid_run"] = { "done": done, "state": (st or "")[:60] }
    # 详情：保存策略 → 看持有列表比例列
    pg.evaluate("(() => { var i = document.getElementById('gridStName'); if (i) i.value = '五需求验证'; var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var s = btns.filter(function (x) { return x.textContent.indexOf('保存策略') >= 0; })[0]; if (s) s.click(); })()")
    time.sleep(3)
    pg.evaluate("(() => { var lis = Array.prototype.slice.call(document.querySelectorAll('#strategyList li, .srow, [data-name]')); if (!lis.length) return; var t = lis.filter(function (x) { return (x.textContent||'').indexOf('五需求验证') >= 0; })[0]; if (t) t.click(); })()")
    time.sleep(4)
    out["detail"] = pg.evaluate("(() => { var box = document.getElementById('stPosBuy'); if (!box) return { err: 'no stPosBuy' }; var txt = box.textContent || ''; return { hasRatio: txt.indexOf('持仓比例') >= 0, hasTotVal: txt.indexOf('总持仓市值') >= 0, head: txt.replace(/\\s+/g,' ').trim().slice(0,80) }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
