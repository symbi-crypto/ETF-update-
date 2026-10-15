import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1200)
    # 关键：不进回测页，直接切网格页
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(800)
    print("初始 D:", pg.evaluate("typeof D !== 'undefined' && D !== null"))
    # 勾选（分组头全选）
    pg.evaluate("document.querySelectorAll('#gridPoolBox label').forEach(function(l){ var inp=l.querySelector('input'); if(inp && !inp.checked) inp.click(); });")
    pg.wait_for_timeout(300)
    # 点评分 → 应触发自动加载
    t0 = pg.evaluate("document.getElementById('gridScoreBtn').textContent")
    pg.click("#gridScoreBtn")
    pg.wait_for_timeout(300)
    t1 = pg.evaluate("document.getElementById('gridScoreBtn').textContent")
    print("点击后按钮态:", t0, "->", t1, "| disabled:", pg.evaluate("document.getElementById('gridScoreBtn').disabled"))
    # 加载中重复点击（防重入）
    pg.click("#gridRunBtn")
    # 等加载完成+评分出表
    pg.wait_for_timeout(9000)
    print("评分表行数:", pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length"))
    print("按钮恢复:", pg.evaluate("document.getElementById('gridScoreBtn').textContent"), "/", pg.evaluate("document.getElementById('gridRunBtn').textContent"))
    # 加载中点 run → 自动继续执行 run？评分完成后 run 要求 lastScores——时序上 run 先于评分完成被点 → _needOp=run 但评分还没执行完...
    # 观察 runState
    print("gridRunState:", pg.evaluate("document.getElementById('gridRunState').textContent"))
    # 等 run 自动完成（若 _needOp 覆盖）
    for _ in range(60):
        st = pg.evaluate("document.getElementById('gridRunState').textContent")
        if "完成" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("最终 runState:", pg.evaluate("document.getElementById('gridRunState').textContent"))
    print("KPI:", pg.evaluate("[...document.querySelectorAll('#gridKpis .kpi .v')].map(x => x.textContent)"))
    print("横向溢出:", pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
