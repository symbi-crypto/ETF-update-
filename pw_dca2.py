from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    pg.click("text=定投回测"); pg.wait_for_timeout(1000)
    # 可见 checkbox 数量
    vis = pg.evaluate("""() => {
      const cb = [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.offsetParent!==null);
      return {n: cb.length, first: cb.slice(0,3).map(c=>c.closest('label,div,span') ? (c.closest('label,div,span').innerText||'').slice(0,40): '?')};
    }""")
    print("可见checkbox:", vis)
    # 页面可见文本开头
    t = pg.evaluate("document.body.innerText.slice(0, 400)")
    print("页面文本:", t.replace('\n',' | ')[:400])
    # 定投相关控件
    print("dca 控件:", pg.evaluate("""() => {
      const ids = ['dcaDivSel','dcaAmountIn','dcaStartSel','dcaFreqSel','dcaRunBtn'];
      const out = {};
      ids.forEach(i=>{ const e=document.getElementById(i); out[i] = e ? (e.offsetParent!==null ? 'visible' : 'hidden') : 'missing'; });
      return out;
    }"""))
    b.close()
