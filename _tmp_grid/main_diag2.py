import json
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append("console:"+m.text[:150]) if m.type=="error" else None)
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    st = pg.evaluate("""() => {
      var d = {};
      d.step1 = getComputedStyle(document.getElementById('step1')).display;
      d.step2 = getComputedStyle(document.getElementById('step2')).display;
      d.step3 = document.getElementById('step3') ? getComputedStyle(document.getElementById('step3')).display : '无';
      d.nextBtn = !!document.getElementById('nextBtn');
      d.runBtn = !!document.getElementById('runBtn');
      d.runState = document.getElementById('runState').textContent;
      d.checked = [...document.querySelectorAll('#poolBox input')].filter(x=>x.checked).length;
      return d;
    }""")
    print("初始:", st)
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { const sk = document.getElementById('sellKind'); if(sk){ sk.value='hold_days'; sk.dispatchEvent(new Event('change')); document.getElementById('sellVal').value='5'; document.getElementById('sellBtn').click(); } }""")
    pg.wait_for_timeout(300)
    pg.evaluate("document.getElementById('nextBtn').click()")
    pg.wait_for_timeout(3000)
    st2 = pg.evaluate("""() => {
      return {
        step1: getComputedStyle(document.getElementById('step1')).display,
        step2: getComputedStyle(document.getElementById('step2')).display,
        hasD: typeof window.D !== 'undefined',
        gridD: typeof window.__GRID_D !== 'undefined',
        runState: document.getElementById('runState').textContent,
        runBtnVisible: getComputedStyle(document.getElementById('runBtn')).display !== 'none'
      };
    }""")
    print("next 后:", st2)
    pg.evaluate("document.getElementById('runBtn').click()")
    pg.wait_for_timeout(3000)
    st3 = pg.evaluate("() => document.getElementById('runState').textContent")
    print("run 点击 3s 后 runState:", st3)
    print("errs:", errs[:6])
    b.close()
