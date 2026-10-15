import json, time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    check("512690.SH"); check("159915.SZ")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    def col(code, k):
        return pg.evaluate("""([c,k]) => { var el = document.querySelector("#gridParamTable [data-k='" + k + "'][data-c='" + c + "']"); return el ? el.textContent || el.value : null; }""", [code, k])
    print("初始 512690 volStat:", col("512690.SH","volStat"), "| step:", col("512690.SH","step"))
    print("初始 159915 volStat:", col("159915.SZ","volStat"), "| step:", col("159915.SZ","step"))
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='150'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(500)
    print("150后 512690 volStat:", col("512690.SH","volStat"), "| step:", col("512690.SH","step"))
    print("150后 159915 volStat:", col("159915.SZ","volStat"), "| step:", col("159915.SZ","step"))
    print("未变标识(512690行):", pg.evaluate("""() => { var tr=document.querySelector("#gridParamTable tbody tr"); return tr?tr.textContent.indexOf('未变')>=0:null; }"""))
    print("提示:", pg.evaluate("() => { var n=document.querySelector('#notice'); return n && n.style && n.style.display!=='none' ? n.textContent : null; }"))
    print("pageerror:", errs)
    b.close()
