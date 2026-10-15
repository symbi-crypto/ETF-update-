#!/usr/bin/env python3
# 五项需求最终端到端验证（含保存策略→详情持仓比例、帮助弹层数据行、轮动锚点回归）
import json, time
from playwright.sync_api import sync_playwright

BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}

def wait(pg, expr, secs=120, step=2):
    for _ in range(int(secs / step)):
        time.sleep(step)
        try:
            if pg.evaluate(expr):
                return True
        except Exception:
            pass
    return False

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

    # 勾选 510050.SH（评分 63.17 达标）
    pg.evaluate("(() => { var gb = document.getElementById('gridPoolBox'); if (gb) { var cbs = gb.querySelectorAll('label input[type=checkbox]'); cbs.forEach(function (cb) { var lab = cb.closest('label'); if (lab && (lab.textContent||'').indexOf('510050.SH') >= 0) cb.click(); }); } })()")
    time.sleep(0.6)
    out["checked"] = pg.evaluate("(() => { var g = window.GridView; return g && g.checked ? (g.checked['510050.SH'] === true) : null; })()")

    # 评分（_ensureD 触发数据解析，完成后自动重跑 computeScores）
    pg.evaluate("(() => { window.GridView._ensureD('scores'); })()")
    out["scored"] = wait(pg, "(() => { var g = window.GridView; return !!(g && g.lastScores && g.lastScores.length > 0); })()", 120)

    # 评分表 tbody 行（评分完成后应有行）
    out["scoreTableRows"] = pg.evaluate("(() => { var t = document.getElementById('gridScoreTable'); return t ? t.querySelectorAll('tbody tr').length : -1; })()")
    out["lastN"] = pg.evaluate("(() => { var g = window.GridView; return g && g.lastScores ? g.lastScores.length : -1; })()")

    # 下一步 → 参数表
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(1.5)
    out["params_rows"] = pg.evaluate("(() => { var t = document.getElementById('gridParamTable'); return t ? t.querySelectorAll('tbody tr').length : -1; })()")

    # ===== 修正1：gridParams 去极值 P2-P98 =====
    out["grid"] = pg.evaluate("(() => { var D = globalThis.D; var p = WufuEngine.gridParams('510300.SH', 600, 500000, 0.00075, 60, WufuEngine.gridQMode('p2p98')); var cal = D.calendar; var lo = Math.max(0, 600-60+1); var cArr = D.series['510300.SH'].close; var vals=[]; for (var j=lo;j<=600;j++) if (!isNaN(cArr[j])) vals.push(cArr[j]); vals.sort(function(a,b){return a-b;}); function q(pq){var pos=pq*(vals.length-1),i0=Math.floor(pos),i1=Math.ceil(pos); return i0===i1?vals[i0]:vals[i0]+(vals[i1]-vals[i0])*(pos-i0);} var loQ=q(0.02), hiQ=q(0.98); return { lower: p.lower, upper: p.upper, loQ: loQ, hiQ: hiQ, mn: vals[0], mx: vals[vals.length-1], nLev: p.nLevels, gapPct: (p.step/p.mid*100), banBuy: p.banBuy }; })()")
    out["grid2"] = pg.evaluate("(() => { var p = WufuEngine.gridParams('510300.SH', 600, 500000, 0.00075, 60, WufuEngine.gridQMode('p10p90')); return { lower: p.lower, upper: p.upper }; })()")
    # <1% 场景：找一只间距 <1% 的标的（区间很窄的），验证 banBuy
    out["grid3"] = pg.evaluate("(() => { var D = globalThis.D; var codes = ['511010.SH','511260.SH','511380.SH','511880.SH','511990.SH','518800.SH','512010.SH','512480.SH','512690.SH','512760.SH']; var r = {}; for (var k=0;k<codes.length;k++){ var c = codes[k]; if (!D.series[c]) continue; var p = WufuEngine.gridParams(c, D.calendar.length-1, 500000, 0.00075, 60, WufuEngine.gridQMode('p2p98')); if (!p) continue; r[c] = { gap: (p.step/p.mid*100).toFixed(3), nLev: p.nLevels, banBuy: p.banBuy }; } return r; })()")

    # ===== 新增2：计算说明弹层（评分完成后应有数据行）=====
    out["help_btn"] = pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); return !!b; })()")
    pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); if (b) b.click(); })()")
    time.sleep(0.6)
    out["help_modal"] = pg.evaluate("(() => { var body = document.getElementById('gridCalcHelpBody'); return { shown: (document.getElementById('gridCalcHelpModal')||{}).style ? document.getElementById('gridCalcHelpModal').style.display : null, bodyText: (body.textContent||'').slice(0,200), rows: body ? body.querySelectorAll('tbody tr').length : -1, firstRow: body ? (function(){ var r = body.querySelector('tbody tr'); return r ? r.textContent.slice(0,120) : null; })() : null }; })()")
    pg.evaluate("(() => { var m = document.getElementById('gridCalcHelpModal'); if (m) { m.style.display='none'; document.body.style.overflow=''; } })()")

    # ===== 微调3：起止时间两行 =====
    out["startend"] = pg.evaluate("(() => { var s = document.getElementById('gridStart'), e = document.getElementById('gridEnd'); var sr = s ? s.parentElement : null, er = e ? e.parentElement : null; return { sameRow: sr === er, startRow: sr ? sr.textContent.replace(/\\s+/g,' ').trim().slice(0,28) : null, endRow: er ? er.textContent.replace(/\\s+/g,' ').trim().slice(0,28) : null }; })()")

    # ===== 微调4：单位 =====
    out["units"] = pg.evaluate("(() => { var c = document.getElementById('gridComm'), sl = document.getElementById('gridSlip'); return { comm: c ? c.value : null, commLabel: c && c.labels && c.labels.length ? c.labels[0].textContent : null, slip: sl ? sl.value : null }; })()")

    # ===== 回测运行 =====
    pg.evaluate("(() => { var rb = document.getElementById('gridRunBtn'); if (rb) rb.click(); })()")
    out["grid_run"] = wait(pg, "(() => { var e = document.getElementById('gridRunState'); return !!(e && (e.textContent||'').indexOf('完成') >= 0); })()", 180)
    out["grid_state"] = pg.evaluate("(() => { var e = document.getElementById('gridRunState'); return e ? e.textContent : null; })()")

    # ===== 保存策略 → 详情：持仓比例 =====
    pg.evaluate("(() => { var s = document.getElementById('gridSaveBtn'); if (s) s.click(); })()")
    time.sleep(1.5)
    out["saved"] = pg.evaluate("(() => { var g = window.GridView; return !!(g && g.savedMsg && (g.savedMsg.textContent||'').indexOf('已保存') >= 0); })()")
    # 打开「我的策略」列表
    pg.evaluate("(() => { var t = document.getElementById('tabStrategies'); if (t) t.click(); })()")
    time.sleep(1.5)
    out["stratList"] = pg.evaluate("(() => { var l = document.getElementById('strategyList'); return l ? l.querySelectorAll('.st-item, [class*=strategy], .srow, [class*=st-item]').length : -1; })()")
    # 点击第一个策略卡片（网格类型）→ 详情
    clicked = pg.evaluate("(() => { var l = document.getElementById('strategyList'); if (!l) return false; var els = l.querySelectorAll('[class*=st]'); for (var i=0;i<els.length;i++){ var t = els[i].textContent || ''; if (t.indexOf('网格') >= 0 || els[i].tagName === 'DIV') { els[i].click(); return true; } } return false; })()")
    out["stratClicked"] = clicked
    time.sleep(2)
    out["detail"] = pg.evaluate("(() => { var b = document.body; var txt = b.textContent; return { hasRatio: txt.indexOf('持仓比例') >= 0, hasTotVal: txt.indexOf('总持仓市值') >= 0, hasHoldHead: txt.indexOf('当前持有标的') >= 0, hasGridDetail: txt.indexOf('网格参数') >= 0 }; })()")
    out["errs"] = errs[:6]
    b.close()

print(json.dumps(out, ensure_ascii=False, indent=1))
