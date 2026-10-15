from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":390,"height":844})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelectorAll('#gridPoolBox label').length>0", timeout=60000)
    pg.evaluate("(cs) => { var l=document.querySelectorAll('#gridPoolBox label'); for(var i=0;i<l.length;i++){ var inp=l[i].querySelector('input'); if(inp&&!inp.checked){ var t=l[i].textContent; for(var j=0;j<cs.length;j++){ if(t.indexOf(cs[j])>=0){ inp.click(); break; } } } } }", ["510300.SH","512690.SH","510050.SH"])
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length>0; }", timeout=180000)
    print("评分完成")
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_timeout(600)
    st = pg.evaluate("""() => ({
      s1: getComputedStyle(document.getElementById('gridStep1')).display,
      s2: getComputedStyle(document.getElementById('gridStep2')).display,
      depth: !!document.getElementById('gridStressDepth'),
      prev2: !!document.getElementById('gridPrev2Btn'),
      next2: !!document.getElementById('gridNext2Btn'),
      res: !!document.getElementById('gridStressResult'),
      notice: document.getElementById('notice') ? document.getElementById('notice').textContent : null
    })""")
    print("next 后:", st)
    print("errs:", errs[:2])
    b.close()
