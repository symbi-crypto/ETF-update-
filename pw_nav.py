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
    # 找 nav 结构
    nav = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('nav *, header *, [class*=nav]')].slice(0,40);
      return els.map(e => e.tagName + '.' + (e.className||'') + '=' + (e.innerText||'').trim().slice(0,12)).filter(x=>x.length<40);
    }""")
    print("nav 候选:", nav)
    # 点击包含"我的策略"的元素
    clicked = pg.evaluate("""() => {
      const cands = [...document.querySelectorAll('div,span,b,a,button,li')].filter(e => e.innerText && e.innerText.trim() === '我的策略' && e.children.length <= 2);
      if (!cands.length) return false;
      const el = cands[cands.length-1]; el.click(); return el.outerHTML.slice(0,80);
    }""")
    print("点击:", clicked)
    pg.wait_for_timeout(800)
    print("viewStrategies display:", pg.evaluate("document.getElementById('viewStrategies').style.display"))
    b.close()
