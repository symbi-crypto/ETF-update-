import time, json
from playwright.sync_api import sync_playwright
html = "/home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXEC = "/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXEC)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PE: " + str(e)[:400]))
    pg.goto("file://" + html, wait_until="domcontentloaded")
    pg.wait_for_timeout(1500)
    pg.evaluate("() => { if (typeof ensureData === 'function') ensureData(function(){}); }")
    # 兜底：若 ensureData 不可达，尝试 nextBtn 路径（切模式+勾标的后点击）
    okD = False
    for _ in range(40):
        okD = pg.evaluate("typeof D !== 'undefined' && !!D && !!D.calendar")
        if okD: break
        time.sleep(1)
    perr = pg.evaluate("(document.getElementById('pageErr')||{}).textContent || ''")
    print("D ready:", okD, "| pageErr:", perr[:200] or "(空)")
    print("load errors:", errs[:6] if errs else "NONE")
    r = pg.evaluate("""() => {
      const out = {};
      const cArr = D.series['510300.SH'].close, hArr = D.series['510300.SH'].high, lArr = D.series['510300.SH'].low;
      const i = D.calendar.length - 1;
      out.nDays = D.calendar.length;
      out.er = gridER(cArr, i, 20);
      out.vol = gridAnnVol(cArr, i, 60);
      out.adx = gridADX(hArr, lArr, cArr, i, 14);
      out.q10 = gridQuantile(cArr, i-249, i, 0.10);
      out.q90 = gridQuantile(cArr, i-249, i, 0.90);
      const sc = gridScore('510300.SH', i);
      out.score = sc ? {s: sc.score.toFixed(1), gate: sc.gate, vol: sc.vol && (sc.vol*100).toFixed(1), adx: sc.adx && sc.adx.toFixed(1), er: sc.er && sc.er.toFixed(3), amt: sc.amtAvg && sc.amtAvg.toFixed(2)} : null;
      const gp = gridParams('510300.SH', i, 100000, 0.00075);
      out.gp = gp ? {lower: gp.lower.toFixed(2), upper: gp.upper.toFixed(2), step: gp.step.toFixed(3), nLev: gp.nLevels, perLevel: gp.perLevelAmt.toFixed(0), base: gp.baseAmt.toFixed(0), warns: gp.warns} : null;
      const res = backtestGrid(D, {codes:['510300.SH'], initial_capital:100000, mgmt:'A', period_n:12, period_unit:'周', commission_rate:0.00025, slippage_rate:0.0005, min_commission:0});
      out.bt = res ? {total: (res.metrics.total_return*100).toFixed(2)+'%', cagr: (res.metrics.cagr*100).toFixed(2)+'%', mdd: (res.metrics.max_dd*100).toFixed(2)+'%', sharpe: res.metrics.sharpe.toFixed(2), trades: res.metrics.n_trades, navEnd: res.nav[res.nav.length-1].toFixed(0), health: res.health.length} : null;
      const res2 = backtestGrid(D, {codes:['510300.SH','510500.SH','159915.SZ'], initial_capital:300000, mgmt:'B', period_n:12, period_unit:'周', commission_rate:0.00025, slippage_rate:0.0005, min_commission:0});
      out.bt2 = res2 ? {total: (res2.metrics.total_return*100).toFixed(2)+'%', mdd: (res2.metrics.max_dd*100).toFixed(2)+'%', trades: res2.metrics.n_trades, health: res2.health.length, h0: res2.health.slice(0,2)} : null;
      return out;
    }""")
    print(json.dumps(r, ensure_ascii=False, indent=1)[:3200])
    print("errs:", errs[:8] if errs else "NONE")
    b.close()
