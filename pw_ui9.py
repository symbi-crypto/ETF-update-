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
    pg.click("text=轮动回测"); pg.wait_for_timeout(800)
    boxes = pg.query_selector_all("#step1 input[type=checkbox]")
    for bx in boxes[:5]: bx.click()
    pg.click("text=下一步 · 开始回测"); pg.wait_for_timeout(2500)
    # dump 因子管理区 HTML（含"全部因子"到"添加"）
    seg = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('#step2 *')];
      const tgt = els.find(e => e.childElementCount===0 && e.textContent.trim()==='全部因子');
      if (!tgt) return 'no 全部因子';
      let p = tgt.parentElement;
      for (let k=0;k<8&&p;k++,p=p.parentElement){
        const t = p.innerText||'';
        if (t.includes('排名') && t.includes('添加')) { return p.outerHTML.slice(0, 3000); }
      }
      return 'not found';
    }""")
    print(seg[:2500])
    b.close()
