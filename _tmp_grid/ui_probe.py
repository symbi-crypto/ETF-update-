import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html#/grid"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(3000)
    info = pg.evaluate("""() => ({
      hash: location.hash,
      boot: typeof boot,
      showView: typeof showView,
      GridView: typeof GridView,
      WufuEngine: typeof WufuEngine,
      D: typeof D,
      POOL: typeof POOL,
      viewGrid: document.getElementById('viewGrid').style.display,
      gridPoolBox: !!document.getElementById('gridPoolBox'),
      hasRows: document.querySelectorAll('#gridPoolBox label').length
    })""")
    print(json.dumps(info, ensure_ascii=False, indent=1))
    b.close()
print("ERRS:", json.dumps(errs[:15], ensure_ascii=False))
