from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelectorAll('#poolBox .corr-grp input').forEach(function(x){ if(!x.checked) x.click(); });")
    pg.wait_for_timeout(500)
    pg.evaluate("document.getElementById('nextBtn').click()")
    pg.wait_for_function("() => typeof window.D !== 'undefined'", timeout=120000)
    pg.wait_for_timeout(600)
    # 设置卖出条件并读结果
    r = pg.evaluate("""() => {
      var sk = document.getElementById('sellKind');
      sk.value = 'hold_days'; sk.dispatchEvent(new Event('change'));
      document.getElementById('sellVal').value = '5';
      document.getElementById('sellBtn').click();
      var cnt = document.getElementById('sellCount');
      var list = document.getElementById('sellList');
      return { count: cnt ? cnt.textContent : '无sellCount', listText: list ? list.textContent : '无sellList' };
    }""")
    print("卖出条件设置:", r)
    pg.evaluate("document.getElementById('runBtn').click()")
    pg.wait_for_timeout(4000)
    st = pg.evaluate("""() => ({
      runState: document.getElementById('runState').textContent,
      notice: document.getElementById('notice').textContent,
      noticeDisplay: getComputedStyle(document.getElementById('notice')).display
    })""")
    print("run 4s 后:", st)
    print("pageerror:", errs[:3])
    b.close()
