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
    # 勾酒ETF(512690.SH 截图场景标的) + 510050
    check("512690.SH"); check("510050.SH")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    def volstat(code):
        return pg.evaluate("""(c) => { var s = document.querySelector("#gridParamTable span[data-k='volStat'][data-c='%s']"); return s ? s.textContent : null; }""", code)
    def step(code):
        return pg.evaluate("""(c) => { var i = document.querySelector("#gridParamTable input[data-k='step'][data-c='%s']"); return i ? i.value : null; }""", code)
    print("列头:", pg.evaluate("() => Array.from(document.querySelectorAll('#gridParamTable thead th')).map(x=>x.textContent)"))
    print("初始 512690:", volstat("512690.SH"), "| step", step("512690.SH"))
    # 改 volWin 60→150（change 立即）
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='150'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(500)
    print("volWin=150 后 512690:", volstat("512690.SH"), "| step", step("512690.SH"), "(σ/振幅应变化、格距或未变)")
    print("512690 行未变标识:", pg.evaluate("""() => { var tr = document.querySelector("#gridParamTable tbody tr"); return tr ? tr.textContent.indexOf('未变') >= 0 : null; }"""))
    print("提示:", pg.evaluate("() => { var n=document.querySelector('#notice'); return n && n.style && n.style.display!=='none' ? n.textContent : null; }"))
    # 回第一步看评分表行内波动统计
    pg.evaluate("() => document.querySelector('#gridPrevBtn').click()")
    pg.wait_for_timeout(400)
    row = pg.evaluate("() => { var r=document.querySelector('#gridScoreTable tbody tr:nth-child(2)'); return r?r.textContent.slice(0,220):null; }")
    print("评分表行内(512690):", row)
    print("pageerror:", errs)
    b.close()
