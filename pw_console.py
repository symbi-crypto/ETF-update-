from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("console", lambda m: errs.append((m.type, m.text[:200])))
    pg.on("pageerror", lambda e: errs.append(("pageerror", str(e)[:300])))
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(8000)
    print("=== console 事件 ===")
    for t, txt in errs[:25]:
        print(f"[{t}] {txt}")
    print("总数:", len(errs))
    print("dbDate:", pg.evaluate("document.getElementById('dbDate').textContent"))
    print("ensureData:", pg.evaluate("typeof ensureData"))
    print("body文本:", pg.evaluate("document.body.innerText.slice(0,200)"))
    b.close()
