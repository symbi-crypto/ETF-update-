import json
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/backtest'; }")
    pg.wait_for_timeout(800)
    # 默认全池已勾选？先看勾选数
    cnt = pg.evaluate("() => { var n=0; document.querySelectorAll('#poolBox input[type=checkbox]').forEach(function(c){ if(c.checked) n++; }); return n; }")
    print("默认勾选:", cnt)
    if cnt == 0:
        pg.evaluate("() => document.querySelector('#poolAll') && document.querySelector('#poolAll').click()")
        pg.wait_for_timeout(300)
    # 下一步
    pg.evaluate("() => { var b = document.querySelector('#nextBtn'); if (b) b.click(); }")
    pg.wait_for_timeout(1500)
    # 运行（默认配置，卖出条件 hold_days 10 默认？直接跑）
    pg.evaluate("() => { var b = document.querySelector('#runBtn'); if (b) b.click(); }")
    pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && s.textContent && s.textContent.indexOf('已更新')>=0; }", timeout=240000)
    print("runState:", pg.evaluate("() => document.querySelector('#runState').textContent"))
    kpi = pg.evaluate("""() => {
      var t = document.querySelector('#result') ? document.querySelector('#result').textContent : '';
      var kpis = {};
      document.querySelectorAll('.kpi .v, #result .kpi').forEach(function(e){ kpis[e.className] = e.textContent; });
      var m = t.match(/累计收益[\\s\\S]{0,30}/);
      return { kpiText: t.replace(/\\s+/g,' ').slice(0,400), m: m ? m[0] : null };
    }""")
    print("KPI:", kpi['kpiText'][:300])
    print("pageerror:", errs[:3])
    b.close()
