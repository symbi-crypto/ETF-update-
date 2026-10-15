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
    pg.wait_for_timeout(1200)
    # 场景A：回测页正常流程（nextBtn → 数据加载 → step2）
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(300)
    pg.click("#nextBtn")
    pg.wait_for_timeout(3000)
    print("回测页流程 D 已加载:", pg.evaluate("typeof D !== 'undefined' && D !== null"))
    print("step2 可见:", pg.evaluate("document.getElementById('viewParams') ? getComputedStyle(document.getElementById('viewParams')).display : 'N/A'"))
    # 场景B：切网格页 → 点评分+回测（D 已加载时直接执行）
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(800)
    pg.evaluate("document.querySelectorAll('#gridPoolBox label').forEach(function(l){ var inp=l.querySelector('input'); if(inp && !inp.checked) inp.click(); });")
    pg.click("#gridScoreBtn")
    pg.wait_for_timeout(6000)
    pg.click("#gridRunBtn")
    for _ in range(60):
        st = pg.evaluate("document.getElementById('gridRunState').textContent")
        if "完成" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("桌面网格 runState:", st)
    print("桌面网格 KPI:", pg.evaluate("[...document.querySelectorAll('#gridKpis .kpi .v')].map(x => x.textContent)"))
    print("横向溢出:", pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
