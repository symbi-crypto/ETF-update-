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
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(200)
    pg.click("#nextBtn")
    for t in [2, 4, 6, 8]:
        pg.wait_for_timeout(2000)
        d = pg.evaluate("typeof D !== 'undefined' && D !== null")
        step2 = pg.evaluate("document.getElementById('viewParams') ? getComputedStyle(document.getElementById('viewParams')).display : 'N/A'")
        print("+%ds: D=%s step2=%s" % (t*2 if t==2 else t, d, step2))
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
