import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    info = pg.evaluate("""() => {
      var pb = document.getElementById('poolBox');
      var inputs = pb.querySelectorAll('input');
      var corr = pb.querySelectorAll('.corr-grp');
      var labs = pb.querySelectorAll('label');
      var html0 = pb.innerHTML.slice(0, 500);
      return { inputs: inputs.length, corr: corr.length, labels: labs.length, sample: html0 };
    }""")
    print("poolBox:", json.dumps(info, ensure_ascii=False)[:700])
    b.close()
