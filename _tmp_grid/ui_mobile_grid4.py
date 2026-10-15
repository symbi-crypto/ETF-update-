import json, sys, time
from playwright.sync_api import sync_playwright

URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"

def log(*a):
    print(*a, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True,
        executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    console_errors = []
    pg.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: console_errors.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    # 第一步秒开验证：D 未加载
    d0 = pg.evaluate("() => { try { return typeof D === 'undefined' ? 'NO-D' : 'D-LOADED'; } catch(e){ return 'NO-D'; } }")
    step1 = pg.evaluate("() => document.querySelector('#gridStep1') ? getComputedStyle(document.querySelector('#gridStep1')).display : 'no'")
    step2 = pg.evaluate("() => document.querySelector('#gridStep2') ? getComputedStyle(document.querySelector('#gridStep2')).display : 'no'")
    log("第一步秒开: D=", d0, "| step1 display=", step1, "| step2 display=", step2)
    # 勾选 510300 + 159915
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    check("510300.SH")
    check("159915.SZ")
    pg.wait_for_timeout(400)
    log("勾选数:", pg.evaluate("() => document.querySelectorAll('#gridPoolBox input:checked').length"))
    # 点评分（触发 D 加载）
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    try:
        pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    except Exception as e:
        log("评分超时; notice:", pg.evaluate("() => { var n=document.querySelector('#notice'); return n?n.textContent:null; }"))
        raise
    log("评分表行数:", pg.evaluate("() => document.querySelectorAll('#gridScoreTable tbody tr').length"))
    stat = pg.evaluate("() => { var s=document.querySelector('#gridStat'); return s?s.textContent:null; }")
    log("达标统计:", stat)
    # 标注验证（510300 label 含分）
    tag = pg.evaluate("""() => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ if(l[i].textContent.indexOf('510300')>=0) return l[i].textContent.slice(0,80); } return 'no'; }""")
    log("510300 标注:", tag)
    # 过滤不合格
    pg.evaluate("() => { var f=document.querySelector('#gridFilterOn'); if(f){ f.click(); } }")
    pg.wait_for_timeout(400)
    disN = pg.evaluate("() => { var l=document.querySelectorAll('#gridPoolBox input:disabled'); return l.length; }")
    log("过滤后禁用数:", disN)
    pg.evaluate("() => { var f=document.querySelector('#gridFilterOn'); if(f && f.checked){ f.click(); } }")
    pg.wait_for_timeout(300)
    # 下一步
    pg.evaluate("() => { var b=document.querySelector('#gridNextBtn'); if(b) b.click(); }")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    log("step2 已显示")
    # 参数表新列验证
    heads = pg.evaluate("() => { var h=document.querySelectorAll('#gridParamTable thead th'); return Array.from(h).map(x=>x.textContent); }")
    log("参数表列头:", heads)
    # 每格资金联动：改底仓资金
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='510300.SH']"); if(inp){ inp.value='300000'; inp.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    perL = pg.evaluate("""() => { var s = document.querySelector("#gridParamTable span[data-k='perL'][data-c='510300.SH']"); return s?s.textContent:null; }""")
    log("改底仓30万后每格资金:", perL, "(应=300000/格数)")
    # 触发基准价改动 → 档位预览刷新
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='triggerBase'][data-c='510300.SH']"); if(inp){ inp.value='5.800'; inp.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    lvl = pg.evaluate("""() => { var s = document.querySelector("#gridParamTable span[data-k='lvlPrev'][data-c='510300.SH']"); return s?s.textContent:null; }""")
    log("触发基准价5.8后档位预览:", lvl)
    # 波动统计区间改 120 → 重算
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='120'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(600)
    stepNow = pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='step'][data-c='510300.SH']"); return inp?inp.value:null; }""")
    log("volWin=120 后 510300 格距:", stepNow)
    # 运行
    pg.evaluate("() => { var b=document.querySelector('#gridRunBtn'); if(b) b.click(); }")
    pg.wait_for_function("() => { var k=document.querySelector('#gridKpis'); return k && k.querySelectorAll('.kpi').length > 0; }", timeout=120000)
    log("网格 KPI:", pg.evaluate("() => Array.from(document.querySelectorAll('#gridKpis .kpi .v')).map(x=>x.textContent)"))
    pg.wait_for_timeout(1500)
    # 保存
    pg.evaluate("() => { document.querySelector('#gridStName').value='两步式网格测试'; document.querySelector('#gridSaveBtn').click(); }")
    pg.wait_for_timeout(700)
    # 我的策略 → 应用
    pg.evaluate("() => { location.hash = '#/strategies'; }")
    pg.wait_for_function("() => document.querySelector('#stListV') && document.querySelector('#stListV .srow')", timeout=30000)
    pg.wait_for_timeout(6000)
    log("策略列表:", pg.evaluate("() => Array.from(document.querySelectorAll('#stListV .srow')).slice(0,2).map(x=>x.textContent.slice(0,130))"))
    pg.evaluate("""() => { var r=document.querySelectorAll('#stListV .srow'); for (var i=0;i<r.length;i++){ if(r[i].textContent.indexOf('两步式')>=0){ r[i].click(); return; } } }""")
    pg.wait_for_timeout(2500)
    cur = pg.evaluate("() => location.hash")
    checked2 = pg.evaluate("() => { try { return document.querySelectorAll('#gridPoolBox input:checked').length; } catch(e){ return -1; } }")
    volWin2 = pg.evaluate("() => { var v=document.querySelector('#gridVolWin'); return v?v.value:null; }")
    log("应用后 hash:", cur, "| 勾选:", checked2, "| volWin:", volWin2)
    # 上一步/下一步往返
    pg.evaluate("() => { var b=document.querySelector('#gridPrevBtn'); if(b) b.click(); }")
    pg.wait_for_timeout(400)
    s1 = pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep1')).display")
    s2 = pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep2')).display")
    log("上一步后 step1=", s1, "step2=", s2)
    pg.evaluate("() => { var b=document.querySelector('#gridNextBtn'); if(b) b.click(); }")
    pg.wait_for_timeout(400)
    log("再下一步后 step2=", pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep2')).display"))
    pg.screenshot(path="_tmp_grid/mob_grid2step.jpg")
    log("consoleErrors:", console_errors)
    b.close()
