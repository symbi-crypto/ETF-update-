import time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True,
        executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs=[]
    pg.on("pageerror", lambda e: errs.append("PE:"+str(e)))
    pg.on("console", lambda m: errs.append("C:"+m.text) if m.type=="error" else None)
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    # 主回测流程：勾选标的（第一步）
    pg.evaluate("""() => { var l = document.querySelectorAll('#poolBox .corr-grp input'); var n=0; for (var i=0;i<l.length && n<2;i++){ if(!l[i].checked){ l[i].click(); n++; } } }""")
    pg.wait_for_timeout(300)
    # 加排名因子 roc
    pg.evaluate("""() => {
      var u = document.querySelector('#mfAddUsage'); var k = document.querySelector('#mfAddKind'); var btn = document.querySelector('#mfAddBtn');
      if (u && k && btn){ u.value='rank'; k.value='roc'; btn.click(); }
    }""")
    pg.wait_for_timeout(300)
    # 卖出条件 hold_days 5
    pg.evaluate("""() => {
      var sk = document.querySelector('#sellKind'); var sv = document.querySelector('#sellVal'); var sb = document.querySelector('#sellBtn');
      if (sk && sv && sb){ sk.value='hold_days'; sv.value=5; sb.click(); }
    }""")
    pg.wait_for_timeout(300)
    # 下一步 → 运行
    pg.evaluate("() => { var b=document.querySelector('#nextBtn'); if(b) b.click(); }")
    pg.wait_for_function("() => { var b=document.querySelector('#runBtn'); return b && b.style.display !== 'none'; }", timeout=60000)
    pg.wait_for_timeout(500)
    pg.evaluate("() => { var b=document.querySelector('#runBtn'); if(b) b.click(); }")
    try:
        pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && (s.textContent||'').indexOf('已更新') >= 0; }", timeout=120000)
    except Exception as e:
        pg.wait_for_timeout(5000)
    rs = pg.evaluate("() => { var s=document.querySelector('#runState'); return s?s.textContent:'no-runState'; }")
    kpi = pg.evaluate("() => { var k=document.querySelector('#kpiGrid')||document.querySelector('#kpis'); if(!k) return null; return Array.from(k.querySelectorAll('.kpi .v')).slice(0,4).map(x=>x.textContent); }")
    print("runState:", rs)
    print("KPI(前4):", kpi)
    # 我的策略页（renderStrategyList 主链路）
    pg.evaluate("() => { location.hash = '#/strategies'; }")
    pg.wait_for_function("() => document.querySelector('#stListV')", timeout=30000)
    pg.wait_for_timeout(4000)
    cnt = pg.evaluate("() => { var r=document.querySelectorAll('#stListV .srow'); return r.length; }")
    print("策略列表行数:", cnt)
    # 网格页桌面表格形态
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    pg.evaluate("""() => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp=l[i].querySelector('input'); if(inp && !inp.checked && l[i].textContent.indexOf('510300')>=0){ inp.click(); break; } } }""")
    pg.wait_for_timeout(200)
    pg.evaluate("() => { var b=document.querySelector('#gridScoreBtn'); if(b) b.click(); }")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    disp = pg.evaluate("() => { var tr = document.querySelector('#gridScoreTable tbody tr'); return getComputedStyle(tr).display; }")
    thead = pg.evaluate("() => { var th = document.querySelector('#gridScoreTable thead'); return getComputedStyle(th).display; }")
    col = pg.evaluate("() => { var i = document.querySelector('#gridParamTable input'); return i? getComputedStyle(i).color:null; }")
    print("桌面 评分表 tr display(应 table-row):", disp, "| thead(应 table-header-group):", thead, "| input色:", col)
    print("ERRORS:", errs[:6])
    b.close()
