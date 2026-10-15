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
    pg.click("#nextBtn")
    pg.wait_for_timeout(4000)
    # 勾全池（选全部）
    pg.evaluate("""() => { const b = document.querySelector('#selAll'); if (b) b.click(); }""")
    pg.wait_for_timeout(500)
    n = pg.evaluate("[...document.querySelectorAll('#poolBox input:checked')].length")
    print("勾选数:", n)
    pg.click("#runBtn")
    for _ in range(120):
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("runState:", st)
    pg.wait_for_timeout(1200)
    kpi = pg.evaluate("[...document.querySelectorAll('#kpis .kpi .v')].map(x => x.textContent)")
    print("主回测 KPI:", kpi)
    # 默认（不勾全选时 boot 的默认回测）之前已跑过——重跑一次默认看锚点
    pg.evaluate("location.reload()")
    pg.wait_for_timeout(1200)
    pg.click("#nextBtn")
    for _ in range(120):
        st2 = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st2 or "失败" in st2: break
        pg.wait_for_timeout(1000)
    print("默认回测 runState:", st2)
    print("默认回测 KPI:", pg.evaluate("[...document.querySelectorAll('#kpis .kpi .v')].map(x => x.textContent)"))
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
