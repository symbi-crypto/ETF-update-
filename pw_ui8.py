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
    seg = pg.evaluate("""() => {
      const s2 = document.getElementById('step2');
      const t = s2.innerText;
      const i = t.indexOf('因子管理');
      return t.slice(Math.max(0,i-100), i+700);
    }""")
    print(seg)
    # 因子管理区的添加按钮
    btns = pg.evaluate("""() => {
      const adds = [...document.querySelectorAll('#step2 button')].filter(b=>b.innerText.trim()==='添加' && b.offsetParent!==null);
      const pos = adds.map((b,i)=>({i, y: Math.round(b.getBoundingClientRect().top), ctx: b.closest('div[class*=card],div[class*=Card],div[class*=sec]') ? 'in-card' : '?'}));
      return {n: adds.length, pos};
    }""")
    print("添加按钮:", btns)
    b.close()
