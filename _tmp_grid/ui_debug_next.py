import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("CON:"+m.text) if m.type in ("error","warning") else None)
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1000)
    info = pg.evaluate("""() => ({
      nb: !!document.getElementById('nextBtn'),
      nbText: document.getElementById('nextBtn') && document.getElementById('nextBtn').textContent,
      hash: location.hash,
      viewSel: document.getElementById('viewSelect') ? getComputedStyle(document.getElementById('viewSelect')).display : '?',
      hasDataEl: !!document.getElementById('wufuDataGz'),
      dataElLen: document.getElementById('wufuDataGz') ? document.getElementById('wufuDataGz').textContent.length : 0
    })""")
    print("加载后:", json.dumps(info, ensure_ascii=False))
    # 点 nextBtn
    pg.evaluate("document.getElementById('nextBtn').click()")
    pg.wait_for_timeout(1500)
    info2 = pg.evaluate("""() => ({
      D: typeof D !== 'undefined' && D !== null,
      dataElLen: document.getElementById('wufuDataGz') ? document.getElementById('wufuDataGz').textContent.length : 0
    })""")
    print("点击后1.5s:", json.dumps(info2))
    pg.wait_for_timeout(6000)
    print("点击后7.5s:", pg.evaluate("typeof D !== 'undefined' && D !== null"))
    print("ERRS:", json.dumps(errs[:5], ensure_ascii=False))
    b.close()
