#!/usr/bin/env python3
# 三项需求端到端验证：分位数联动 / 参数每项一行 / 轮动+再平衡详情持仓比例
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

def readTable(pg, tid):
    return pg.evaluate("(tid) => { var t = document.getElementById(tid); if (!t) return null; var rows = t.querySelectorAll('tbody tr'); var r = []; for (var i=0;i<rows.length;i++) r.push(rows[i].textContent.replace(/\\s+/g,' ').trim()); return r; }", tid)

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

    # ================= 网格：修正1 分位数联动 + 修正2 每项一行 =================
    pg.click("#tabGrid")
    time.sleep(2)
    pg.evaluate("(() => { var gb = document.getElementById('gridPoolBox'); if (gb) { var cbs = gb.querySelectorAll('label input[type=checkbox]'); cbs.forEach(function (cb) { var lab = cb.closest('label'); if (lab && (lab.textContent||'').indexOf('510050.SH') >= 0) cb.click(); }); } })()")
    time.sleep(0.5)
    pg.evaluate("(() => { var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var t = btns.filter(function (x) { return x.textContent.indexOf('计算适配度评分') >= 0; })[0]; if (t) t.click(); })()")
    out["grid_scored"] = wait(pg, "(() => { var t = document.getElementById('gridScoreTable'); return !!(t && t.querySelectorAll('tbody tr').length > 0); })()", 150)
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(1.5)
    # P2-P98 区间
    out["param_p2p98"] = readTable(pg, "gridParamTable")
    # 修正2：每项一行
    out["rows_split"] = pg.evaluate("(() => { var c = document.getElementById('gridComm'), s = document.getElementById('gridSlip'), mc = document.getElementById('gridMinComm'), idl = document.getElementById('gridIdleSel'); return { commRow: c.parentElement.textContent.replace(/\\s+/g,' ').trim(), slipRow: s.parentElement.textContent.replace(/\\s+/g,' ').trim(), mcRow: mc.parentElement.textContent.replace(/\\s+/g,' ').trim(), idleRow: idl.parentElement.textContent.replace(/\\s+/g,' ').trim(), allDiff: c.parentElement !== s.parentElement && s.parentElement !== mc.parentElement && mc.parentElement !== idl.parentElement }; })()")
    # 切换分位数 p10p90 → 参数表实时变化
    pg.evaluate("(() => { var q = document.getElementById('gridQModeSel'); if (q) { q.value = 'p10p90'; q.dispatchEvent(new Event('change', { bubbles: true })); } })()")
    time.sleep(0.8)
    out["param_p10p90"] = readTable(pg, "gridParamTable")
    out["qmode_now"] = pg.evaluate("(() => { var q = document.getElementById('gridQModeSel'); return q ? q.value : null; })()")
    # 打开计算说明弹层 → 数据同步
    pg.evaluate("(() => { var b = document.getElementById('gridCalcHelpBtn'); if (b) b.click(); })()")
    time.sleep(0.6)
    out["help_rows"] = pg.evaluate("(() => { var body = document.getElementById('gridCalcHelpBody'); return body ? body.querySelectorAll('tbody tr').length : -1; })()")
    out["help_first"] = pg.evaluate("(() => { var body = document.getElementById('gridCalcHelpBody'); return body && body.querySelector('tbody tr') ? body.querySelector('tbody tr').textContent.slice(0,120) : null; })()")
    pg.screenshot(path=SHOT + "/t_qmode_p10p90.png")
    pg.evaluate("(() => { var m = document.getElementById('gridCalcHelpModal'); if (m) { m.style.display='none'; document.body.style.overflow=''; } })()")
    # 切回 p2p98 验证可逆
    pg.evaluate("(() => { var q = document.getElementById('gridQModeSel'); if (q) { q.value = 'p2p98'; q.dispatchEvent(new Event('change', { bubbles: true })); } })()")
    time.sleep(0.6)
    out["param_p2p98_back"] = readTable(pg, "gridParamTable")

