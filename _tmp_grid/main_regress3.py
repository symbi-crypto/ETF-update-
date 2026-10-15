import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { const sk = document.getElementById('sellKind'); if(sk){ sk.value='hold_days'; sk.dispatchEvent(new Event('change')); document.getElementById('sellVal').value='5'; document.getElementById('sellBtn').click(); } }""")
    pg.evaluate("document.getElementById('nextBtn').click()")
    pg.wait_for_function("() => (window.D || window.__GRID_D) !== undefined", timeout=120000)
    pg.wait_for_timeout(600)
    for _ in range(300):
        rs = pg.evaluate("document.getElementById('runState').textContent")
        if "已更新" in rs or "失败" in rs or "未运行" in rs:
            break
        pg.wait_for_timeout(1000)
    print("runState:", rs)
    print("KPI:", pg.evaluate("[...document.querySelectorAll('#kpis .kpi .v, .kpi .v')].map(x=>x.textContent)"))
    print("净值图容器:", pg.evaluate("!!document.getElementById('navChart')"))
    print("回撤图容器:", pg.evaluate("!!document.getElementById('ddChart')"))
    print("pageerror:", errs[:3])
    b.close()
