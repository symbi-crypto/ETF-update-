from playwright.sync_api import sync_playwright
import sys, time
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
    # tab 轮动回测
    pg.click("text=轮动回测")
    pg.wait_for_timeout(800)
    # step1：勾选 3 只（用 checkbox）
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    print("可勾选标的:", len(boxes))
    for bx in boxes[:3]:
        bx.click()
    pg.wait_for_timeout(300)
    # 下一步
    pg.click("text=下一步：开始回测")
    pg.wait_for_timeout(1500)
    # step2 回测按钮
    btns = pg.query_selector_all("button")
    names = [b.inner_text().strip() for b in btns if b.is_visible()]
    print("可见按钮:", names[:12])
    # 点回测（找含"回测"的按钮）
    for b in btns:
        t = b.inner_text().strip()
        if "回测" in t and b.is_visible():
            b.click(); print("点击:", t); break
    pg.wait_for_timeout(6000)
    print("pageerror:", errs[:3])
    # 检查按品种统计表
    sym = pg.evaluate("""() => {
      const el = document.getElementById('symTable');
      if (!el) return 'no symTable';
      const rows = el.querySelectorAll('tbody tr');
      return 'rows=' + rows.length + ' | ' + rows[rows.length-1].innerText.slice(0,200);
    }""")
    print("symTable:", sym)
    # 检查 dbDate 最终
    print("dbDate:", pg.evaluate("document.getElementById('dbDate').textContent"))
    pg.screenshot(path="/tmp/ui_result.png", full_page=False)
    b.close()
