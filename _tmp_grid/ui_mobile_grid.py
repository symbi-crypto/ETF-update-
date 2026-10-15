import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
errs = []
JS_SELL = """() => { const sk = document.getElementById('sellKind'); sk.value = 'hold_days'; sk.dispatchEvent(new Event('change')); document.getElementById('sellVal').value = '5'; document.getElementById('sellBtn').click(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.evaluate(JS_SELL)
    pg.click("#nextBtn")
    pg.wait_for_timeout(3500)
    # 进网格页
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(1200)
    pg.evaluate("""() => { document.querySelectorAll('#gridPoolBox .corr-grp input').forEach(x => { if (!x.checked) x.click(); }); }""")
    pg.wait_for_timeout(400)
    n = pg.evaluate("[...document.querySelectorAll('#gridPoolBox input:checked')].length")
    print("网格勾选:", n)
    pg.click("#gridScoreBtn")
    pg.wait_for_timeout(8000)
    pg.screenshot(path="web_live/_shots/grid_mobile_scores.png")
    print("评分表行数:", pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length"))
    pg.click("#gridRunBtn")
    for _ in range(100):
        st = pg.evaluate("document.getElementById('gridRunState').textContent")
        if "完成" in st or "失败" in st: break
        pg.wait_for_timeout(1000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path="web_live/_shots/grid_mobile_result.png", full_page=False)
    # 溢出检查
    ov = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    print("横向溢出:", ov)
    print("runState:", st)
    print("KPI:", pg.evaluate("[...document.querySelectorAll('#gridKpis .kpi .v')].map(x => x.textContent)"))
    b.close()
print("CONSOLE ERRS:", json.dumps(errs[:10], ensure_ascii=False))
