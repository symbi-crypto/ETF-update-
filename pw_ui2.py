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
    pg.click("text=轮动回测")
    pg.wait_for_timeout(800)
    # 所有可见按钮及文本
    for bd in pg.query_selector_all("button"):
        if bd.is_visible():
            print("BTN:", repr(bd.inner_text().strip()))
    # step1 弹窗里的输入/按钮——用 evaluate 直接调 UI 函数更稳？
    # 先试点击"全选" + 确定类按钮
    pg.click("text=全选")
    pg.wait_for_timeout(300)
    # 找"下一步"按钮
    for bd in pg.query_selector_all("button"):
        t = bd.inner_text().strip()
        if "下一步" in t or "开始回测" in t or "确定" in t:
            print("目标按钮:", repr(t), "visible:", bd.is_visible())
    b.close()
