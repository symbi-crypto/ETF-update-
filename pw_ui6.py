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
    for bx in boxes[:5]:
        bx.click()
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    # 卖出条件卡：找"卖出条件"区域的添加按钮
    # 用 JS 找：卖出条件容器
    info = pg.evaluate("""() => {
      const els = document.querySelectorAll('*');
      for (const e of els) { if (e.childElementCount===0 && e.textContent.trim()==='卖出条件') {
        let p = e.parentElement, btns=[];
        for (let k=0;k<6&&p;k++,p=p.parentElement){
          btns = [...p.querySelectorAll('button')].filter(b=>b.innerText.trim().includes('添加'));
          if (btns.length) break;
        }
        return {found:true, addBtnText: btns.map(b=>b.innerText.trim())};
      }}
      return {found:false};
    }""")
    print("卖出条件区:", info)
    # 点击"添加"（卖出条件区的第一个添加）
    pg.evaluate("""() => {
      const els = document.querySelectorAll('*');
      let target = null;
      for (const e of els) { if (e.childElementCount===0 && e.textContent.trim()==='卖出条件') {
        let p = e.parentElement;
        for (let k=0;k<6&&p;k++,p=p.parentElement){
          const btns = [...p.querySelectorAll('button')].filter(b=>b.innerText.trim()==='添加');
          if (btns.length) { target = btns[0]; break; }
        }
        if (target) break;
      }}
      if (target) target.click();
      return target ? 'added' : 'no target';
    }""")
    pg.wait_for_timeout(500)
    # 运行回测
    pg.evaluate("""() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.innerText.trim() === '运行回测') { b.click(); break; } }
    }""")
    pg.wait_for_timeout(1200)
    print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(9000)
    print("runState 最终:", pg.evaluate("document.getElementById('runState').textContent"))
    print("pageerror:", errs[:5])
    print("notice:", pg.evaluate("(document.querySelector('.notice, #notice')||{textContent:''}).textContent.slice(0,150) || 'none'"))
    print("symTable:", pg.evaluate("""() => { const el=document.getElementById('symTable'); if(!el) return 'no'; const r=el.querySelectorAll('tbody tr'); return 'rows='+r.length+(r.length?' last='+r[r.length-1].innerText.replace(/\\n/g,' | ').slice(0,300):''); }"""))
    print("dbDate:", pg.evaluate("document.getElementById('dbDate').textContent"))
    pg.screenshot(path="/tmp/ui_result3.png")
    b.close()
