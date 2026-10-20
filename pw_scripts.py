from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page()
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(3000)
    info = pg.evaluate("""() => {
      const ss = document.querySelectorAll('script');
      const out = [];
      ss.forEach((s,i)=>{
        out.push({i, len: (s.textContent||'').length, head: (s.textContent||'').slice(0,60).replace(/\\n/g,' '),
                   hasBack: s.textContent.indexOf('function backtest')>=0,
                   hasEns: s.textContent.indexOf('function ensureData')>=0});
      });
      return {n: ss.length, list: out};
    }""")
    print("script 数:", info['n'])
    for x in info['list']:
        print(f"#{x['i']} len={x['len']} back={x['hasBack']} ens={x['hasEns']} | {x['head'][:55]}")
    b.close()
