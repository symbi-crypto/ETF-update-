import json
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/backtest'; }")
    pg.wait_for_timeout(1000)
    d = pg.evaluate("""() => {
      var ids = ['poolAll','poolNone','nextBtn','runBtn','runState','poolBox'];
      var out = {};
      ids.forEach(function(id){ var e = document.getElementById(id); out[id] = e ? '存在' : '缺失'; });
      var cb = document.querySelectorAll('#poolBox input[type=checkbox]');
      out.checked = 0; cb.forEach(function(c){ if(c.checked) out.checked++; });
      out.total = cb.length;
      return out;
    }""")
    print(d)
    b.close()
