import json
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/backtest'; }")
    pg.wait_for_timeout(800)
    pg.evaluate("() => document.querySelector('#poolAll').click()")
    pg.wait_for_timeout(400)
    print("全选后勾选:", pg.evaluate("() => { var n=0; document.querySelectorAll('#poolBox input[type=checkbox]').forEach(function(c){ if(c.checked)n++; }); return n; }"))
    pg.evaluate("() => document.querySelector('#nextBtn').click()")
    # 等 D 加载（主回测页 nextStep 解析数据）
    pg.wait_for_function("() => (window.D || window.__GRID_D) !== undefined", timeout=120000)
    print("D 已加载 ✓")
    pg.wait_for_timeout(500)
    pg.evaluate("() => document.querySelector('#runBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && s.textContent && (s.textContent.indexOf('已更新')>=0 || s.textContent.indexOf('失败')>=0); }", timeout=300000)
    print("runState:", pg.evaluate("() => document.querySelector('#runState').textContent"))
    txt = pg.evaluate("() => { var r=document.querySelector('#result')||document.querySelector('#resBox'); return r?r.textContent.replace(/\\s+/g,' ').slice(0,260):'无'; }")
    print("结果区:", txt)
    print("pageerror:", errs[:3])
    b.close()
