import json, os
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
JS_CHECK = "(cs) => { var l=document.querySelectorAll('#gridPoolBox label'); for(var i=0;i<l.length;i++){ var inp=l[i].querySelector('input'); if(inp&&!inp.checked){ var t=l[i].textContent; for(var j=0;j<cs.length;j++){ if(t.indexOf(cs[j])>=0){ inp.click(); break; } } } } }"
def run(viewport, out, tag):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport=viewport)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.goto(URL, wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)
        pg.evaluate("() => { location.hash = '#/grid'; }")
        pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelectorAll('#gridPoolBox label').length>0", timeout=60000)
        pg.evaluate(JS_CHECK, ["510300.SH","512690.SH","510050.SH"])
        pg.wait_for_timeout(400)
        pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
        pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length>0; }", timeout=180000)
        pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
        pg.wait_for_timeout(400)
        pg.evaluate("() => document.querySelector('#gridStressBtn').click()")
        st = "运行中"
        for _ in range(200):
            st = pg.evaluate("() => { var s=document.querySelector('#gridStressState'); return s?s.textContent:null; }")
            if st=='完成' or (st or '').startswith('失败'):
                break
            pg.wait_for_timeout(2000)
        pg.wait_for_timeout(600)
        pg.screenshot(path=out, full_page=True)
        print(tag, "state:", st, "| errs:", errs[:2], "| size:", os.path.getsize(out))
        b.close()
run({"width":1440,"height":900}, "_tmp_grid/desk_stress2.jpg", "desktop")
run({"width":390,"height":844}, "_tmp_grid/mob_stress2.jpg", "mobile")
