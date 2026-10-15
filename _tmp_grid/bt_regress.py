import json, time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.wait_for_function("() => document.querySelector('#poolBox') && document.querySelectorAll('#poolBox .pick').length > 0", timeout=60000)
    # 勾 2 只：510300 + 159915（.pick）
    pg.evaluate("""() => { var l = document.querySelectorAll('#poolBox .pick'); var n=0; for (var i=0;i<l.length && n<2;i++){ var c=l[i].getAttribute('data-c'); if(!l[i].checked && (c==='510300.SH' || c==='159915.SZ')){ l[i].click(); n++; } } }""")
    pg.wait_for_timeout(600)
    print("勾选数:", pg.evaluate("() => document.querySelectorAll('#poolBox .pick:checked').length"))
    # 排名因子 roc + 卖出条件 hold_days
    pg.evaluate("""() => { var u=document.querySelector('#mfAddUsage'); u.value='rank'; var k=document.querySelector('#mfAddKind'); k.value='roc'; document.querySelector('#mfAddBtn').click(); }""")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { var k=document.querySelector('#sellKind'); k.value='hold_days'; var v=document.querySelector('#sellVal'); v.value='5'; document.querySelector('#sellBtn').click(); }""")
    pg.wait_for_timeout(400)
    print("因子/卖出:", pg.evaluate("() => { return (document.querySelectorAll('#mfListV .frow').length||document.querySelectorAll('#mfList .frow').length) + '/' + (document.querySelectorAll('#sellListV .srow').length||document.querySelectorAll('#sellList .srow').length); }"))
    pg.evaluate("() => document.querySelector('#nextBtn').click()")
    pg.wait_for_timeout(600)
    print("next 后 notice:", pg.evaluate("() => { var n=document.querySelector('#notice'); return n?n.textContent:null; }"))
    pg.evaluate("() => document.querySelector('#runBtn').click()")
    try:
        pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && s.textContent.indexOf('已更新')>=0; }", timeout=120000)
        print("runState:", pg.evaluate("() => document.querySelector('#runState').textContent"))
        print("KPI 前4:", pg.evaluate("() => Array.from(document.querySelectorAll('#kpis .kpi .v')).slice(0,4).map(x=>x.textContent)"))
    except Exception as e:
        print("主回测超时; runState:", pg.evaluate("() => { var s=document.querySelector('#runState'); return s?s.textContent:null; }"), "| notice:", pg.evaluate("() => { var n=document.querySelector('#notice'); return n?n.textContent:null; }"))
    print("pageerror:", errs)
    b.close()
