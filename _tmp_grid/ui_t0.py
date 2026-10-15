import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
def probe(url, name):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto(url, wait_until="load", timeout=60000)
        pg.wait_for_timeout(1000)
        # 同步点击并立即采样（同一 evaluate 内）
        r = pg.evaluate("""() => {
          const nb = document.getElementById('nextBtn');
          nb.click();
          return { t: nb.textContent, d: nb.disabled };
        }""")
        pg.wait_for_timeout(12000)
        d = pg.evaluate("typeof D !== 'undefined' && D !== null")
        # 若 D 加载完成，查看 step2
        st2 = pg.evaluate("document.getElementById('step2') ? getComputedStyle(document.getElementById('step2')).display : '?'")
        b.close()
        print(name, "0ms采样:", json.dumps(r, ensure_ascii=False), "| 12s后 D:", d, "| step2:", st2)
probe("file:///tmp/_base_index.html", "BASE")
probe("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html", "WORK")
