import json, time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    def notice_now():
        return pg.evaluate("() => { var n=document.querySelector('#notice'); return n && n.style && n.style.display!=='none' ? n.textContent : null; }")
    # A 未评分改区间 → 明确提示
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='90'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    print("A 未评分改区间提示:", notice_now())
    # 评分（勾 510050：分数高、宽基；再加 510300 多标的）
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    check("510050.SH"); check("510300.SH")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    # B input 事件改 volWin（手机端模拟）→ applyVolWin 执行 + 提示
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='150'; v.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(1200)
    print("B volWin input 后提示:", notice_now())
    # C 行内底仓 input → 参数表每格 + 评分表行内同步（新修复）
    rowT0 = pg.evaluate("""() => { var r=document.querySelector('#gridScoreTable tbody tr:nth-child(2)'); return r?r.textContent:null; }""")
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='510050.SH']"); if(inp){ inp.value='400000'; inp.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(500)
    perL = pg.evaluate("""() => { var s = document.querySelector("#gridParamTable span[data-k='perL'][data-c='510050.SH']"); return s?s.textContent:null; }""")
    rowT1 = pg.evaluate("""() => { var r=document.querySelector('#gridScoreTable tbody tr:nth-child(2)'); return r?r.textContent:null; }""")
    print("C 510050 底仓40万后每格:", perL, "| 评分表行内同步:", "是" if rowT0 != rowT1 else "否")
    # D triggerBase input → 档位预览 + 评分表行内
    lvl0 = pg.evaluate("""() => { var s = document.querySelector("#gridParamTable span[data-k='lvlPrev'][data-c='510050.SH']"); return s?s.textContent:null; }""")
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='triggerBase'][data-c='510050.SH']"); if(inp){ inp.value='3.900'; inp.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(500)
    lvl1 = pg.evaluate("""() => { var s = document.querySelector("#gridParamTable span[data-k='lvlPrev'][data-c='510050.SH']"); return s?s.textContent:null; }""")
    print("D 510050 基准3.9后档位:", lvl0, "→", lvl1)
    # ===== 问题2：主回测核验 =====
    pg.evaluate("() => { location.hash = '#/backtest'; }")
    pg.wait_for_function("() => document.querySelector('#poolBox') && document.querySelectorAll('#poolBox .pick').length > 0", timeout=60000)
    # 先看回测页池是否被网格页 filterOn 污染（无 disabled / 无标注）
    pg.evaluate("""() => { var l = document.querySelectorAll('#poolBox .pick'); for (var i=0;i<l.length;i++){ var c=l[i].getAttribute('data-c'); if(!l[i].checked && (c==='510300.SH' || c==='159915.SZ')){ l[i].click(); } } }""")
    pg.wait_for_timeout(400)
    print("E 回测页勾选:", pg.evaluate("() => document.querySelectorAll('#poolBox .pick:checked').length"),
          "| disabled:", pg.evaluate("() => document.querySelectorAll('#poolBox .pick:disabled').length"))
    # hook backtest 抓 codes + trades 标的集合
    pg.evaluate("""() => { window.__CAP={}; var orig=WufuEngine.backtest; WufuEngine.backtest=function(p){ window.__CAP.codes=(p.codes||[]).slice(); var r=orig.apply(this,arguments); window.__CAP.codes2=r && r.codes ? r.codes.slice() : null; window.__CAP.tcodes = r && r.trades ? Array.from(new Set(r.trades.map(function(t){return t.code;}))) : null; return r; }; }""")
    pg.evaluate("""() => { var u=document.querySelector('#mfAddUsage'); u.value='rank'; var k=document.querySelector('#mfAddKind'); k.value='roc'; document.querySelector('#mfAddBtn').click(); }""")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { var k=document.querySelector('#sellKind'); k.value='hold_days'; var v=document.querySelector('#sellVal'); v.value='5'; document.querySelector('#sellBtn').click(); }""")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('#nextBtn').click()")
    pg.wait_for_timeout(600)
    pg.evaluate("() => document.querySelector('#runBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && s.textContent.indexOf('已更新')>=0; }", timeout=120000)
    cap = pg.evaluate("() => window.__CAP")
    print("F 主回测传入 codes:", json.dumps(cap['codes']))
    print("G 成交标的集合:", json.dumps(cap['tcodes']))
    print("H 含低适配度159915:", ('159915.SZ' in (cap['codes'] or [])))
    print("pageerror:", errs)
    b.close()
