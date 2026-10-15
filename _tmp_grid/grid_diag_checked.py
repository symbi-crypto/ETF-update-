import json, time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    def state(tag):
        s = pg.evaluate("""() => { try { var ch=GridView.checked; var ks=Object.keys(ch).filter(k=>ch[k]); return {n: ks.length, codes: ks.slice(0,6)}; } catch(e){ return {err: String(e)}; } }""")
        print(tag, "checked:", json.dumps(s), "| DOM勾选:", pg.evaluate("() => document.querySelectorAll('#gridPoolBox input:checked').length"))
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    check("510300.SH"); check("159915.SZ")
    pg.wait_for_timeout(400)
    state("勾选后")
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    state("评分后")
    print("评分表行数:", pg.evaluate("() => document.querySelectorAll('#gridScoreTable tbody tr').length"))
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    state("下一步后")
    print("参数表行数:", pg.evaluate("() => document.querySelectorAll('#gridParamTable tbody tr').length"))
    # 改参数
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='510300.SH']"); if(inp){ inp.value='300000'; inp.dispatchEvent(new Event('change')); } }""")
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='triggerBase'][data-c='510300.SH']"); if(inp){ inp.value='5.800'; inp.dispatchEvent(new Event('change')); } }""")
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='120'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(600)
    state("改参数后")
    b.close()
