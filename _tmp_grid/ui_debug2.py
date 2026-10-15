import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("CON:"+m.type+":"+m.text[:200]) if m.type in ("error","warning") else None)
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1000)
    base = pg.evaluate("""() => ({
      GridView: typeof window.GridView,
      Engine: typeof window.WufuEngine,
      ensureData: typeof window.ensureData,
      step1: !!document.getElementById('step1'),
      step2: !!document.getElementById('step2'),
      nbText: document.getElementById('nextBtn').textContent
    })""")
    print("基线:", json.dumps(base, ensure_ascii=False))
    pg.evaluate("document.getElementById('nextBtn').click()")
    pg.wait_for_timeout(200)
    after = pg.evaluate("""() => ({
      nbText: document.getElementById('nextBtn').textContent,
      nbDisabled: document.getElementById('nextBtn').disabled
    })""")
    print("点击后200ms:", json.dumps(after, ensure_ascii=False))
    pg.wait_for_timeout(8000)
    print("8s后 D:", pg.evaluate("typeof D !== 'undefined' && D !== null"))
    print("ERRS:", json.dumps(errs[:8], ensure_ascii=False))
    b.close()
