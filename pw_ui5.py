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
    pg.wait_for_timeout(300)
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    # 检查 step2 可见 + 因子/卖出条件状态
    print("step2 visible:", pg.evaluate("document.getElementById('step2').style.display"))
    print("notice:", pg.evaluate("(document.getElementById('notice')||{}).textContent || (document.querySelector('.notice')||{}).textContent || 'none'"))
    # 卖出条件是否已配置
    print("卖出条件条数:", pg.evaluate("document.querySelectorAll('#sellCondList .row, #sellCondList tr').length || '?'"))
    # 点击运行回测（force 确保）
    pg.evaluate("""() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.innerText.trim() === '运行回测') { b.click(); break; } }
      return 'clicked';
    }""")
    pg.wait_for_timeout(1500)
    print("runState 点击后:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(9000)
    print("runState 最终:", pg.evaluate("document.getElementById('runState').textContent"))
    print("pageerror:", errs[:5])
    print("notice2:", pg.evaluate("document.querySelector('.notice, #notice') ? (document.querySelector('.notice, #notice').textContent||'').slice(0,120) : 'none'"))
    print("symTable:", pg.evaluate("""() => { const el=document.getElementById('symTable'); if(!el) return 'no'; const r=el.querySelectorAll('tbody tr'); return 'rows='+r.length+(r.length?' last='+r[r.length-1].innerText.replace(/\\n/g,' | ').slice(0,280):''); }"""))
    pg.screenshot(path="/tmp/ui_result2.png")
    b.close()
