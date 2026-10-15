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
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    # A 未评分改区间 → 明确提示
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='90'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(400)
    print("A 未评分改区间提示:", notice_now())
    # B 评分后 input 改 volWin → applyVolWin 提示（验证 RDIDX 干扰已消除）
    check("510050.SH"); check("510300.SH")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='150'; v.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(1200)
    print("B volWin input 后提示:", notice_now())
    # C 行内编辑联动评分表
    rowT0 = pg.evaluate("""() => { var r=document.querySelector('#gridScoreTable tbody tr:nth-child(2)'); return r?r.textContent:null; }""")
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='510050.SH']"); if(inp){ inp.value='400000'; inp.dispatchEvent(new Event('input')); } }""")
    pg.wait_for_timeout(500)
    perL = pg.evaluate("""() => { var s = document.querySelector("#gridParamTable span[data-k='perL'][data-c='510050.SH']"); return s?s.textContent:null; }""")
    rowT1 = pg.evaluate("""() => { var r=document.querySelector('#gridScoreTable tbody tr:nth-child(2)'); return r?r.textContent:null; }""")
    print("C 510050 底仓40万每格:", perL, "| 评分表行内同步:", "是" if rowT0 != rowT1 else "否")
    # ===== 问题2：主回测核验（含低适配度标的参与）=====
    pg.evaluate("() => { location.hash = '#/backtest'; }")
    pg.wait_for_function("() => document.querySelector('#poolBox') && document.querySelectorAll('#poolBox .pick').length > 0", timeout=60000)
    pg.evaluate("""() => { var l = document.querySelectorAll('#poolBox .pick'); for (var i=0;i<l.length;i++){ var c=l[i].getAttribute('data-c'); if(!l[i].checked && (c==='510300.SH' || c==='159915.SZ')){ l[i].click(); } } }""")
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { var u=document.querySelector('#mfAddUsage'); u.value='rank'; var k=document.querySelector('#mfAddKind'); k.value='roc'; document.querySelector('#mfAddBtn').click(); }""")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { var k=document.querySelector('#sellKind'); k.value='hold_days'; var v=document.querySelector('#sellVal'); v.value='5'; document.querySelector('#sellBtn').click(); }""")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('#nextBtn').click()")
    pg.wait_for_timeout(600)
    pg.evaluate("() => document.querySelector('#runBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#runState'); return s && s.textContent.indexOf('已更新')>=0; }", timeout=120000)
    cap = pg.evaluate("() => window.__LAST_PARAMS || null")
    print("F 主回测入参 codes:", json.dumps(cap['codes']) if cap else None, "| mode:", cap['mode'] if cap else None)
    print("H 含低适配度159915:", '159915.SZ' in (cap['codes'] or []) if cap else None)
    # 读成交表确认 159915 是否被交易过（找真实成交表容器）
    tb = pg.evaluate("""() => { var cands = ['#tradesBody','#tradeBody','#tradesTb','#tradesTable','#trBody','#tradeList','#tradesList']; for (var i=0;i<cands.length;i++){ var el=document.querySelector(cands[i]); if(el && el.textContent) return cands[i]+':'+el.textContent.indexOf('159915'); } return 'none'; }""")
    print("I 成交表容器探测:", tb)
    print("pageerror:", errs)
    b.close()
