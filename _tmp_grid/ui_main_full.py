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
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(300)
    pg.evaluate("""() => { const sk = document.getElementById('sellKind'); sk.value='hold_days'; sk.dispatchEvent(new Event('change')); document.getElementById('sellVal').value='5'; document.getElementById('sellBtn').click(); }""")
    pg.evaluate("document.getElementById('nextBtn').click()")
    for _ in range(120):
        rs = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in rs or "失败" in rs: break
        pg.wait_for_timeout(1000)
    print("runState:", rs)
    print("KPI:", pg.evaluate("[...document.querySelectorAll('#kpis .kpi .v')].map(x=>x.textContent)"))
    print("净值图容器存在:", pg.evaluate("!!document.getElementById('navChart')"))
    b.close()
print("ERRS:", json.dumps(errs[:6], ensure_ascii=False))
