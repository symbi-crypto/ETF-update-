import json, time
from playwright.sync_api import sync_playwright
URL = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell")
    pg = b.new_page(viewport={"width":390,"height":844})
    pg.goto(URL, wait_until="domcontentloaded", timeout=120000)
    pg.evaluate("() => { location.hash = '#/grid'; }")
    pg.wait_for_function("() => document.querySelector('#gridPoolBox') && document.querySelector('#gridPoolBox').children.length > 0", timeout=60000)
    pg.evaluate("""() => { var l = document.querySelectorAll('#gridPoolBox label'); for (var i=0;i<l.length;i++){ var inp=l[i].querySelector('input'); var t=l[i].textContent; if(inp && !inp.checked && (t.indexOf('510300.SH')>=0 || t.indexOf('159915.SZ')>=0)){ inp.click(); } } }""")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#gridScoreBtn').click()")
    pg.wait_for_function("() => { var t=document.querySelector('#gridScoreTable'); return t && t.querySelectorAll('tbody tr').length > 0; }", timeout=180000)
    pg.evaluate("() => document.querySelector('#gridNextBtn').click()")
    pg.wait_for_function("() => getComputedStyle(document.querySelector('#gridStep2')).display !== 'none'", timeout=30000)
    # 修改参数（底仓30万/基准5.8/volWin120）后 run
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='baseAmt'][data-c='510300.SH']"); if(inp){ inp.value='300000'; inp.dispatchEvent(new Event('change')); } }""")
    pg.evaluate("""() => { var inp = document.querySelector("#gridParamTable input[data-k='triggerBase'][data-c='510300.SH']"); if(inp){ inp.value='5.800'; inp.dispatchEvent(new Event('change')); } }""")
    pg.evaluate("""() => { var v=document.querySelector('#gridVolWin'); if(v){ v.value='120'; v.dispatchEvent(new Event('change')); } }""")
    pg.wait_for_timeout(600)
    # hook run：抓 GridView 的 params 与引擎结果
    pg.evaluate("""() => {
      var orig = WufuEngine.backtestGrid;
      window.__CAP = {};
      WufuEngine.backtestGrid = function(Dd, params) {
        window.__CAP.params = params;
        var r = orig.apply(this, arguments);
        window.__CAP.res = r ? {total: r.metrics.total_return, trades: r.metrics.n_trades, cagr: r.metrics.cagr, dd: r.metrics.max_dd, shp: r.metrics.sharpe} : null;
        return r;
      };
    }""")
    pg.evaluate("() => { var b=document.querySelector('#gridRunBtn'); if(b) b.click(); }")
    pg.wait_for_function("() => { var k=document.querySelector('#gridKpis'); return k && k.querySelectorAll('.kpi').length > 0; }", timeout=120000)
    cap = pg.evaluate("() => window.__CAP")
    print("=== UI 实际传参 ===")
    print(json.dumps({k: cap['params'][k] for k in ['codes','initial_capital','mgmt','period_n','period_unit','commission_rate','slippage_rate','min_commission','vol_win']}, ensure_ascii=False))
    print("overrides:", json.dumps(cap['params']['gridOverrides'], ensure_ascii=False))
    print("=== 引擎返回 ===")
    print(json.dumps(cap['res']))
    b.close()
