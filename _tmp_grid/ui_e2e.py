import json, sys, time
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html#/grid"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(2500)
    # 网格页可见？
    vis = pg.evaluate("document.getElementById('viewGrid') ? getComputedStyle(document.getElementById('viewGrid')).display : 'none'")
    print("viewGrid display:", vis)
    # 勾 6 只宽基
    for code in ["510300.SH","510500.SH","159915.SZ","510050.SH","512100.SH","588000.SH"]:
        try:
            pg.evaluate("""(c) => { const l = [...document.querySelectorAll('#gridPoolBox label')].find(x => x.textContent.indexOf(c) >= 0); if (l) { const inp = l.querySelector('input'); if (inp && !inp.checked) inp.click(); } }""", code)
        except Exception as e: print("check err", code, e)
    pg.wait_for_timeout(400)
    # 评分
    pg.click("#gridScoreBtn")
    pg.wait_for_timeout(6000)
    rows = pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length")
    print("评分表行数:", rows)
    # 参数
    prows = pg.evaluate("document.querySelectorAll('#gridParamTable tbody tr').length")
    print("参数表行数:", prows)
    # 运行
    pg.click("#gridRunBtn")
    for _ in range(60):
        st = pg.evaluate("document.getElementById('gridRunState').textContent")
        if "已更新" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("runState:", st)
    pg.wait_for_timeout(1500)
    # KPI
    kpi = pg.evaluate("[...document.querySelectorAll('#gridKpis .kpi-val')].map(x => x.textContent)")
    print("KPI:", kpi)
    tr = pg.evaluate("document.querySelectorAll('#gridTradeTable tbody tr').length")
    hr = pg.evaluate("document.querySelectorAll('#gridHealthTable tbody tr').length")
    print("trades 行:", tr, "| health 行:", hr)
    navInit = pg.evaluate("window.GridView && GridView._navChart ? GridView._navChart.getOption().series.length : -1")
    print("nav chart series:", navInit)
    # 默认回测锚点：切回回测页跑一次
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html#/backtest", wait_until="load")
    pg.wait_for_timeout(2500)
    pg.click("#runBtn")
    for _ in range(90):
        st2 = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st2 or "失败" in st2: break
        pg.wait_for_timeout(1000)
    print("主回测 runState:", st2)
    k = pg.evaluate("[...document.querySelectorAll('#kpis .kpi-val')].map(x => x.textContent)")
    print("主回测 KPI:", k)
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
