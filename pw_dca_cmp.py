from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()

def run(mode):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        pg = b.new_page(viewport={"width":1440,"height":900})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
        pg.wait_for_timeout(3000)
        pg.click("text=定投回测"); pg.wait_for_timeout(1000)
        pg.evaluate("""() => {
          const cbs = [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.offsetParent!==null);
          cbs.slice(0,3).forEach(c=>c.click());
        }""")
        pg.wait_for_timeout(300)
        pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2000)
        pg.select_option("#dcaDivSel", mode)
        pg.wait_for_timeout(200)
        pg.evaluate("""() => {
          const btns = [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
          let tgt=null;
          for (const b of btns){ if(b.innerText.trim()==='运行回测'){tgt=b;break;} }
          if(tgt) tgt.click();
        }""")
        pg.wait_for_timeout(3000)
        # 抓定投指标卡数字：找含"定投"或收益关键词的卡片文本
        out = pg.evaluate("""() => {
          const txt = document.body.innerText;
          const i = txt.indexOf('定投');
          const seg = txt.slice(i, i+1500);
          return {seg, errs: window.__err || ''};
        }""")
        b.close()
        return out

r1 = run("reinvest")
r2 = run("cash")
print("=== reinvest 段 ===")
print(r1['seg'].replace('\n',' | ')[:800])
print("=== cash 段 ===")
print(r2['seg'].replace('\n',' | ')[:800])
