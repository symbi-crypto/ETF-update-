from playwright.sync_api import sync_playwright
import sys, re
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
          // 跳过分类标题项（A股宽基(23只)），选真正的标的：取 innerText 含 .SH/.SZ 的
          cbs.slice(0,8).forEach(c=>c.click());
        }""")
        pg.wait_for_timeout(300)
        pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2000)
        pg.select_option("#dcaDivSel", mode)
        pg.wait_for_timeout(200)
        pg.evaluate("""() => {
          const btns = [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
          for (const b of btns){ if(b.innerText.trim()==='运行回测'){ b.click(); break; } }
        }""")
        pg.wait_for_timeout(4000)
        # 滚动到底部结果区
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        pg.wait_for_timeout(800)
        # 抓 XIRR/期末等数字
        out = pg.evaluate("""() => {
          const txt = document.body.innerText;
          const keys = ['XIRR','期末资产','累计投入','总收益','年化'];
          const res = {};
          keys.forEach(k=>{
            const i = txt.indexOf(k);
            res[k] = i>=0 ? txt.slice(i, i+120).replace(/\\n/g,' ') : null;
          });
          return res;
        }""")
        b.close()
        return out, errs

r1, e1 = run("reinvest")
r2, e2 = run("cash")
print("=== reinvest ===", r1, "errs:", e1)
print("=== cash ===", r2, "errs:", e2)
