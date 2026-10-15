import time, json
from playwright.sync_api import sync_playwright
html = "/home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXEC = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXEC)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PE: " + str(e)[:300]))
    pg.goto("file://" + html, wait_until="domcontentloaded")
    pg.wait_for_timeout(1500)
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(800)
    pg.evaluate("""() => { window.__D_READY = false; WufuUI.ensureData(function(){ window.__D_READY = true; }); }""")
    for _ in range(60):
        if pg.evaluate("window.__D_READY === true"): break
        time.sleep(0.5)
    pg.evaluate("""() => {
      const box = document.getElementById('gridPoolBox');
      const want = ['510300.SH','510500.SH','159915.SZ','510050.SH','512100.SH','588000.SH'];
      box.querySelectorAll('label').forEach(l => {
        const code = l.textContent.trim().split(' ').pop();
        if (want.includes(code)) { const cb = l.querySelector('input'); if (!cb.checked) cb.click(); }
      });
    }""")
    pg.wait_for_timeout(200)
    pg.evaluate("document.getElementById('gridScoreBtn').click()")
    pg.wait_for_timeout(2000)
    scoreRows = pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length")
    pRows = pg.evaluate("document.querySelectorAll('#gridParamTable tbody tr').length")
    print("score rows:", scoreRows, "| param rows:", pRows)
    pg.evaluate("document.getElementById('gridRunBtn').click()")
    for _ in range(180):
        st = pg.evaluate("(document.getElementById('gridRunState')||{}).textContent || ''")
        if "完成" in st or "失败" in st: break
        time.sleep(0.5)
    time.sleep(1)
    # 诊断：nav 极值、日收益极值
    diag = pg.evaluate("""() => {
      if (!window.GridView || !window.GridView._lastRes) return null;
      const r = window.GridView._lastRes;
      const nav = r.nav;
      let mx = -1e18, mn = 1e18, mi = 0;
      for (let i=0;i<nav.length;i++){ if(nav[i]>mx){mx=nav[i];mi=i;} if(nav[i]<mn)mn=nav[i]; }
      // 日收益极值
      let drMax = 0, drMin = 0, drI = 0;
      for (let i=1;i<nav.length;i++){
        const dr = nav[i]/nav[i-1]-1;
        if (dr > drMax){drMax=dr;drI=i;}
        if (dr < drMin){drMin=dr;}
      }
      return { navLen: nav.length, navMax: mx, navMaxDate: r.dates[mi], navMin: mn, drMax: drMax, drMaxDate: r.dates[drI], drMin: drMin, navFirst: nav[0], navLast: nav[nav.length-1] };
    }""")
    print("diag:", json.dumps(diag, ensure_ascii=False))
    print("errs:", errs[:6] if errs else "NONE")
    b.close()
