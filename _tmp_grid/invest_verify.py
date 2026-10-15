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
    def notice_now():
        return pg.evaluate("() => { var n=document.querySelector('#notice'); return n && n.style && n.style.display!=='none' ? n.textContent : null; }")
    def baseAmt(code):
        return pg.evaluate("""(c) => { var i = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='%s']"); return i ? i.value : null; }""", code)
    def perL(code):
        return pg.evaluate("""(c) => { var s = document.querySelector("#gridParamTable span[data-k='perL'][data-c='%s']"); return s ? s.textContent : null; }""", code)
    # 勾 3 标的
    check("510300.SH"); check("512690.SH"); check("510050.SH")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    print("默认(100万) 510300 baseAmt:", baseAmt("510300.SH"), "perL:", perL("510300.SH"))
    # 改投资总金额 30 万
    pg.evaluate("""() => { var v=document.querySelector('#gridInvest'); if(v){ v.value='300000'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    print("改30万后 510300:", baseAmt("510300.SH"), "| 512690:", baseAmt("512690.SH"), "| 510050:", baseAmt("510050.SH"))
    print("提示:", notice_now())
    # 手动覆盖 510300 底仓 5 万
    pg.evaluate("""() => { var i = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='510300.SH']"); if(i){ i.value='50000'; i.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(400)
    print("覆盖510300=5万后:", baseAmt("510300.SH"), "| 512690 仍:", baseAmt("512690.SH"))
    # 改总金额 60 万 → 覆盖保留
    pg.evaluate("""() => { var v=document.querySelector('#gridInvest'); if(v){ v.value='600000'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    print("改60万后 510300(应保留5万):", baseAmt("510300.SH"), "| 512690(应=20万):", baseAmt("512690.SH"), "| 510050:", baseAmt("510050.SH"))
    print("提示:", notice_now())
    # 回测数值随总金额变化：60万 跑一次，再改 30 万跑一次
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#gridRunState'); return s && s.textContent.indexOf('已更新')>=0; }", timeout=180000)
    kpi60 = pg.evaluate("() => { var r=document.querySelector('#gridResult'); var k=r.querySelectorAll('.kpi .v'); return k.length?Array.from(k).slice(0,4).map(x=>x.textContent):null; }")
    print("60万 KPI 前4:", kpi60)
    pg.evaluate("""() => { var v=document.querySelector('#gridInvest'); if(v){ v.value='300000'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#gridRunState'); return s && s.textContent.indexOf('已更新')>=0; }", timeout=180000)
    kpi30 = pg.evaluate("() => { var r=document.querySelector('#gridResult'); var k=r.querySelectorAll('.kpi .v'); return k.length?Array.from(k).slice(0,4).map(x=>x.textContent):null; }")
    print("30万 KPI 前4:", kpi30, "| 数值随总金额变化:", "是" if kpi60 != kpi30 else "否")
    # 保存/应用恢复
    pg.evaluate("""() => { var v=document.querySelector('#gridInvest'); if(v){ v.value='600000'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridSaveBtn').click()")
    pg.wait_for_timeout(500)
    pg.evaluate("() => { var l=document.querySelector('#stList'); if(l){ var items=l.querySelectorAll('.item'); if(items.length){ items[items.length-1].click(); } } }")
    pg.wait_for_timeout(800)
    print("应用后 gridInvest:", pg.evaluate("() => { var v=document.querySelector('#gridInvest'); return v?v.value:null; }"), "| gridCapital:", pg.evaluate("() => { var v=document.querySelector('#gridCapital'); return v?v.value:null; }"))
    print("pageerror:", errs)
    b.close()
