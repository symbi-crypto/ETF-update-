from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    pg.click("text=轮动回测"); pg.wait_for_timeout(600)
    # 只勾 4 只加速
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    print("标的总数:", len(boxes))
    for bx in boxes[:4]:
        bx.click()
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2000)
    for bd in pg.query_selector_all("button"):
        if bd.inner_text().strip() == "运行回测" and bd.is_visible():
            bd.click(); break
    pg.wait_for_timeout(10000)
    st = pg.evaluate("document.getElementById('runState') ? document.getElementById('runState').textContent : 'none'")
    print("runState:", st)
    print("pageerror:", errs[:5])
    sym = pg.evaluate("""() => {
      const el = document.getElementById('symTable');
      if (!el) return 'no symTable';
      const rows = el.querySelectorAll('tbody tr');
      let out = 'rows=' + rows.length;
      if (rows.length) out += ' | last=' + rows[rows.length-1].innerText.replace(/\\n/g,' | ').slice(0,300);
      return out;
    }""")
    print("symTable:", sym)
    db = pg.evaluate("document.getElementById('dbDate') ? document.getElementById('dbDate').textContent : 'none'")
    print("dbDate:", db)
    pg.screenshot(path="/tmp/ui_result.png")
    b.close()
