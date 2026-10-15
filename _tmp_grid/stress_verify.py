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
    def check(code):
        pg.evaluate("""(c) => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp = l[i].querySelector('input'); if (inp && !inp.checked && l[i].textContent.indexOf(c) >= 0){ inp.click(); return; } } }""", code)
    for c in ["510300.SH","512690.SH","510050.SH"]:
        check(c)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    print("评分完成 ✓")
    # 下一步 → 压力测试步骤
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_timeout(400)
    print("进入 step2 压力测试:", "可见" if pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'") else "不可见")
    print("step2 顶部说明:", pg.evaluate("() => { var s=document.querySelector('#gridStep2'); return s ? s.textContent.replace(/\\s+/g,' ').trim().slice(0,120) : null; }"))
    # 运行压力测试
    pg.evaluate("() => document.querySelector('#gridStressBtn').click()")
    st = None
    for _ in range(240):
        st = pg.evaluate("() => { var s=document.querySelector('#gridStressState'); return s?s.textContent:null; }")
        if st == '完成' or (st and st.startswith('失败')):
            break
        pg.wait_for_timeout(2000)
    print("runStress state(轮询):", st)
    res = pg.evaluate("""() => {
      var r = document.querySelector('#gridStressResult');
      var txt = r.textContent;
      return {
        segCards: r.querySelectorAll('div[style*=\"flex:1;min-width\"]').length,
        has2015: txt.indexOf('2015 股灾') >= 0,
        has2015msg: txt.indexOf('日历未覆盖') >= 0,
        hasMaxDD: txt.indexOf('全历史最大回撤') >= 0,
        hasBreach: txt.indexOf('破网情景模拟') >= 0,
        hasPerturb: txt.indexOf('参数扰动对比') >= 0,
        hasOverflow: txt.indexOf('资金耗尽') >= 0,
        rowCount: r.querySelectorAll('table tbody tr').length
      };
    }""")
    print("runStress state:", st)
    print("① 段卡片数:", res['segCards'], "| 2015 标注:", res['has2015'] and res['has2015msg'], "| 最大回撤段:", res['hasMaxDD'])
    print("② 破网:", res['hasBreach'], "| 资金耗尽提示:", res['hasOverflow'])
    print("③ 扰动表:", res['hasPerturb'], "| 表格行数:", res['rowCount'])
    # 下一步 → 回测设置
    pg.evaluate("() => document.querySelector('#gridNext2Btn').click()")
    pg.wait_for_timeout(400)
    print("进入 step3 回测设置:", "可见" if pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep3')).display !== 'none'") else "不可见")
    print("step2 已隐藏:", pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep2')).display === 'none'"))
    # 回测
    pg.evaluate("() => document.querySelector('#gridRunBtn').click()")
    pg.wait_for_function("() => { var s=document.querySelector('#gridRunState'); return s && (s.textContent==='完成' || (s.textContent||'').indexOf('失败')>=0); }", timeout=180000)
    print("回测 runState:", pg.evaluate("() => document.querySelector('#gridRunState').textContent"))
    # 上一步链：step3→step2→step1
    pg.evaluate("() => document.querySelector('#gridPrevBtn').click()")
    pg.wait_for_timeout(300)
    print("上一步 → step2:", "可见" if pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'") else "不可见")
    pg.evaluate("() => document.querySelector('#gridPrev2Btn').click()")
    pg.wait_for_timeout(300)
    print("上一步 → step1:", "可见" if pg.evaluate("() => getComputedStyle(document.querySelector('#gridStep1')).display !== 'none'") else "不可见")
    print("pageerror:", errs)
    b.close()
