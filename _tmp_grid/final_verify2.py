#!/usr/bin/env python3
# 五项需求最终端到端验证 v2（按钮点击路径 + 保存→详情持仓比例 + 截图存档）
import json, time
from playwright.sync_api import sync_playwright

BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
SHOT = "/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/shots"
import os
os.makedirs(SHOT, exist_ok=True)
out = {}

def wait(pg, expr, secs=150, step=2):
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

    # 勾选 510050.SH
    pg.evaluate("(() => { var gb = document.getElementById('gridPoolBox'); if (gb) { var cbs = gb.querySelectorAll('label input[type=checkbox]'); cbs.forEach(function (cb) { var lab = cb.closest('label'); if (lab && (lab.textContent||'').indexOf('510050.SH') >= 0) cb.click(); }); } })()")
    time.sleep(0.6)
    out["checked"] = pg.evaluate("(() => { var g = window.GridView; return g && g.checked ? (g.checked['510050.SH'] === true) : null; })()")

    # 点「计算适配度评分」按钮（真实用户路径；D 未就绪时自动加载数据并重跑）
    pg.evaluate("(() => { var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var t = btns.filter(function (x) { return x.textContent.indexOf('计算适配度评分') >= 0; })[0]; if (t) t.click(); return !!t; })()")
    out["scoreBtnClicked"] = pg.evaluate("(() => { var g = window.GridView; return !!(g && g._loadingD); })()")  # 触发数据加载
    out["scored"] = wait(pg, "(() => { var t = document.getElementById('gridScoreTable'); return !!(t && t.querySelectorAll('tbody tr').length > 0); })()", 150)
    out["scoreTableRows"] = pg.evaluate("(() => { var t = document.getElementById('gridScoreTable'); return t ? t.querySelectorAll('tbody tr').length : -1; })()")
    pg.screenshot(path=SHOT + "/step1_scored.png")
    out["lastN"] = pg.evaluate("(() => { var g = window.GridView; return g && g.lastScores ? g.lastScores.length : -1; })()")

    # 下一步 → 参数表
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(2)
    out["params_rows"] = pg.evaluate("(() => { var t = document.getElementById('gridParamTable'); return t ? t.querySelectorAll('tbody tr').length : -1; })()")
    out["qmode"] = pg.evaluate("(() => { var s = document.getElementById('gridQModeSel'); return s ? s.value : null; })()")
    pg.screenshot(path=SHOT + "/step2_params.png")

    # ===== 修正1：引擎级验证（P2-P98 去极值 + <1% banBuy）=====
    out["grid"] = pg.evaluate("(() => { var D = globalThis.D; var p = WufuEngine.gridParams('510300.SH', 600, 500000, 0.00075, 60, WufuEngine.gridQMode('p2p98')); var cArr = D.series['510300.SH'].close; var lo = Math.max(0, 600-60+1); var vals=[]; for (var j=lo;j<=600;j++) if (!isNaN(cArr[j])) vals.push(cArr[j]); vals.sort(function(a,b){return a-b;}); function q(pq){var pos=pq*(vals.length-1),i0=Math.floor(pos),i1=Math.ceil(pos); return i0===i1?vals[i0]:vals[i0]+(vals[i1]-vals[i0])*(pos-i0);} return { lower: p.lower, upper: p.upper, loQ: q(0.02), hiQ: q(0.98), mn: vals[0], mx: vals[vals.length-1], nLev: p.nLevels, gapPct: (p.step/p.mid*100), banBuy: p.banBuy }; })()")
    out["grid_ban"] = pg.evaluate("(() => { var D = globalThis.D; var r = {}; ['511010.SH','511990.SH','512010.SH','512480.SH'].forEach(function (c) { if (!D.series[c]) return; var p = WufuEngine.gridParams(c, D.calendar.length-1, 500000, 0.00075, 60, WufuEngine.gridQMode('p2p98')); if (p) r[c] = { gap: (p.step/p.mid*100).toFixed(3), banBuy: p.banBuy, nLev: p.nLevels }; }); return r; })()")

    # ===== 新增2：弹层（评分后应有数据行）=====
    out["help_btn"] = pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); return !!b; })()")
    pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); if (b) b.click(); })()")
    time.sleep(0.8)
    out["help_modal"] = pg.evaluate("(() => { var body = document.getElementById('gridCalcHelpBody'); return { shown: document.getElementById('gridCalcHelpModal').style.display, rows: body ? body.querySelectorAll('tbody tr').length : -1, first: body && body.querySelector('tbody tr') ? body.querySelector('tbody tr').textContent.slice(0,150) : null }; })()")
    pg.screenshot(path=SHOT + "/help_modal.png")
    pg.evaluate("(() => { var m = document.getElementById('gridCalcHelpModal'); if (m) { m.style.display='none'; document.body.style.overflow=''; } })()")

    # ===== 微调3/4 =====
    out["startend"] = pg.evaluate("(() => { var s = document.getElementById('gridStart'), e = document.getElementById('gridEnd'); return { sameRow: s.parentElement === e.parentElement }; })()")
    out["units"] = pg.evaluate("(() => { var c = document.getElementById('gridComm'), sl = document.getElementById('gridSlip'); return { comm: c ? c.value : null, slip: sl ? sl.value : null }; })()")

    # ===== 回测 =====
    pg.evaluate("(() => { var rb = document.getElementById('gridRunBtn'); if (rb) rb.click(); })()")
    out["grid_run"] = wait(pg, "(() => { var e = document.getElementById('gridRunState'); return !!(e && (e.textContent||'').indexOf('完成') >= 0); })()", 180)
    out["grid_state"] = pg.evaluate("(() => { var e = document.getElementById('gridRunState'); return e ? e.textContent : null; })()")

    # ===== 保存 → 详情（持仓比例）=====
    pg.evaluate("(() => { var s = document.getElementById('gridSaveBtn'); if (s) s.click(); })()")
    time.sleep(1.2)
    out["saved"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); var ks = Object.keys(m); return { n: ks.length, gridN: ks.filter(function(k){ return m[k] && m[k].type === 'grid'; }).length, name: ks[ks.length-1] || null, codes: ks.length ? (m[ks[ks.length-1]].grid || {}).codes || null : null, top_n: ks.length ? (m[ks[ks.length-1]].grid || {}).top_n : null }; })()")
    # 我的策略 tab
    pg.evaluate("(() => { var t = document.getElementById('tabStrategies'); if (t) t.click(); })()")
    out["stratRows"] = wait(pg, "(() => { var l = document.getElementById('stListV'); return !!(l && l.querySelectorAll('.srow').length > 0); })()", 30)
    out["stratRowN"] = pg.evaluate("(() => { var l = document.getElementById('stListV'); return l ? l.querySelectorAll('.srow').length : -1; })()")
    pg.screenshot(path=SHOT + "/strategy_list.png")
    # 点击第一个 srow（新保存的网格策略）
    pg.evaluate("(() => { var l = document.getElementById('stListV'); if (!l) return; var rows = l.querySelectorAll('.srow'); if (rows.length) rows[rows.length-1].click(); })()")
    out["detailShown"] = wait(pg, "(() => { var d = document.getElementById('stDetail'); return !!(d && d.style.display === 'block'); })()", 30)
    out["detail"] = wait(pg, "(() => { var d = document.getElementById('stPosBuy'); return !!(d && (d.textContent||'').indexOf('总持仓市值') >= 0 && (d.textContent||'').indexOf('持仓比例') >= 0); })()", 120)
    time.sleep(1)
    out["detailTxt"] = pg.evaluate("(() => { var d = document.getElementById('stPosBuy'); return d ? (d.textContent||'').replace(/\\s+/g,' ').slice(0,300) : null; })()")
    pg.screenshot(path=SHOT + "/detail_hold.png")
    # 点击持有行 → 网格详情
    pg.evaluate("(() => { var d = document.getElementById('stPosBuy'); if (!d) return; var els = d.querySelectorAll('[class*=row]'); for (var i=0;i<els.length;i++){ if (els[i].textContent.indexOf('510050') >= 0) { els[i].click(); return; } } })()")
    time.sleep(1.5)
    out["gridDetail"] = pg.evaluate("(() => { var t = document.body.textContent; return { hasParam: t.indexOf('网格参数') >= 0, hasMid: t.indexOf('中轴') >= 0, hasTip: t.indexOf('低于中轴线建仓') >= 0 }; })()")
    pg.screenshot(path=SHOT + "/grid_detail.png")
    out["errs"] = errs[:8]
    b.close()

print(json.dumps(out, ensure_ascii=False, indent=1))