# ================= 轮动：详情「当前持仓」 =================
    pg.click("#tabRotation")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); var k = document.getElementById('mfAddKind'); var b = document.getElementById('mfAddBtn'); if (u) { u.value = 'rank'; u.dispatchEvent(new Event('change')); } if (k) { k.value = 'roc'; k.dispatchEvent(new Event('change')); } if (b) b.click(); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var s = document.getElementById('sellKind'); var v = document.getElementById('sellVal'); if (s) { s.value = 'hold_days'; s.dispatchEvent(new Event('change')); } if (v) { v.value = '5'; v.dispatchEvent(new Event('change')); } var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    out["rot_run"] = wait(pg, "(() => { var e = document.getElementById('runState'); return !!(e && (e.textContent||'').indexOf('已更新') >= 0); })()", 240)
    time.sleep(2)
    out["rot_metrics"] = pg.evaluate("(() => { var m = document.body.innerText.match(/累计收益[\\s\\S]{0,10}?([\\d.-]+%)/); return m ? m[1] : null; })()")
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '轮动验证策略'; var s = document.getElementById('saveSt'); if (s) s.click(); })()")
    time.sleep(1.5)
    out["rot_saved"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m).filter(function(k){ return (m[k].mode||'') !== 'rebalance'; }).length; })()")
    pg.evaluate("(() => { var t = document.getElementById('tabStrategies'); if (t) t.click(); })()")
    out["rot_list"] = wait(pg, "(() => { var l = document.getElementById('stListV'); return !!(l && l.querySelectorAll('.srow').length > 0); })()", 30)
    pg.evaluate("(() => { var l = document.getElementById('stListV'); if (l) { var rows = l.querySelectorAll('.srow'); for (var i=0;i<rows.length;i++){ if ((rows[i].textContent||'').indexOf('轮动验证策略') >= 0) { rows[i].click(); return; } } } })()")
    out["rot_detail"] = wait(pg, "(() => { var d = document.getElementById('stPosBuy'); return !!(d && (d.textContent||'').indexOf('当前持仓') >= 0 && (d.textContent||'').indexOf('持仓比例') >= 0); })()", 150)
    time.sleep(1)
    out["rot_pos"] = pg.evaluate("(() => { var d = document.getElementById('stPosBuy'); return d ? (d.textContent||'').replace(/\\s+/g,' ').slice(0,450) : null; })()")
    pg.screenshot(path=SHOT + "/t_rot_detail.png")


    # ================= 再平衡：详情「当前持仓」 =================
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } var vals = { '513500.SH': '40', '518880.SH': '30', '511010.SH': '20', '511990.SH': '10' }; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { var c = x.getAttribute('data-code'); if (vals[c]) { x.value = vals[c]; x.dispatchEvent(new Event('change', { bubbles: true })); } }); })()")
    time.sleep(0.6)
    out["reb_params"] = pg.evaluate("(() => { var p = window.WufuUI.getParams(); return { wm: p.reb_weight_mode, style: p.reb_style, w: p.reb_weights }; })()")
    pg.evaluate("(() => { var nb = document.getElementById('nextBtn'); if (nb) nb.click(); })()")
    out["reb_dready"] = wait(pg, "(() => { var D = globalThis.D; return !!(D && D.calendar && D.calendar.length === 2513); })()", 90)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    out["reb_run"] = wait(pg, "(() => { var e = document.getElementById('runState'); return !!(e && (e.textContent||'').indexOf('已更新') >= 0); })()", 240)
    time.sleep(2)
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡验证策略'; var s = document.getElementById('saveSt'); if (s) s.click(); })()")
    time.sleep(1.5)
    out["reb_saved"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m).filter(function(k){ return m[k].mode === 'rebalance'; }).length; })()")
    pg.evaluate("(() => { var t = document.getElementById('tabStrategies'); if (t) t.click(); })()")
    time.sleep(2)
    pg.evaluate("(() => { var l = document.getElementById('stListV'); if (l) { var rows = l.querySelectorAll('.srow'); for (var i=0;i<rows.length;i++){ if ((rows[i].textContent||'').indexOf('再平衡验证策略') >= 0) { rows[i].click(); return; } } } })()")
    out["reb_detail"] = wait(pg, "(() => { var d = document.getElementById('stPosBuy'); return !!(d && (d.textContent||'').indexOf('当前持仓') >= 0 && (d.textContent||'').indexOf('空仓') < 0 && (d.textContent||'').indexOf('持仓比例') >= 0); })()", 180)
    time.sleep(1)
    out["reb_pos"] = pg.evaluate("(() => { var d = document.getElementById('stPosBuy'); return d ? (d.textContent||'').replace(/\\s+/g,' ').slice(0,480) : null; })()")
    pg.screenshot(path=SHOT + "/t_reb_detail.png")

    out["errs"] = errs[:8]
    b.close()

print(json.dumps(out, ensure_ascii=False, indent=1))