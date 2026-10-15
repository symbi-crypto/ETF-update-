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
    # 分组全选
    pg.evaluate("""() => { document.querySelectorAll('#poolBox .corr-grp input').forEach(x => { if (!x.checked) x.click(); }); }""")
    pg.wait_for_timeout(600)
    n = pg.evaluate("[...document.querySelectorAll('#poolBox input:checked')].length")
    print("勾选数:", n)
    # 加卖出条件：持有天数 ≥ 5
    pg.select_option("#sellKind", "hold_days")
    pg.fill("#sellVal", "5")
    pg.click("#sellBtn")
    pg.wait_for_timeout(300)
    cnt = pg.evaluate("document.getElementById('sellCount').textContent")
    print("卖出条件:", cnt)
    pg.click("#nextBtn")
    for _ in range(150):
        st = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    print("runState:", st)
    kpi = pg.evaluate("[...document.querySelectorAll('#kpis .kpi .v')].map(x => x.textContent)")
    print("主回测 KPI:", kpi)
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
