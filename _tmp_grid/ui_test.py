import time, json
from playwright.sync_api import sync_playwright
html = "/home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXEC = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXEC)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PE: " + str(e)[:400]))
    pg.goto("file://" + html, wait_until="domcontentloaded")
    pg.wait_for_timeout(1500)
    # 切到网格 tab（先确保数据就绪：ensureData 在 UI 块闭包内不可直接调，通过 nextBtn 或 hash）
    pg.evaluate("location.hash = '#/grid'")
    pg.wait_for_timeout(800)
    vis = pg.evaluate("(document.getElementById('viewGrid')||{}).style.display")
    tabOn = pg.evaluate("(document.getElementById('tabGrid')||{}).className")
    poolCount = pg.evaluate("document.querySelectorAll('#gridPoolBox label').length")
    print("viewGrid display:", vis, "| tabGrid class:", tabOn, "| pool items:", poolCount)
    # 数据未就绪时 GridView.render 只 init 不加载数据——需先确保 D（点击回测页 nextBtn 触发）
    pg.evaluate("""() => {
      window.__D_READY = false;
      WufuUI.ensureData(function(){ window.__D_READY = true; });
    }""")
    okD = False
    for _ in range(60):
        okD = pg.evaluate("window.__D_READY === true")
        if okD: break
        time.sleep(0.5)
    print("D ready:", okD)
    # 勾选 6 只宽基
    pg.evaluate("""() => {
      const box = document.getElementById('gridPoolBox');
      const labels = box.querySelectorAll('label');
      const want = ['510300.SH','510500.SH','159915.SZ','510050.SH','512100.SH','588000.SH'];
      labels.forEach(l => {
        const code = l.textContent.trim().split(' ').pop();
        if (want.includes(code)) { const cb = l.querySelector('input'); if (!cb.checked) cb.click(); }
      });
    }""")
    pg.wait_for_timeout(300)
    checked = pg.evaluate("Object.values(window.GridView.checked).filter(Boolean).length")
    print("checked:", checked)
    # 计算评分
    pg.evaluate("document.getElementById('gridScoreBtn').click()")
    pg.wait_for_timeout(1500)
    scoreRows = pg.evaluate("document.querySelectorAll('#gridScoreTable tbody tr').length")
    scoreText = pg.evaluate("(document.getElementById('gridScoreTable').textContent||'').slice(0,200)")
    print("score rows:", scoreRows, "| head:", scoreText.replace(chr(10),' ')[:180])
    # 参数表
    pRows = pg.evaluate("document.querySelectorAll('#gridParamTable tbody tr').length")
    print("param rows:", pRows)
    # 运行
    pg.evaluate("document.getElementById('gridRunBtn').click()")
    for _ in range(120):
        st = pg.evaluate("(document.getElementById('gridRunState')||{}).textContent || ''")
        if "完成" in st or "失败" in st: break
        time.sleep(0.5)
    time.sleep(1.5)
    resVis = pg.evaluate("(document.getElementById('gridResult')||{}).style.display")
    kpis = pg.evaluate("""() => {
      const out = {};
      document.querySelectorAll('#gridKpis .kpi').forEach(e=>{
        const t = e.querySelector('.t') ? e.querySelector('.t').textContent.trim() : '';
        const v = e.querySelector('.v') ? e.querySelector('.v').textContent.trim() : '';
        out[t] = v;
      });
      return out;
    }""")
    trades = pg.evaluate("document.querySelectorAll('#gridTradeTable tbody tr').length")
    health = pg.evaluate("document.querySelectorAll('#gridHealthTable tbody tr').length")
    navChart = pg.evaluate("!!document.getElementById('gridNavChart') && !!GridView._charts['gridNavChart']")
    print("resVis:", resVis, "| state:", st)
    print("KPI:", json.dumps(kpis, ensure_ascii=False))
    print("trades rows:", trades, "| health rows:", health, "| navChart init:", navChart)
    pg.screenshot(path="/tmp/wf_engine/grid_desk.png")
    print("errs:", errs[:8] if errs else "NONE")
    b.close()
