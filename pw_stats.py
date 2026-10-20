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
    print("runState:", pg.evaluate("document.getElementById('runState').textContent"))
    pg.wait_for_timeout(8000)
    print("pageerror:", errs[:5])
    # 统计卡三tab检查
    st = pg.evaluate("""() => {
      const tabs = [...document.querySelectorAll('#stStats .sttab')].map(t=>t.innerText.trim());
      const yearRows = document.querySelectorAll('#stYearly tbody tr').length;
      const symRows = document.querySelectorAll('#symTable tbody tr').length;
      const ddRows = document.querySelectorAll('#ddTable tbody tr').length;
      const year1 = document.querySelector('#stYearly tbody tr') ? document.querySelector('#stYearly tbody tr').innerText.replace(/\\n/g,' | ') : '';
      const dd1 = document.querySelector('#ddTable tbody tr') ? document.querySelector('#ddTable tbody tr').innerText.replace(/\\n/g,' | ') : '';
      const sym1 = document.querySelector('#symTable tbody tr') ? document.querySelector('#symTable tbody tr').innerText.replace(/\\n/g,' | ') : '';
      return {tabs, yearRows, symRows, ddRows, year1, sym1, dd1};
    }""")
    print("统计卡:", st)
    # tab 切换测试
    pg.evaluate("switchStatsTab('stStats','dd')")
    pg.wait_for_timeout(300)
    print("切dd后 year pane:", pg.evaluate("document.getElementById('stStats-year').style.display"), "dd pane:", pg.evaluate("document.getElementById('stStats-dd').style.display"))
    pg.evaluate("switchStatsTab('stStats','sym')")
    pg.wait_for_timeout(300)
    print("切sym后 dd pane:", pg.evaluate("document.getElementById('stStats-dd').style.display"), "sym pane:", pg.evaluate("document.getElementById('stStats-sym').style.display"))
    pg.screenshot(path="/tmp/ui_stats.png")
    b.close()
