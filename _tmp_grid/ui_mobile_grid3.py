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
    # 进网格页（render 用静态 POOL 渲染，D 由 computeScores/run 触发加载）
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    log("gridPoolBox 已渲染")
    # 勾选 2 只：510300 + 159915
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    check("510300.SH")
    check("159915.SZ")
    pg.wait_for_timeout(400)
    n = pg.evaluate("() => { var l=document.querySelectorAll('#gridPoolBox input:checked'); return l.length; }")
    log("勾选数:", n)
    # 点评分（触发 D 自动加载 + 评分）
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    try:
        pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    except Exception as e:
        log("评分表超时; notice:", pg.evaluate("() => { var n=document.querySelector('#noticeText'); return n?n.textContent:null; }"))
        raise
    rows = pg.evaluate("() => { var t=document.querySelector('#gridScoreTable'); return t.querySelectorAll('tbody tr').length; }")
    log("评分表行数:", rows)
    # 验证 input 颜色与卡片布局
    col = pg.evaluate("() => { var i = document.querySelector('#gridParamTable input'); if(!i) return null; return getComputedStyle(i).color; }")
    log("参数表 input 颜色:", col)
    disp = pg.evaluate("() => { var tr = document.querySelector('#gridScoreTable tbody tr'); return tr ? getComputedStyle(tr).display : null; }")
    log("评分表 tr display (移动端应 block):", disp)
    lbl = pg.evaluate("() => { var td = document.querySelector('#gridScoreTable tbody tr td'); return td ? (td.getAttribute('data-label')) : null; }")
    log("首 td data-label:", lbl)
    pg.screenshot(path="_tmp_grid/mob_grid_cards.jpg")
    # 运行网格回测
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var k=document.querySelector('#gridKpis'); return k && k.querySelectorAll('.kpi').length > 0; }", timeout=120000)
    kpis = pg.evaluate("() => { var k=document.querySelector('#gridKpis'); return Array.from(k.querySelectorAll('.kpi .v')).map(x=>x.textContent); }")
    log("网格 KPI:", kpis)
    pg.wait_for_timeout(1500)
    # 保存网格策略
    pg.evaluate("() => { document.querySelector('#gridStName').value='测试网格策略'; document.querySelector('#gridSaveBtn').click(); }")
    pg.wait_for_timeout(600)
    note = pg.evaluate("() => { var n=document.querySelector('#noticeText'); return n ? n.textContent : null; }")
    log("保存提示:", note)
    # 我的策略页
    pg.evaluate("() => { location.hash = '#/strategies'; }")
    pg.wait_for_function("() => document.querySelector('#stListV') && document.querySelector('#stListV .srow')", timeout=30000)
    pg.wait_for_timeout(6000)
    rows_txt = pg.evaluate("() => { var r=document.querySelectorAll('#stListV .srow'); return Array.from(r).slice(0,3).map(x=>x.textContent.slice(0,140)); }")
    log("策略列表前3:", rows_txt)
    # 点击网格策略 row
    clicked = pg.evaluate("""() => {
      var r = document.querySelectorAll('#stListV .srow');
      for (var i=0;i<r.length;i++){ if (r[i].textContent.indexOf('网格') >= 0){ r[i].click(); return true; } }
      return false;
    }""")
    log("点击网格策略:", clicked)
    pg.wait_for_timeout(2500)
    cur = pg.evaluate("() => location.hash")
    log("点击后 hash:", cur)
    checked2 = pg.evaluate("() => { var l=document.querySelectorAll('#gridPoolBox input:checked'); return l.length; }")
    log("应用后网格勾选数:", checked2)
    pg.wait_for_timeout(2500)
    pg.screenshot(path="_tmp_grid/mob_grid_applied.jpg")
    log("consoleErrors:", console_errors)
    b.close()
