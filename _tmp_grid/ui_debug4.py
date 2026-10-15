import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.add_init_script("""
      window.__errs = [];
      window.addEventListener('error', function (e) { window.__errs.push((e.message||'')+' | '+(e.filename||'').split('/').pop()+':'+(e.lineno||'')); });
      window.addEventListener('unhandledrejection', function (e) { window.__errs.push('REJ:'+(e.reason&&e.reason.message||e.reason)); });
    """)
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    print("页面级错误:", json.dumps(pg.evaluate("window.__errs"), ensure_ascii=False))
    # 尝试获取 applyModeUI 是否可访问（若 IIFE 挂 window）
    print("window.applyModeUI:", pg.evaluate("typeof window.applyModeUI"))
    print("window.renderPool:", pg.evaluate("typeof window.renderPool"))
    print("poolRows:", pg.evaluate("document.querySelectorAll('#poolBox label, #poolBox .srow').length"))
    b.close()
