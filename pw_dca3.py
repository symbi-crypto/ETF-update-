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
    pg.click("text=定投回测"); pg.wait_for_timeout(1000)
    # 可见 checkbox 前 3
    pg.evaluate("""() => {
      const cbs = [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.offsetParent!==null);
      cbs.slice(0,3).forEach(c=>c.click());
    }""")
    pg.wait_for_timeout(300)
    # 下一步按钮
    for bd in pg.query_selector_all("button"):
        t = bd.inner_text().strip()
        if "下一步" in t and bd.is_visible():
            print("下一步:", repr(t)); bd.click(); break
    pg.wait_for_timeout(2000)
    # dca 控件状态
    print("dcaDivSel:", pg.evaluate("document.getElementById('dcaDivSel') ? (document.getElementById('dcaDivSel').offsetParent!==null ? 'visible val='+document.getElementById('dcaDivSel').value : 'hidden') : 'missing'"))
    print("dcaDivNote:", pg.evaluate("document.getElementById('dcaDivNote') ? document.getElementById('dcaDivNote').textContent : 'none'"))
    # 切现金
    pg.select_option("#dcaDivSel", "cash")
    pg.wait_for_timeout(200)
    # 运行按钮（step2 定投区）
    r = pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
      const names = btns.map(b=>b.innerText.trim()).filter(t=>t.includes('定投') || t.includes('运行'));
      let tgt=null;
      for (const b of btns){ const t=b.innerText.trim(); if(t.includes('运行定投')){tgt=b;break;} }
      if(!tgt) for (const b of btns){ const t=b.innerText.trim(); if(t==='运行回测' && b.closest('#dcaPanel, #dcaSec, #step2')){tgt=b;break;} }
      if(!tgt && btns.length){ const cands=btns.filter(b=>b.innerText.trim().includes('运行')); if(cands.length) tgt=cands[0]; }
      if(tgt) tgt.click();
      return {names, clicked: tgt?tgt.innerText.trim():'none'};
    }""")
    print("运行:", r)
    pg.wait_for_timeout(1500)
    print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(6000)
    print("runState 最终:", pg.evaluate("document.getElementById('runState').textContent"))
    print("pageerror:", errs[:5])
    print("dcaDivNote 最终:", pg.evaluate("document.getElementById('dcaDivNote') ? document.getElementById('dcaDivNote').textContent : 'none'"))
    res = pg.evaluate("""() => {
      const el = document.getElementById('dcaResult') || document.getElementById('dcaRes');
      if (!el) return 'no dca result el';
      return 'len=' + el.innerText.length + ' :: ' + el.innerText.slice(0, 220);
    }""")
    print("定投结果:", res)
    pg.screenshot(path="/tmp/ui_dca3.png")
    b.close()
