import json, time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    # ===== 主回测回归（默认锚点）=====
    pg.wait_for_function("() => document.querySelector('#poolBox')", timeout=60000)
    pg.evaluate("""() => { var l=document.querySelectorAll('#poolBox label input'); l.forEach(function(i){ i.click(); }); }""")
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { var u=document.querySelector('#mfAddUsage'); if(u){ u.value='rank'; } var k=document.querySelector('#mfAddKind'); if(k){ k.value='roc'; } var b=document.querySelector('#mfAddBtn'); if(b){ b.click(); } }""")
    pg.wait_for_timeout(300)
    pg.evaluate("""() => { var k=document.querySelector('#sellKind'); if(k){ k.value='hold_days'; } var v=document.querySelector('#sellVal'); if(v){ v.value='5'; } var b=document.querySelector('#sellBtn'); if(b){ b.click(); } }""")
    pg.wait_for_timeout(300)
    pg.evaluate("() => { document.querySelector('#nextBtn').click(); }")
    pg.wait_for_timeout(600)
    pg.evaluate("() => { document.querySelector('#runBtn').click(); }")
    try:
        pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && s.textContent.indexOf('已更新')>=0; }", timeout=120000)
        print("主回测 runState:", pg.evaluate("() => document.querySelector('#runState').textContent"))
        print("主回测 KPI 前4:", pg.evaluate("() => Array.from(document.querySelectorAll('#kpis .kpi .v')).slice(0,4).map(x=>x.textContent)"))
    except Exception as e:
        print("主回测超时:", pg.evaluate("() => { var s=document.querySelector('#runState'); return s?s.textContent:null; }"))
    # ===== 网格两步式桌面 =====
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    check("510300.SH"); check("159915.SZ")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    print("网格评分表行数:", pg.evaluate("() => document.querySelectorAll('#gridScoreTable tbody tr').length"))
    print("达标统计:", pg.evaluate("() => { var s=document.querySelector('#gridStat'); return s?s.textContent:null; }"))
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var k=document.querySelector('#gridKpis'); return k && k.querySelectorAll('.kpi').length > 0; }", timeout=120000)
    print("网格 KPI:", pg.evaluate("() => Array.from(document.querySelectorAll('#gridKpis .kpi .v')).map(x=>x.textContent)"))
    pg.screenshot(path="_tmp_grid/desk_grid2step.jpg")
    print("pageerror:", errs)
    b.close()
