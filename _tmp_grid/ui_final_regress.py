import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1200)
    # ===== 场景1：直接进网格页（不点回测页）→ 评分 + 回测（D 自动加载）=====
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(500)
    pg.evaluate("document.querySelectorAll('#gridPoolBox label').forEach(function(l){ var inp=l.querySelector('input'); if(inp && !inp.checked) inp.click(); });")
    pg.click("#gridScoreBtn")
    for _ in range(60):
        if pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length") > 0: break
        pg.wait_for_timeout(1000)
    print("场景1 评分表行数:", pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length"))
    pg.click("#gridRunBtn")
    for _ in range(90):
        st = pg.evaluate("document.getElementById('gridRunState').textContent")
        if "完成" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("场景1 runState:", st, "| KPI:", pg.evaluate("[...document.querySelectorAll('#gridKpis .kpi .v')].map(x=>x.textContent)"))
    # ===== 场景2：回测页 nextBtn → step2（D 加载）+ 出结果 =====
    pg.evaluate("location.hash = '#/backtest'")
    pg.wait_for_timeout(400)
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(300)
    pg.evaluate("document.getElementById('nextBtn').click()")
    for _ in range(90):
        st2 = pg.evaluate("getComputedStyle(document.getElementById('step2')).display")
        if st2 != "none": break
        pg.wait_for_timeout(1000)
    print("场景2 step2:", st2)
    for _ in range(90):
        rs = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in rs or "失败" in rs or "无" in rs: break
        pg.wait_for_timeout(1000)
    print("场景2 runState:", rs)
    # ===== 场景3：D 已就绪后切网格页 → 立即评分 =====
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(500)
    pg.click("#gridScoreBtn")
    for _ in range(30):
        if pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length") > 0: break
        pg.wait_for_timeout(500)
    print("场景3 评分表行数:", pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length"))
    print("溢出:", pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    b.close()
print("ERRS:", json.dumps(errs[:6], ensure_ascii=False))
