import json, os
from playwright.sync_api import sync_playwright
CHROME = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
def run(viewport, out, tag):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport=viewport)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.goto(URL, wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)
        pg.evaluate("() => { location.hash = '#/grid'; }")
        pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelectorAll('#gridPoolBox label').length>0", timeout=60000)
        pos = pg.evaluate("""() => {
          var btn = document.getElementById('gridNextBtn');
          var tbl = document.getElementById('gridScoreTable');
          return { btn: !!btn, tbl: !!tbl, btnY: btn ? Math.round(btn.getBoundingClientRect().top) : -1, tblY: tbl ? Math.round(tbl.getBoundingClientRect().top) : -1 };
        }""")
        print(tag, "存在性:", pos)
        print(tag, "step1: 按钮y=%d 评分表y=%d -> 按钮在评分表之前:%s" % (pos['btnY'], pos['tblY'], pos['btnY'] < pos['tblY']))
        pg.evaluate("(cs) => { var l=document.querySelectorAll('#gridPoolBox label'); for(var i=0;i<l.length;i++){ var inp=l[i].querySelector('input'); if(inp&&!inp.checked){ var t=l[i].textContent; for(var j=0;j<cs.length;j++){ if(t.indexOf(cs[j])>=0){ inp.click(); break; } } } } }", ["510300.SH","512690.SH","510050.SH"])
        pg.wait_for_timeout(400)
        pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
        pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length>0; }", timeout=180000)
        pg.screenshot(path=out.replace('.jpg','_step1.jpg'), full_page=True)
        pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
        pg.wait_for_timeout(400)
        pos2 = pg.evaluate("""() => {
          var op = document.querySelector('#gridStressDepth');
          var n2 = document.getElementById('gridNext2Btn');
          var p2 = document.getElementById('gridPrev2Btn');
          var res = document.getElementById('gridStressResult');
          return { opY: Math.round(op.getBoundingClientRect().top), nextY: Math.round(n2.getBoundingClientRect().top), prevY: Math.round(p2.getBoundingClientRect().top), resY: Math.round(res.getBoundingClientRect().top) };
        }""")
        print(tag, "step2: 操作区y=%d 上一步y=%d 下一步y=%d 结果区y=%d -> 按钮在结果区之前:%s" % (pos2['opY'], pos2['prevY'], pos2['nextY'], pos2['resY'], pos2['nextY'] < pos2['resY']))
        pg.screenshot(path=out, full_page=True)
        pg.evaluate("() => document.querySelector('#gridStressBtn').click()")
        for _ in range(200):
            st = pg.evaluate("() => { var s=document.querySelector('#gridStressState'); return s?s.textContent:null; }")
            if st=='完成' or (st or '').startswith('失败'): break
            pg.wait_for_timeout(2000)
        pg.evaluate("() => document.querySelector('#gridNext2Btn').click()")
        pg.wait_for_timeout(400)
        vis3 = pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep3')).display !== 'none'")
        pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
        for _ in range(200):
            st3 = pg.evaluate("() => { var s=document.querySelector('#gridRunState'); return s?s.textContent:null; }")
            if st3=='完成' or (st3 or '').startswith('失败'): break
            pg.wait_for_timeout(2000)
        print(tag, "压力测试:", st, "| 回测:", st3, "| step3可见:", vis3, "| errs:", errs[:2])
        b.close()
run({"width":1440,"height":900}, "_tmp_grid/layout_desk.jpg", "desktop")
run({"width":390,"height":844}, "_tmp_grid/layout_mob.jpg", "mobile")
print("done")
