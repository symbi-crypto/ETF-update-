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
    # 1) 因子管理：选中"涨幅"并添加（归属排名）
    r1 = pg.evaluate("""() => {
      // 找因子管理容器：含 '全部因子' 与 '排名' '添加' 按钮
      const btns = [...document.querySelectorAll('#step2 button')].filter(b=>b.offsetParent!==null);
      const addBtns = btns.filter(b=>b.innerText.trim()==='添加');
      const rankBtns = btns.filter(b=>b.innerText.trim()==='排名');
      if (!addBtns.length || !rankBtns.length) return 'no btn: adds='+addBtns.length+' ranks='+rankBtns.length;
      // 点击因子名"涨幅"（因子管理区第一个）
      const els = [...document.querySelectorAll('#step2 span, #step2 div, #step2 label, #step2 li')];
      const zf = els.filter(e=>e.childElementCount===0 && e.textContent.trim()==='涨幅');
      if (!zf.length) return 'no 涨幅';
      // 选中涨幅（点击），然后点"排名"，再点"添加"（同容器）
      zf[0].click();
      rankBtns[0].click();
      addBtns[0].click();
      return 'factor added';
    }""")
    print("因子添加:", r1)
    pg.wait_for_timeout(800)
    # 检查排名条件区是否有因子
    print("排名因子数:", pg.evaluate("""() => {
      const s2 = document.getElementById('step2');
      const t = s2.innerText;
      const i = t.indexOf('排名条件（轮动因子）');
      return t.slice(i, i+400);
    }"""))
    # 2) 卖出条件添加（y=1040 的添加 = 第3个添加按钮）
    r2 = pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('#step2 button')].filter(b=>b.innerText.trim()==='添加' && b.offsetParent!==null);
      if (btns.length >= 3) { btns[2].click(); return 'sell added'; }
      return 'no sell btn: '+btns.length;
    }""")
    print("卖出条件:", r2)
    pg.wait_for_timeout(500)
    # 3) 运行回测
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='运行回测'); if(b) b.click(); }""")
    pg.wait_for_timeout(1500)
    print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(9000)
    print("runState 最终:", pg.evaluate("document.getElementById('runState').textContent"))
    print("pageerror:", errs[:5])
    print("notice:", pg.evaluate("(document.querySelector('.notice, #notice')||{textContent:''}).textContent.slice(0,120)"))
    print("symTable:", pg.evaluate("""() => { const el=document.getElementById('symTable'); if(!el) return 'no'; const r=el.querySelectorAll('tbody tr'); return 'rows='+r.length+(r.length?' last='+r[r.length-1].innerText.replace(/\\n/g,' | ').slice(0,320):''); }"""))
    pg.screenshot(path="/tmp/ui_full.png")
    b.close()
