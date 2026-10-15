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
    # ② 第一步 4 行排版
    rows = pg.evaluate("""() => { var rows = []; var box = document.querySelector('#gridStep1 .psec > div[style*=\"flex-direction:column\"]'); if(!box) return []; var rs = box.children; for(var i=0;i<rs.length;i++){ rows.push(rs[i].textContent.replace(/\\s+/g,' ').trim().slice(0,80)); } return rows; }""")
    print("② 第一步行:", rows)
    # ① 黄色条：初始（无内容应隐藏）
    gn = pg.evaluate("""() => { var g=document.querySelector('#gridNotice'); return g ? {text: g.textContent, disp: getComputedStyle(g).display} : null; }""")
    print("① gridNotice 初始:", gn)
    # 评分（触发加载 → 加载中条 → 完成后消失）
    check("510300.SH"); check("512690.SH"); check("510050.SH"); check("510500.SH"); check("512100.SH")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_timeout(1500)
    gn1 = pg.evaluate("""() => { var g=document.querySelector('#gridNotice'); return g ? {text: g.textContent, disp: getComputedStyle(g).display} : null; }""")
    print("① 评分加载中 gridNotice:", gn1)
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    gn2 = pg.evaluate("""() => { var g=document.querySelector('#gridNotice'); return g ? {text: g.textContent, disp: getComputedStyle(g).display} : null; }""")
    print("① 评分完成后 gridNotice(应 hidden):", gn2)
    # ③ TopN=10 默认；改 TopN 联动
    pg.evaluate("""() => { var t=document.querySelector('#gridTopN'); if(t){ t.value='5'; t.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(600)
    print("③ TopN改5后 提示:", notice_now(), "| 评分表行数:", pg.evaluate("() => document.querySelectorAll('#gridScoreTable tbody tr').length"))
    pg.evaluate("""() => { var t=document.querySelector('#gridTopN'); if(t){ t.value='10'; t.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(600)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    # idleSel 存在 + 默认 cash
    print("③ gridIdleSel:", pg.evaluate("""() => { var s=document.querySelector('#gridIdleSel'); return s ? {val: s.value, opts: Array.from(s.options).map(o=>o.value+':'+o.textContent)} : null; }"""))
    # 回测（默认 100 万 + Top10 + 参与5 + 空仓）
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#gridRunState'); return s && (s.textContent==='完成' || (s.textContent||'').indexOf('失败')>=0); }", timeout=180000)
    st = pg.evaluate("() => document.querySelector('#gridRunState').textContent")
    kpi = pg.evaluate("() => { var r=document.querySelector('#gridResult'); var k=r.querySelectorAll('.kpi .v'); return k.length?Array.from(k).slice(0,4).map(x=>x.textContent):null; }")
    print("回测(空仓) runState:", st, "| KPI:", kpi)
    # 切货币再跑
    pg.evaluate("""() => { var s=document.querySelector('#gridIdleSel'); s.value='money'; s.dispatchEvent(new Event('change')); }""")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#gridRunState'); return s && (s.textContent==='完成' || (s.textContent||'').indexOf('失败')>=0); }", timeout=180000)
    kpi2 = pg.evaluate("() => { var r=document.querySelector('#gridResult'); var k=r.querySelectorAll('.kpi .v'); return k.length?Array.from(k).slice(0,4).map(x=>x.textContent):null; }")
    print("回测(货币) KPI:", kpi2, "| 与空仓不同:", "是" if kpi != kpi2 else "否")
    # 保存-应用恢复 idle_buy
    pg.evaluate("() => document.querySelector('#gridSaveBtn').click()")
    pg.wait_for_timeout(600)
    pg.evaluate("() => { var l=document.querySelector('#stList'); if(l){ var items=l.querySelectorAll('.item'); if(items.length){ items[items.length-1].click(); } } }")
    pg.wait_for_timeout(900)
    print("应用后 gridIdleSel:", pg.evaluate("() => { var s=document.querySelector('#gridIdleSel'); return s?s.value:null; }"), "| gridTopN:", pg.evaluate("() => { var t=document.querySelector('#gridTopN'); return t?t.value:null; }"))
    print("pageerror:", errs)
    b.close()
