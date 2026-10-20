from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    pg.click("text=轮动回测"); pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const cbs = [...document.querySelectorAll('#step1 input[type=checkbox]')].filter(c=>c.offsetParent!==null);
      cbs.slice(0,5).forEach(c=>c.click());
    }""")
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    pg.select_option("#mfAddKind", "roc")
    pg.select_option("#mfAddUsage", "rank")
    pg.click("#mfAddBtn"); pg.wait_for_timeout(500)
    pg.evaluate("""() => { const a=[...document.querySelectorAll('#step2 button')].filter(b=>b.innerText.trim()==='添加' && b.offsetParent!==null); if(a.length>=3) a[2].click(); }""")
    pg.wait_for_timeout(300)
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='运行回测'); if(b) b.click(); }""")
    pg.wait_for_timeout(2500)
    pg.wait_for_timeout(8000)
    print("pageerror:", errs[:5])
    # 三tab 检查 + ddTable 逐格
    st = pg.evaluate("""() => {
      const tabs = [...document.querySelectorAll('#stStatsCard .sttab')].map(t=>t.innerText.trim());
      const out = {tabs, tabActive: [], yearRows: 0, symRows: 0, ddRows: 0, ddCells: []};
      document.querySelectorAll('#stStatsCard .sttab').forEach(t=>{ if(t.className.includes('active')) out.tabActive.push(t.getAttribute('data-t')); });
      out.yearRows = document.querySelectorAll('#stYearly tbody tr').length;
      out.symRows = document.querySelectorAll('#symTable tbody tr').length;
      const ddrs = document.querySelectorAll('#ddTable tbody tr');
      out.ddRows = ddrs.length;
      ddrs.forEach(r => { const c = [...r.children].map(td=>td.innerText.trim()); out.ddCells.push(c.join('|')); });
      return out;
    }""")
    print("tabs:", st['tabs'], "active:", st['tabActive'])
    print("yearRows:", st['yearRows'], "symRows:", st['symRows'], "ddRows:", st['ddRows'])
    print("ddCells:", st['ddCells'])
    # tab 切换
    pg.click("#stStatsCard .sttab[data-t='dd']")
    pg.wait_for_timeout(300)
    print("切dd后: year pane:", pg.evaluate("document.getElementById('stStats-year').style.display"), "| dd pane:", pg.evaluate("document.getElementById('stStats-dd').style.display"))
    pg.click("#stStatsCard .sttab[data-t='year']")
    pg.wait_for_timeout(300)
    print("切year后: dd pane:", pg.evaluate("document.getElementById('stStats-dd').style.display"), "| year pane:", pg.evaluate("document.getElementById('stStats-year').style.display"))
    pg.screenshot(path="/tmp/ui_stats2.png")
    b.close()
