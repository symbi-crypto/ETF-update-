import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
def probe(url):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.goto(url, wait_until="load", timeout=60000)
        pg.wait_for_timeout(1200)
        pg.evaluate("document.getElementById('nextBtn').click()")
        pg.wait_for_timeout(250)
        nb = pg.evaluate("({t: document.getElementById('nextBtn').textContent, d: document.getElementById('nextBtn').disabled})")
        pg.wait_for_timeout(6000)
        d = pg.evaluate("typeof D !== 'undefined' && D !== null")
        b.close()
        return {"nb": nb, "D": d, "errs": errs}
print("BASE(HEAD):", json.dumps(probe("file:///tmp/_base_index.html"), ensure_ascii=False))
print("WORK(修改后):", json.dumps(probe("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"), ensure_ascii=False))
