from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    pg.click("text=轮动回测"); pg.wait_for_timeout(800)
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    for bx in boxes[:5]: bx.click()
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    # dump step2 里含"卖出"的片段
    seg = pg.evaluate("""() => {
      const s2 = document.getElementById('step2');
      if (!s2) return 'no step2';
      const t = s2.innerText;
      const i = t.indexOf('卖出');
      return 'step2 text len=' + t.length + ' 卖出@' + i + ' :: ' + t.slice(Math.max(0,i-200), i+300);
    }""")
    print(seg)
    # 所有 input/select 概况
    print("inputs:", pg.evaluate("document.querySelectorAll('#step2 input').length"))
    print("selects:", pg.evaluate("document.querySelectorAll('#step2 select').length"))
    b.close()
