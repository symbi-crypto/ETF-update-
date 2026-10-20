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
    pg.click("text=轮动回测"); pg.wait_for_timeout(800)
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    for bx in boxes[:5]: bx.click()
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    # 添加排名因子：涨幅(roc) → 归属排名
    pg.select_option("#mfAddKind", "roc")
    pg.select_option("#mfAddUsage", "rank")
    pg.click("#mfAddBtn")
    pg.wait_for_timeout(600)
    # 卖出条件添加（第3个添加按钮 y=1040）
    pg.evaluate("""() => { const a=[...document.querySelectorAll('#step2 button')].filter(b=>b.innerText.trim()==='添加' && b.offsetParent!==null); if(a.length>=3) a[2].click(); }""")
    pg.wait_for_timeout(400)
    # 运行回测
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='运行回测'); if(b) b.click(); }""")
    pg.wait_for_timeout(1500)
    print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(10000)
    print("runState 最终:", pg.evaluate("document.getElementById('runState').textContent"))
    print("pageerror:", errs[:5])
    print("symTable:", pg.evaluate("""() => { const el=document.getElementById('symTable'); if(!el) return 'no symTable'; const r=el.querySelectorAll('tbody tr'); let out='rows='+r.length; for(let i=0;i<Math.min(r.length,3);i++){ out+=' | '+r[i].innerText.replace(/\\n/g,' / '); } return out; }"""))
    print("dbDate:", pg.evaluate("document.getElementById('dbDate').textContent"))
    pg.screenshot(path="/tmp/ui_final.png")
    b.close()
