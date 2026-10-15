import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("CON:"+m.type+":"+m.text[:300]) if m.type in ("error","warning") else None)
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1000)
    r = pg.evaluate("""() => ({
      poolRows: document.querySelectorAll('#poolBox .srow, #poolBox label').length,
      poolCount: (document.getElementById('poolCount')||{}).textContent,
      modeSel: !!document.getElementById('modeSel'),
      kpis: document.querySelectorAll('#kpis .kpi').length,
      runState: (document.getElementById('runState')||{}).textContent
    })""")
    print("启动态:", json.dumps(r, ensure_ascii=False))
    # 手动调 ensureData（测试其可用性）
    pg.evaluate("""() => { window.__dbgCalled = false; if (typeof ensureData === 'function') { ensureData(function(){ window.__dbgCalled = true; }); } }""")
    pg.wait_for_timeout(5000)
    print("ensureData 可调:", pg.evaluate("typeof ensureData"), "回调触发:", pg.evaluate("window.__dbgCalled"))
    print("D 加载:", pg.evaluate("typeof D !== 'undefined' && D !== null"))
    print("ERRS:", json.dumps(errs[:8], ensure_ascii=False))
    b.close()
