import time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True,
        executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("C:"+m.text) if m.type=="error" else None)
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    time.sleep(3)
    st = pg.evaluate("""() => {
      var out = {};
      out.hash = location.hash;
      out.hasGridView = typeof GridView !== 'undefined' || !!(window.GridView);
      out.Dtype = typeof D;
      out.poolBox = !!document.querySelector('#gridPoolBox');
      out.poolBoxKids = document.querySelector('#gridPoolBox') ? document.querySelector('#gridPoolBox').children.length : -1;
      out.ensureD = typeof GridView !== 'undefined' ? (typeof GridView._ensureD) : 'na';
      out.errs = [];
      return out;
    }""")
    print("STATUS:", st)
    print("PAGEERRORS:", errs[:10])
    # 等 15 秒再看
    time.sleep(15)
    st2 = pg.evaluate("() => ({ Dtype: typeof D, hasD: typeof D!=='undefined' && !!D && !!D.calendar, calLen: typeof D!=='undefined'&&D.calendar? D.calendar.length:-1 })")
    print("AFTER 15s:", st2)
    b.close()
