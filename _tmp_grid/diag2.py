import time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True,
        executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    errs=[]
    pg.on("pageerror", lambda e: errs.append("PE:"+str(e)))
    pg.on("console", lambda m: errs.append("C:"+m.text) if m.type=="error" else None)
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    pg.evaluate("""() => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf('510300') >= 0){ inp.click(); break; } } }""")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    print("评分表OK")
    pg.evaluate("() => { document.querySelector('#gridStName').value='测试网格策略'; document.querySelector('#gridSaveBtn').click(); }")
    time.sleep(1)
    st = pg.evaluate("""() => {
      var n = document.querySelector('#notice');
      var ls = localStorage.getItem('strategies');
      var keys = ls ? Object.keys(JSON.parse(ls)) : [];
      return { notice: n ? (n.style.display + '|' + n.textContent) : 'no-el', lsKeys: keys, lsHead: ls ? ls.slice(0,200) : null };
    }""")
    print("SAVE-STATE:", st)
    print("ERRORS:", errs[:8])
    b.close()
