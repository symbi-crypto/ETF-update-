from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    pg.click("text=轮动回测"); pg.wait_for_timeout(600)
    pg.click("text=全选"); pg.wait_for_timeout(300)
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    # step2 按钮
    for bd in pg.query_selector_all("button"):
        t = bd.inner_text().strip()
        if "回测" in t and bd.is_visible():
            print("回测按钮:", repr(t))
    # 找含"回测"且可见的按钮（排除 tab）
    tabs = {"轮动回测","再平衡回测","定投回测"}
    for bd in pg.query_selector_all("button"):
        t = bd.inner_text().strip()
        if t and "回测" in t and t not in tabs and bd.is_visible():
            print("点击:", repr(t))
            bd.click(); break
    pg.wait_for_timeout(8000)
    print("pageerror:", errs[:5])
    sym = pg.evaluate("""() => {
      const el = document.getElementById('symTable');
      if (!el) return 'no symTable';
      const rows = el.querySelectorAll('tbody tr');
      return 'rows=' + rows.length + ' last=' + rows[rows.length-1].innerText.replace(/\\n/g,' | ').slice(0,260);
    }""")
    print("symTable:", sym)
    print("dbDate:", pg.evaluate("document.getElementById('dbDate').textContent"))
    pg.screenshot(path="/tmp/ui_result.png")
    b.close()
