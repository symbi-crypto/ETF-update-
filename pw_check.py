from playwright.sync_api import sync_playwright
import json, sys
sys.path.insert(0, "/home/user/.doubao/agent_mode/workspace/.skills/html/scripts")
import shot
CHROME = shot._find_chromium_fallback()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto("file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html")
    pg.wait_for_timeout(9000)
    print("D:", pg.evaluate("typeof D !== 'undefined' ? D.calendar[0]+'~'+D.calendar[D.calendar.length-1] : '未加载'"))
    print("dbDate:", pg.evaluate("document.getElementById('dbDate').textContent"))
    print("ensureData:", pg.evaluate("typeof ensureData"))
    r = pg.evaluate("""() => {
      const D_ = (typeof globalThis !== 'undefined' && globalThis.D) || D;
      const pool = D_.pool || [];
      const codes = pool.slice(0, 5).map(x => x.code);
      const params = {
        factors: [{name:"涨幅", usage:"rank", window:20, enabled:true, weight:1}],
        rankRange: [1, 3], buyAddCond: [], sellCond: [],
        standardize: "zscore", initial_capital: 1000000,
        commission_rate: 0.0003, slippage_rate: 0.0005,
        start_date: D_.calendar[0], end_date: D_.calendar[D_.calendar.length-1],
        rebalance_freq: "monthly", fallback_when_no_signal: "cash",
        benchmark: "000300.SH"
      };
      try {
        const res = backtest(D_, params);
        const agg = {};
        (res.symTrades||[]).forEach(t=>{agg[t.code]=(agg[t.code]||0)+1;});
        return {ok:true, n_trades: res.trades.length, symTrades: (res.symTrades||[]).length, n_sym: Object.keys(agg).length, byCode: agg, sample: (res.symTrades||[]).slice(0,2)};
      } catch(e) { return {ok:false, err: e.message}; }
    }""")
    print("回测:", json.dumps(r, ensure_ascii=False)[:700])
    b.close()
