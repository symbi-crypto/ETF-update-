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
    pg.evaluate("localStorage.removeItem('WUFU_STRATEGIES'); localStorage.removeItem('wufu_strategies')")
    pg.wait_for_timeout(300)
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
    pg.wait_for_timeout(12000)
    # 展开 ④策略与管理
    pg.evaluate('document.querySelector(\'.sfold-h[data-g="mgmt"]\').click()')
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const i=document.getElementById('stName'); if(i){ i.value='统计tab验证'; i.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(200)
    pg.click("#saveSt"); pg.wait_for_timeout(1500)
    print("保存后 stCount:", pg.evaluate("document.getElementById('stCount').textContent"))
    # 切到我的策略
    pg.evaluate("""() => { const t=[...document.querySelectorAll('.navitem, [class*=nav] span, [class*=nav] b, .nav a')].find(x=>x.innerText.includes('我的策略')); if(t) t.click(); }""")
    pg.wait_for_timeout(1000)
    # 打开详情
    pg.evaluate("""() => { const it=[...document.querySelectorAll('#stListV div, #stListV span, #stListV button, #stListV li')].find(x=>x.innerText.includes('统计tab验证')); if(it) it.click(); }""")
    pg.wait_for_timeout(2500)
    st = pg.evaluate("""() => {
      const out = {view: document.getElementById('viewStrategies') ? document.getElementById('viewStrategies').style.display : '?'};
      out.stDetail = document.getElementById('stDetail') ? document.getElementById('stDetail').style.display : '?';
      out.tabs = [...document.querySelectorAll('#stStatsCard2 .sttab')].map(t=>t.innerText.trim());
      out.active = [...document.querySelectorAll('#stStatsCard2 .sttab')].filter(t=>t.className.includes('active')).map(t=>t.getAttribute('data-t'));
      out.yearRows = document.querySelectorAll('#stYearly2 tbody tr').length;
      out.symRows = document.querySelectorAll('#symTable2 tbody tr').length;
      out.ddRows = document.querySelectorAll('#ddTable2 tbody tr').length;
      out.year1 = document.querySelector('#stYearly2 tbody tr') ? document.querySelector('#stYearly2 tbody tr').innerText.replace(/\\t/g,' | ').slice(0,70) : '';
      out.sym1 = document.querySelector('#symTable2 tbody tr') ? document.querySelector('#symTable2 tbody tr').innerText.replace(/\\t/g,' | ').slice(0,70) : '';
      out.dd1 = document.querySelector('#ddTable2 tbody tr') ? document.querySelector('#ddTable2 tbody tr').innerText.replace(/\\t/g,' | ').slice(0,90) : '';
      return out;
    }""")
    print("我的策略详情:", st)
    print("pageerror:", errs[:5])
    pg.screenshot(path="/tmp/ui_mypage.png")
    b.close()
