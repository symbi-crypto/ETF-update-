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
    pg.click("text=定投回测"); pg.wait_for_timeout(800)
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    # 选 1 只有分红的：159902 深100ETF？先选 510300 等宽基
    print("定投标的数:", len(boxes))
    # 选前3只
    for bx in boxes[:3]: bx.click()
    pg.wait_for_timeout(200)
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2000)
    # 分红方式 select
    print("dcaDivSel:", pg.evaluate("document.getElementById('dcaDivSel') ? document.getElementById('dcaDivSel').value : 'none'"))
    print("dcaDivNote:", pg.evaluate("document.getElementById('dcaDivNote') ? document.getElementById('dcaDivNote').textContent : 'none'"))
    # 切现金分红
    pg.select_option("#dcaDivSel", "cash")
    pg.wait_for_timeout(300)
    # 运行定投按钮
    for bd in pg.query_selector_all("button"):
        t = bd.inner_text().strip()
        if t and bd.is_visible() and ("定投" in t or "运行" in t):
            print("按钮:", repr(t))
    # 找运行按钮并点击
    pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
      let tgt = null;
      for (const b of btns) { const t=b.innerText.trim(); if (t.includes('运行定投') || t.includes('开始定投')) { tgt=b; break; } }
      if (!tgt) for (const b of btns) { const t=b.innerText.trim(); if (t==='运行回测' || t.includes('运行')) { tgt=b; break; } }
      if (tgt) tgt.click();
      return tgt ? tgt.innerText.trim() : 'none';
    }""")
    pg.wait_for_timeout(1200)
    print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(6000)
    print("runState 最终:", pg.evaluate("document.getElementById('runState').textContent"))
    print("pageerror:", errs[:5])
    print("dcaDivNote 最终:", pg.evaluate("document.getElementById('dcaDivNote') ? document.getElementById('dcaDivNote').textContent : 'none'"))
    # 定投结果区检查
    res = pg.evaluate("""() => {
      const c = document.getElementById('dcaResult');
      if (!c) return 'no dcaResult';
      return 'dcaResult len=' + c.innerText.length + ' :: ' + c.innerText.slice(0,200);
    }""")
    print("dca结果:", res)
    pg.screenshot(path="/tmp/ui_dca.png")
    b.close()
