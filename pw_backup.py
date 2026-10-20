from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
for name, path in [("备份(修改前)", "web_live/_backup/index_before_symstats.html"),
                   ("当前", "web_live/index.html")]:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page()
        pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/" + path)
        pg.wait_for_timeout(8000)
        ens = pg.evaluate("typeof ensureData")
        d = pg.evaluate("typeof D !== 'undefined' ? 'loaded' : 'no'")
        print(f"{name}: ensureData={ens} D={d}")
        b.close()
