from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:400]))
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    pg.click("text=轮动回测"); pg.wait_for_timeout(800)
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    for bx in boxes[:5]: bx.click()
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    pg.select_option("#mfAddKind", "roc")
    pg.select_option("#mfAddUsage", "rank")
    pg.click("#mfAddBtn")
    pg.wait_for_timeout(600)
    pg.evaluate("""() => { const a=[...document.querySelectorAll('#step2 button')].filter(b=>b.innerText.trim()==='添加' && b.offsetParent!==null); if(a.length>=3) a[2].click(); }""")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='运行回测'); if(b) b.click(); }""")
    pg.wait_for_timeout(2000)
    # 全面 dump 错误信息：notice、pageErr、所有红色文本
    info = pg.evaluate("""() => {
      const grab = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.slice(0,300) : null; };
      return {
        notice: grab('.notice') || grab('#notice'),
        pageErr: grab('#pageErr'),
        runState: grab('#runState'),
        errMsg: grab('#errMsg') || grab('.err-msg') || grab('#backtestErr'),
        bodyTail: document.body.innerText.slice(-600)
      };
    }""")
    for k, v in info.items():
        print(f"== {k}: {v}")
    print("pageerror:", errs[:5])
    b.close()
