#!/usr/bin/env python3
# 重名询问验证：网格/轮动/再平衡 覆盖/另存/取消
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

def modalState(pg):
    return pg.evaluate("(() => { var m = document.getElementById('dupModal'); return m ? { disp: m.style.display, name: (document.getElementById('dupName')||{}).textContent } : null; })()")

def clickDup(pg, btn):
    pg.evaluate("(() => { var b = document.getElementById('dup' + 'Overwrite'); })()")  # noop
    pg.evaluate("((id) => { var b = document.getElementById(id); if (b) b.click(); })", btn)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)

    # ============ 网格：同名 → 另存为新 ============
    pg.click("#tabGrid")
    time.sleep(2)
    pg.evaluate("(() => { var gb = document.getElementById('gridPoolBox'); if (gb) { var cbs = gb.querySelectorAll('label input[type=checkbox]'); cbs.forEach(function (cb) { var lab = cb.closest('label'); if (lab && (lab.textContent||'').indexOf('510050.SH') >= 0) cb.click(); }); } })()")
    time.sleep(0.5)
    pg.evaluate("(() => { var btns = Array.prototype.slice.call(document.querySelectorAll('button')); var t = btns.filter(function (x) { return x.textContent.indexOf('计算适配度评分') >= 0; })[0]; if (t) t.click(); })()")
    wait(pg, "(() => { var t = document.getElementById('gridScoreTable'); return !!(t && t.querySelectorAll('tbody tr').length > 0); })()", 150)
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(1.2)
    pg.evaluate("(() => { var n = document.getElementById('gridStName'); if (n) n.value = '网格验证'; })()")
    pg.evaluate("(() => { var s = document.getElementById('gridSaveBtn'); if (s) s.click(); })()")
    time.sleep(1.5)
    out["grid_saved1"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m); })()")
    # 再次同名保存 → 弹窗
    pg.evaluate("(() => { var n = document.getElementById('gridStName'); if (n) n.value = '网格验证'; var s = document.getElementById('gridSaveBtn'); if (s) s.click(); })()")
    time.sleep(1.0)
    out["grid_dup_modal"] = modalState(pg)
    clickDup(pg, "dupNew")
    time.sleep(1.5)
    out["grid_saved2"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m); })()")

    # ============ 轮动：同名 → 覆盖 ============
    pg.click("#tabRotation")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['510300.SH','159915.SZ'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.click("#nextBtn")
    time.sleep(3)
    pg.evaluate("(() => { var u = document.getElementById('mfAddUsage'); var k = document.getElementById('mfAddKind'); var b = document.getElementById('mfAddBtn'); if (u) { u.value = 'rank'; u.dispatchEvent(new Event('change')); } if (k) { k.value = 'roc'; k.dispatchEvent(new Event('change')); } if (b) b.click(); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var s = document.getElementById('sellKind'); var v = document.getElementById('sellVal'); if (s) { s.value = 'hold_days'; s.dispatchEvent(new Event('change')); } if (v) { v.value = '5'; v.dispatchEvent(new Event('change')); } var sb = document.getElementById('sellBtn'); if (sb) sb.click(); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    wait(pg, "(() => { var e = document.getElementById('runState'); return !!(e && (e.textContent||'').indexOf('已更新') >= 0); })()", 240)
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '轮动验证'; var s = document.getElementById('saveSt'); if (s) s.click(); })()")
    time.sleep(1.5)
    out["rot_saved1"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m); })()")
    # 同名再存 → 弹窗 → 覆盖（记录覆盖前 saved_at 对比）
    out["rot_before"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return m['轮动验证'] ? m['轮动验证']._saved_at : null; })()")
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '轮动验证'; var s = document.getElementById('saveSt'); if (s) s.click(); })()")
    time.sleep(1.0)
    out["rot_dup_modal"] = modalState(pg)
    clickDup(pg, "dupOverwrite")
    time.sleep(1.5)
    out["rot_after"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return m['轮动验证'] ? m['轮动验证']._saved_at : null; })()")
    out["rot_keys"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m); })()")

    # ============ 再平衡：同名 → 取消 ============
    pg.click("#tabRebalance")
    time.sleep(2)
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (['513500.SH','518880.SH','511010.SH','511990.SH'].indexOf(c) >= 0) cb.click(); }); })()")
    time.sleep(0.8)
    pg.evaluate("(() => { var ss = document.getElementById('rebStyleSel'); if (ss) { ss.value = 'custom'; ss.dispatchEvent(new Event('change')); } var vals = { '513500.SH': '40', '518880.SH': '30', '511010.SH': '20', '511990.SH': '10' }; document.querySelectorAll('#poolBox .wIn').forEach(function (x) { var c = x.getAttribute('data-code'); if (vals[c]) { x.value = vals[c]; x.dispatchEvent(new Event('change', { bubbles: true })); } }); })()")
    time.sleep(0.6)
    pg.evaluate("(() => { var nb = document.getElementById('nextBtn'); if (nb) nb.click(); })()")
    wait(pg, "(() => { var D = globalThis.D; return !!(D && D.calendar && D.calendar.length === 2513); })()", 120)
    pg.evaluate("(() => { window.WufuUI.run(); })()")
    wait(pg, "(() => { var e = document.getElementById('runState'); return !!(e && (e.textContent||'').indexOf('已更新') >= 0); })()", 240)
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡验证'; var s = document.getElementById('saveSt'); if (s) s.click(); })()")
    time.sleep(1.5)
    out["reb_saved1"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m); })()")
    # 同名 → 取消（关闭按钮）
    pg.evaluate("(() => { var n = document.getElementById('stName'); if (n) n.value = '再平衡验证'; var s = document.getElementById('saveSt'); if (s) s.click(); })()")
    time.sleep(1.0)
    out["reb_dup_modal"] = modalState(pg)
    clickDup(pg, "dupCancel")
    time.sleep(1.0)
    out["reb_after_cancel"] = pg.evaluate("(() => { var m = JSON.parse(localStorage.getItem('wufu_strategies_v1') || '{}'); return Object.keys(m); })()")
    out["reb_modal_hidden"] = pg.evaluate("(() => { var m = document.getElementById('dupModal'); return m ? m.style.display : null; })()")

    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
