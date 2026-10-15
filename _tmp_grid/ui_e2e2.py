import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    # 下一步
    pg.click("#nextBtn")
    pg.wait_for_timeout(4000)
    print("boot后 step2:", pg.evaluate("document.getElementById('step2').style.display"))
    # 切网格
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(1500)
    print("viewGrid:", pg.evaluate("getComputedStyle(document.getElementById('viewGrid')).display"))
    # 勾 6 只
    for code in ["510300.SH","510500.SH","159915.SZ","510050.SH","512100.SH","588000.SH"]:
        pg.evaluate("""(c) => { const l = [...document.querySelectorAll('#gridPoolBox label')].find(x => x.textContent.indexOf(c) >= 0); if (l) { const inp = l.querySelector('input'); if (inp && !inp.checked) inp.click(); } }""", code)
    pg.wait_for_timeout(400)
    n = pg.evaluate("[...document.querySelectorAll('#gridPoolBox input:checked')].length")
    print("已勾选:", n)
    pg.click("#gridScoreBtn")
    pg.wait_for_timeout(8000)
    print("评分表行数:", pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length"))
    print("参数表行数:", pg.evaluate("document.querySelectorAll('#gridParamTable tbody tr').length"))
    pg.click("#gridRunBtn")
    for _ in range(90):
        st = pg.evaluate("document.getElementById('gridRunState').textContent")
        if "已更新" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("runState:", st)
    pg.wait_for_timeout(1500)
    print("KPI:", pg.evaluate("[...document.querySelectorAll('#gridKpis .kpi .v')].map(x => x.textContent)"))
    print("trades 行:", pg.evaluate("document.querySelectorAll('#gridTradeTable tbody tr').length"))
    print("health 行:", pg.evaluate("document.querySelectorAll('#gridHealthTable tbody tr').length"))
    nc = pg.evaluate("(window.GridView && GridView._navChart) ? GridView._navChart.getOption().series.length : document.querySelectorAll('#gridNavChart canvas').length")
    print("nav chart series:", nc)
    # 切回主回测跑默认
    pg.evaluate("location.hash = '#/backtest'")
    pg.wait_for_timeout(1200)
    pg.click("#runBtn")
    for _ in range(90):
        st2 = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st2 or "失败" in st2: break
        pg.wait_for_timeout(1000)
    print("主回测 runState:", st2)
    print("主回测 KPI:", pg.evaluate("[...document.querySelectorAll('#kpis .kpi .v')].map(x => x.textContent)"))
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
