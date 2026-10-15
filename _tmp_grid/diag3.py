import time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True,
        executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("C:"+m.text) if m.type=="error" else None)
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    time.sleep(2)
    st = pg.evaluate("""() => {
      var g = window.GridView;
      var keys = g ? Object.keys(g) : [];
      return { hasGridSave: typeof g.gridSave, keys: keys, hasCollectCfg: typeof g.collectCfg, hasApplySaved: typeof g.applySaved };
    }""")
    print("GRIDVIEW:", st)
    print("ERRORS:", errs[:6])
    b.close()
