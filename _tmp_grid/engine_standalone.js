(function (global) {
  "use strict";
  // 数据源统一入口：浏览器由 UI 块把已解析的数据挂到 global.__GRID_D；
  // node 独立测试设 global.D。gridScore/backtestGrid 等内部一律经此取数。
  function gridData() {
    return (typeof globalThis !== "undefined" && (globalThis.__GRID_D || globalThis.D)) || null;
  }
  // 标的池元信息（补位只补真实 ETF）：浏览器 window.WUFU_POOL；node 测试 global.POOL
  var POOL = (typeof globalThis !== "undefined" && (globalThis.WUFU_POOL || globalThis.POOL)) || [];

  // ---------- 工具 ----------
  function isMiss(v) { return v === null || v === undefined || (typeof v === "number" && (isNaN(v) || v < 0)); }

  // ---------- 动量得分：对数收盘价 OLS ----------
  // closes: 长度为 w 的有效数组（已过滤缺失）；返回 {score, r2, slope, annSlope}
  function momentumMetrics(closes, w, ann) {
    var i, n = w;
    var y = new Array(n);
    for (i = 0; i < n; i++) y[i] = Math.log(closes[i]);
    var xm = (w - 1) / 2;
    var ym = 0;
    for (i = 0; i < n; i++) ym += y[i];
    ym /= n;
    var sxx = 0, sxy = 0, dx, dy;
    for (i = 0; i < n; i++) { dx = i - xm; dy = y[i] - ym; sxx += dx * dx; sxy += dx * dy; }
    var slope = sxx > 0 ? sxy / sxx : 0;
    var intercept = ym - slope * xm;
    var ssRes = 0, ssTot = 0, yhat;
    for (i = 0; i < n; i++) { yhat = slope * i + intercept; ssRes += (y[i] - yhat) * (y[i] - yhat); ssTot += (y[i] - ym) * (y[i] - ym); }
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    var annSlope = slope * ann;
    return { score: annSlope * r2, r2: r2, slope: slope, annSlope: annSlope };
  }

  // ---------- 动量得分：对数收盘价加权线性回归（WLS，权重线性递增、近期更大） ----------
  function weightedMomentumMetrics(closes, w, ann) {
    var i, n = w;
    var y = new Array(n), wt = new Array(n);
    for (i = 0; i < n; i++) { y[i] = Math.log(closes[i]); wt[i] = i + 1; }
    var wsum = n * (n + 1) / 2, xw = 0, yw = 0;
    for (i = 0; i < n; i++) { xw += wt[i] * i / wsum; yw += wt[i] * y[i] / wsum; }
    var den = 0, num = 0, dx;
    for (i = 0; i < n; i++) { dx = i - xw; den += wt[i] * dx * dx; num += wt[i] * dx * (y[i] - yw); }
    var slope = den > 0 ? num / den : 0;
    var intercept = yw - slope * xw;
    var ssRes = 0, ssTot = 0, yhat;
    for (i = 0; i < n; i++) { yhat = slope * i + intercept; ssRes += wt[i] * (y[i] - yhat) * (y[i] - yhat); ssTot += wt[i] * (y[i] - yw) * (y[i] - yw); }
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    var annSlope = slope * ann;
    return { score: annSlope * r2, r2: r2, slope: slope, annSlope: annSlope };
  }

  // ---------- 截至 i 日（含）的 n 日均线；不足或含缺失返回 NaN ----------
  function rollingMA(arr, i, n) {
    if (i + 1 < n) return NaN;
    var s = 0, k;
    for (k = i - n + 1; k <= i; k++) {
      if (isMiss(arr[k])) return NaN;
      s += arr[k];
    }
    return s / n;
  }

  // ==================== 网格交易策略回测模块（独立于轮动/再平衡引擎；复用数据块 D 后复权序列与日历；无前视：当日 high/low 触发→次日开盘成交；A股 T+1：当日买入次日才可卖） ====================
  // ---------- 指标工具 ----------
  function gridER(cArr, i, n) {
    if (i + 1 < n) return NaN;
    var net = Math.abs(cArr[i] - cArr[i - n]), sum = 0, j;
    for (j = i - n + 1; j <= i; j++) { if (isMiss(cArr[j]) || isMiss(cArr[j - 1])) return NaN; sum += Math.abs(cArr[j] - cArr[j - 1]); }
    return sum > 0 ? net / sum : 0;
  }
  function gridAnnVol(cArr, i, n) {
    n = n || 60;
    if (i + 1 < n) return NaN;
    var rets = [], t, mu = 0;
    for (t = i - n + 1; t <= i; t++) { if (isMiss(cArr[t]) || isMiss(cArr[t - 1])) return NaN; rets.push(cArr[t] / cArr[t - 1] - 1); }
    for (t = 0; t < rets.length; t++) mu += rets[t];
    mu /= rets.length;
    var v2 = 0;
    for (t = 0; t < rets.length; t++) v2 += (rets[t] - mu) * (rets[t] - mu);
    return Math.sqrt(v2 / rets.length) * Math.sqrt(252);
  }
  function gridADX(hArr, lArr, cArr, i, n) {
    n = n || 14;
    var need = n * 2 + 1;
    if (i + 1 < need) return NaN;
    var j, tr = [], dmP = [], dmM = [], dxs = [];
    var prevC = cArr[i - need];
    for (j = i - need + 1; j <= i; j++) {
      if (isMiss(hArr[j]) || isMiss(lArr[j]) || isMiss(cArr[j]) || isMiss(prevC)) return NaN;
      var h = hArr[j], l = lArr[j], pc = prevC;
      var up = h - hArr[j - 1], dn = lArr[j - 1] - l;
      var dP = (up > dn && up > 0) ? up : 0;
      var dM = (dn > up && dn > 0) ? dn : 0;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      dmP.push(dP); dmM.push(dM);
      prevC = cArr[j];
    }
    var smTr = 0, smP = 0, smM = 0, k;
    for (k = 0; k < n; k++) { smTr += tr[k]; smP += dmP[k]; smM += dmM[k]; }
    var dIP = 100 * smP / smTr, dIM = 100 * smM / smTr;
    dxs.push(smTr > 0 ? 100 * Math.abs(dIP - dIM) / (dIP + dIM) : 0);
    for (k = n; k < tr.length; k++) {
      smTr = (smTr * (n - 1) + tr[k]) / n;
      smP = (smP * (n - 1) + dmP[k]) / n;
      smM = (smM * (n - 1) + dmM[k]) / n;
      var a = smTr > 0 ? 100 * Math.abs(smP - smM) / (smP + smM) : 0;
      dxs.push(a);
    }
    var adx = 0;
    for (k = 0; k < n; k++) adx += dxs[k];
    adx /= n;
    for (k = n; k < dxs.length; k++) adx = (adx * (n - 1) + dxs[k]) / n;
    return adx;
  }
  function gridQuantile(arr, lo, hi, p) {
    var vals = [], j;
    for (j = Math.max(0, lo); j <= hi; j++) { if (!isMiss(arr[j])) vals.push(arr[j]); }
    if (!vals.length) return NaN;
    vals.sort(function (a, b) { return a - b; });
    var pos = p * (vals.length - 1), i0 = Math.floor(pos), i1 = Math.ceil(pos);
    if (i0 === i1) return vals[i0];
    return vals[i0] + (vals[i1] - vals[i0]) * (pos - i0);
  }
  function gridMean(arr, lo, hi) {
    var s = 0, c = 0, j;
    for (j = Math.max(0, lo); j <= hi; j++) { if (!isMiss(arr[j])) { s += arr[j]; c++; } }
    return c ? s / c : NaN;
  }
  function gridStd(cArr, lo, hi) {
    var vals = [], j, mu = 0;
    for (j = Math.max(1, lo); j <= hi; j++) { if (isMiss(cArr[j]) || isMiss(cArr[j - 1])) return NaN; vals.push(cArr[j] / cArr[j - 1] - 1); }
    if (vals.length < 2) return NaN;
    for (j = 0; j < vals.length; j++) mu += vals[j];
    mu /= vals.length;
    var v2 = 0;
    for (j = 0; j < vals.length; j++) v2 += (vals[j] - mu) * (vals[j] - mu);
    return Math.sqrt(v2 / (vals.length - 1));
  }
  // ---------- 网格适配度评分（加权：震荡度30 / 波动空间25 / 区间覆盖20 / 触发频率15 / 成本流动性10；硬门槛：波动<8%或>55%、上市<250天剔除） ----------
  var GRID_LOOK = 250;
  var GRID_T0 = /^(511|513|518)/;   // 货币/债券/海外/黄金类 T+0，流动性加分
  function gridScore(code, i) {
    var D = gridData();
    var sArr = D.series[code];
    var cArr = sArr.close, hArr = sArr.high, lArr = sArr.low, aArr = sArr.amount;
    var lo = Math.max(0, i - GRID_LOOK + 1);
    var valid = 0, j;
    for (j = lo; j <= i; j++) if (!isMiss(cArr[j])) valid++;
    var vol = gridAnnVol(cArr, i, 60);
    var out = { code: code, gate: [], score: 0, parts: {}, vol: isNaN(vol) ? NaN : vol, adx: NaN, er: NaN, mom20: NaN, amtAvg: NaN, validDays: valid };
    if (valid < GRID_LOOK || isNaN(vol)) { out.gate.push(valid < GRID_LOOK ? "上市<250天" : "数据不足"); return out; }
    if (vol < 0.08 || vol > 0.55) { out.gate.push(vol < 0.08 ? "波动<8%" : "波动>55%"); out.parts.vol = 0; return out; }
    var er20 = gridER(cArr, i, 20), er60 = gridER(cArr, i, 60), erM = (er20 + er60) / 2;
    var adx = gridADX(hArr, lArr, cArr, i, 14);
    var mom20 = Math.abs(cArr[i] / cArr[i - 20] - 1) * 100;
    var sEr = Math.max(0, Math.min(100, (1 - erM) * 100));
    var sAdx = isNaN(adx) ? 40 : Math.max(0, Math.min(100, 100 - adx * 2.5));
    var sMom = Math.max(0, Math.min(100, 100 - mom20 * 12));
    var osc = 0.34 * sEr + 0.33 * sAdx + 0.33 * sMom;
    var vP;
    if (vol >= 0.15 && vol <= 0.30) vP = 100;
    else if (vol >= 0.10 && vol < 0.15) vP = 40 + (vol - 0.10) / 0.05 * 60;
    else if (vol > 0.30 && vol <= 0.40) vP = 100 - (vol - 0.30) / 0.10 * 60;
    else if (vol < 0.10) vP = Math.max(0, (vol - 0.08) / 0.02 * 40);
    else vP = Math.max(0, (0.55 - vol) / 0.15 * 40);
    var p10 = gridQuantile(cArr, lo, i, 0.10), p90 = gridQuantile(cArr, lo, i, 0.90);
    var cov = 0;
    if (p90 > p10) { for (j = lo; j <= i; j++) if (!isMiss(cArr[j]) && cArr[j] >= p10 && cArr[j] <= p90) cov++; cov = cov / valid * 100; }
    var step5 = (p90 - p10) / 20, cross = 0;
    if (step5 > 0) {
      for (j = Math.max(1, lo); j <= i; j++) {
        if (isMiss(cArr[j]) || isMiss(cArr[j - 1])) continue;
        var pv = cArr[j - 1], cv = cArr[j], line;
        for (line = p10 + step5; line < p90; line += step5) {
          if (pv > line && cv <= line) cross++;
          if (pv < line && cv >= line) cross++;
        }
      }
    }
    var perY = cross / valid * 252;
    var sTr = perY >= 15 && perY <= 60 ? 100 : (perY < 15 ? Math.max(0, perY / 15 * 100) : Math.max(0, 100 - (perY - 60) / 40 * 100));
    var amtAvg = gridMean(aArr, lo, i) / 10000;
    var sLiq = Math.max(0, Math.min(100, amtAvg / 2 * 100));
    if (GRID_T0.test(code)) sLiq = Math.min(100, sLiq + 10);
    var score = 0.30 * osc + 0.25 * vP + 0.20 * cov + 0.15 * sTr + 0.10 * sLiq;
    out.score = score; out.parts = { osc: osc, vol: vP, cov: cov, trig: sTr, liq: sLiq, erM: erM, sEr: sEr, sAdx: sAdx, sMom: sMom, perY: perY };
    out.adx = adx; out.er = erM; out.mom20 = mom20; out.amtAvg = amtAvg;
    return out;
  }
  // ---------- 网格参数推荐：区间=[P10,P90]（替代极值）、格距=max(收盘涨跌幅σ, 日内波幅均值)、格数=区间宽÷格距（clamp 5~10）、每格=投入/格数/中间价、底仓=投入×(上限-当前价)/(上限-下限) ----------
  function gridParams(code, i, invest, costRt, volWin) {
    volWin = Math.max(20, volWin || 60);
    var D = gridData();
    var sArr = D.series[code];
    var cArr = sArr.close, hArr = sArr.high, lArr = sArr.low;
    var lo = Math.max(0, i - GRID_LOOK + 1);
    var p10 = gridQuantile(cArr, lo, i, 0.10), p90 = gridQuantile(cArr, lo, i, 0.90);
    var cur = cArr[i];
    if (isNaN(p10) || isNaN(p90) || !(p90 > p10) || isMiss(cur)) return null;
    var mid = (p10 + p90) / 2;
    var sig = gridStd(cArr, Math.max(1, i - (volWin - 1)), i);
    var ampSum = 0, ampN = 0, j;
    for (j = Math.max(0, i - (volWin - 1)); j <= i; j++) { if (!isMiss(hArr[j]) && !isMiss(lArr[j]) && !isMiss(cArr[j]) && cArr[j] > 0) { ampSum += (hArr[j] - lArr[j]) / cArr[j]; ampN++; } }
    var amp = ampN ? ampSum / ampN : sig;
    var stepRatio = Math.max(isNaN(sig) ? 0 : sig, isNaN(amp) ? 0 : amp);
    if (!(stepRatio > 0)) stepRatio = 0.02;
    var step = stepRatio * mid;
    var nLev = Math.max(5, Math.min(10, Math.round((p90 - p10) / step)));
    step = (p90 - p10) / nLev;
    var perLevelAmt = invest / nLev;
    // 投资总金额均分：每标的底仓资金 = 该标的投入额（总金额÷标的数，不再按当前价位置比例）
    var baseAmt = invest;
    var p = { code: code, lower: p10, upper: p90, mid: mid, step: step, nLevels: nLev, perLevelAmt: perLevelAmt, baseAmt: baseAmt, cur: cur, stepRatio: stepRatio, sig: sig, amp: amp };
    p.warns = [];
    var adx = gridADX(hArr, lArr, cArr, i, 14);
    if (adx > 25) p.warns.push("ADX=" + adx.toFixed(1) + ">25，趋势过强，网格可能长期单边套牢");
    if (costRt === undefined) costRt = 0.00075;
    var grRt = step / mid;
    if (grRt > 0) { var costShare = (costRt * 2) / grRt; if (costShare > 0.30) p.warns.push("成本占格收益约" + (costShare * 100).toFixed(0) + "%>30%，格距偏密"); }
    return p;
  }
  // ---------- 网格回测引擎 ----------
  // params: { codes, initial_capital, mgmt("A"长持|"B"体检), period_n, period_unit(日/周/月/季/年), commission_rate, slippage_rate, min_commission }
  function gridUnitDays(u) { return u === "日" ? 1 : u === "周" ? 5 : u === "月" ? 21 : u === "季" ? 63 : u === "年" ? 250 : 5; }
  function backtestGrid(Dd, params) {
    var codes = params.codes.slice();
    if (!codes.length) return null;
    var cal = Dd.calendar, n = cal.length;
    // 预热：需要 GRID_LOOK+60 日窗口计算评分/参数（默认起点=第310个交易日，约2017年中）
    var startIdx = params.start_idx !== undefined ? params.start_idx : GRID_LOOK + 60;
    var endIdx = params.end_idx !== undefined ? params.end_idx : n - 1;
    var invest = params.initial_capital || 1000000;
    // 均分分母 = 组合标的数（第一步 Top N）：每标的底仓资金 = 总金额 ÷ 组合标的数
    var topN = Math.max(1, +params.top_n || codes.length);
    var nInv = invest / topN;
    var comm = params.commission_rate || 0.00025, slip = params.slippage_rate || 0.0005;
    var minComm = params.min_commission || 0;
    var mgmt = params.mgmt || "B";
    var periodN = Math.max(1, params.period_n || 12), unitD = gridUnitDays(params.period_unit || "周");
    var periodDays = periodN * unitD;
    var volWin = Math.max(20, +params.vol_win || 60);
    var TOPN = topN;   // 组合规模恒定（Top N），体检退出后补位回到 N
    // 剩余资金兜底：实际参与标的数 K < 组合标的数时，剩余资金按选项买入兜底标的长期持有（空仓则现金零收益）
    var idleMapG = { cash: null, gold: "518880.SH", bond: "511010.SH", money: "511990.SH" };
    var idleCode = idleMapG[params.idle_buy] || null;
    if (idleCode && codes.indexOf(idleCode) >= 0) idleCode = null;   // 兜底标的已在参与池 → 剩余资金留现金，避免重复持仓
    var remain = Math.max(0, invest - codes.length * nInv);
    var idleShares = 0, idleArr = null;
    if (idleCode && Dd.series[idleCode]) idleArr = Dd.series[idleCode].close;
    var st = {};
    codes.forEach(function (c2) {
      var sArr = Dd.series[c2];
      var g = gridParams(c2, startIdx, nInv, comm + slip, volWin);
      if (g && params.gridOverrides && params.gridOverrides[c2]) {
        var ov = params.gridOverrides[c2];
        if (ov.lower !== undefined && ov.upper !== undefined && ov.upper > ov.lower) {
          g.lower = +ov.lower; g.upper = +ov.upper;
          if (ov.step !== undefined && +ov.step > 0) g.step = +ov.step;
          if (ov.nLevels !== undefined && +ov.nLevels >= 1) g.nLevels = Math.max(1, Math.round(+ov.nLevels));
          if (ov.perLevelAmt !== undefined && +ov.perLevelAmt > 0) g.perLevelAmt = +ov.perLevelAmt;
          if (ov.baseAmt !== undefined && +ov.baseAmt >= 0) g.baseAmt = +ov.baseAmt;
          g.step = (g.upper - g.lower) / g.nLevels;
        }
      }
      if (!g || !(g.upper > g.lower)) { st[c2] = { active: false, ca: sArr.close, oa: sArr.open, ha: sArr.high, la: sArr.low, pos: 0, cash: nInv }; return; }   // 无有效网格参数（未上市/无窗口）：资金保留现金
      var levels = [], li;
      var tb = (params.gridOverrides && params.gridOverrides[c2] && +params.gridOverrides[c2].triggerBase > 0) ? +params.gridOverrides[c2].triggerBase : (g.cur > 0 ? g.cur : (g.lower + g.upper) / 2);
      if (tb > 0 && g.nLevels > 1) {
        var nD = Math.floor((g.nLevels - 1) / 2);
        for (li = 0; li < g.nLevels; li++) levels.push(tb + (li - nD) * g.step);
      } else {
        for (li = 1; li <= g.nLevels - 1; li++) levels.push(g.lower + li * g.step);
      }
      st[c2] = { lower: g.lower, upper: g.upper, step: g.step, levels: levels, perLevelAmt: g.perLevelAmt,
        pos: 0, cash: 0, buyDay: -1, todayBuy: 0, sellOnly: false, active: true, baseShares: 0, _pending: [],
        ca: sArr.close, oa: sArr.open, ha: sArr.high, la: sArr.low, _exit: null };
    });
    var navArr = new Array(endIdx - startIdx);   // 估值日 = startIdx+1 … endIdx（建仓日在循环前）
    var trades = [], health = [];
    var freeCash = 0;   // 组合级自由现金池：撤换清仓释放的资金，补位时用于重建网格
    var initI = Math.min(startIdx + 1, endIdx);
    if (initI > startIdx) {
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active) return;
        var g0 = gridParams(c2, startIdx, nInv, comm + slip, volWin); if (!g0) return;
        var px = s.oa[initI];
        if (isMiss(px) || !(px > 0)) px = s.ca[initI];
        if (!(px > 0) || isNaN(px)) { s.pos = 0; s.baseShares = 0; s.cash = nInv; return; }   // 当日无行情（未上市/停牌）：资金保留现金，后续网格可用
        var sh = g0.baseAmt / px;
        if (!(sh > 0)) { s.pos = 0; s.baseShares = 0; s.cash = nInv; return; }   // 价格高于区间上限时底仓=0（不追高），持现金等网格下沿买入
        var costPct = (comm + slip) * sh * px;
        if (minComm > 0 && (comm * sh * px) > 0 && (comm * sh * px) < minComm) costPct = minComm + slip * sh * px;
        if (sh * px + costPct > nInv) sh = Math.max(0, (nInv - Math.min(costPct, nInv * 0.01)) / px);
        if (!(sh > 0)) { s.pos = 0; s.baseShares = 0; s.cash = nInv; return; }
        s.pos = sh; s.baseShares = sh; s.cash = Math.max(0, nInv - sh * px - costPct); s.buyDay = initI;
        trades.push({ d: cal[initI], code: c2, side: "BUY", level: px, px: px, sh: Math.round(sh * 100) / 100, amt: Math.round(sh * px * 100) / 100, tag: "底仓" });
      });
      if (remain > 0 && idleArr && idleCode) {
        var sIdle = Dd.series[idleCode];
        var pxI = sIdle.open[initI];
        if (isMiss(pxI) || !(pxI > 0)) pxI = idleArr[initI];
        if (pxI > 0 && !isNaN(pxI)) {
          var shIdle = remain / pxI;
          var costI = (comm + slip) * shIdle * pxI;
          if (minComm > 0 && comm * shIdle * pxI > 0 && comm * shIdle * pxI < minComm) costI = minComm + slip * shIdle * pxI;
          if (shIdle * pxI + costI > remain) shIdle = Math.max(0, (remain - Math.min(costI, remain * 0.01)) / pxI);
          if (shIdle > 0) {
            idleShares = shIdle;
            trades.push({ d: cal[initI], code: idleCode, side: "BUY", level: pxI, px: pxI, sh: Math.round(shIdle * 100) / 100, amt: Math.round(shIdle * pxI * 100) / 100, tag: "剩余资金兜底" });
          }
        }
      }
    }
    var lastADX = {};
    for (var ii = startIdx + 1; ii <= endIdx; ii++) {
      var i0 = ii - 1;
      codes.forEach(function (c2) { var s = st[c2]; if (s && s.active) s.todayBuy = 0; });
      // 1) 执行昨日触发单（今日开盘成交；T+1：今日买入份额当日不可卖）
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active) return;
        var pd = s._pending || []; s._pending = [];
        pd.forEach(function (ord) {
          var px = s.oa[ii];
          if (isMiss(px) || !(px > 0)) px = s.ca[ii];
          if (!(px > 0) || isNaN(px)) return;
          if (ord.side === "SELL") {
            var sellSh = Math.min(ord.sh, s.pos - s.todayBuy);
            if (sellSh > 0) {
              var c1 = comm * sellSh * px;
              if (minComm > 0 && c1 > 0 && c1 < minComm) c1 = minComm;
              var amt = sellSh * px * (1 - slip) - c1;
              s.pos -= sellSh; if (amt > 0) s.cash += amt;
              if (s.sellOnly && s.pos <= 0.0001) { s.active = false; s.sellOnly = false; freeCash += s.cash; s.cash = 0; }
              trades.push({ d: cal[ii], code: c2, side: "SELL", level: ord.level, px: px, sh: Math.round(sellSh * 100) / 100, amt: Math.round(sellSh * px * 100) / 100, tag: "网格" });
            }
          } else if (ord.side === "BUY") {
            var buySh = ord.sh;
            var need = buySh * px * (1 + slip + comm);
            if (minComm > 0 && comm * buySh * px > 0 && comm * buySh * px < minComm) need = buySh * px * (1 + slip) + minComm;
            if (need > s.cash) buySh = s.cash / (px * (1 + slip + comm));
            if (buySh > 0 && s.cash > 0) {
              var costB = buySh * px * (slip + comm);
              if (minComm > 0 && comm * buySh * px > 0 && comm * buySh * px < minComm) costB = buySh * px * slip + minComm;
              if (buySh * px + costB <= s.cash) {
                s.pos += buySh; s.cash -= buySh * px + costB; s.buyDay = ii; s.todayBuy += buySh;
                trades.push({ d: cal[ii], code: c2, side: "BUY", level: ord.level, px: px, sh: Math.round(buySh * 100) / 100, amt: Math.round(buySh * px * 100) / 100, tag: "网格" });
              }
            }
          }
        });
      });
      // 2) 今日触发判定（今日 high/low 穿越格位 vs 昨收；只出不进时停买入格）
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active) return;
        var hh = s.ha[ii], ll = s.la[ii], pc2 = s.ca[i0];
        if (isMiss(hh) || isMiss(ll) || isMiss(pc2) || isNaN(hh) || isNaN(ll) || isNaN(pc2)) return;
        s.levels.forEach(function (lv) {
          // 前收比较判定（无记忆状态）：下穿→买入（只出不进时停买），上穿→卖出；来回穿越可多次触发
          if (pc2 > lv && ll <= lv) {
            if (!s.sellOnly && s.cash > 0) s._pending.push({ side: "BUY", level: lv, sh: s.perLevelAmt / lv });
          } else if (pc2 < lv && hh >= lv) {
            var sellSh = s.pos / (s.levels.length + 1);
            s._pending.push({ side: "SELL", level: lv, sh: sellSh });
          }
        });
      });
      // 3) 体检式轮动：周期末用今日数据判定（无前视），合格保留+重锚定 / 不合格退出（区间内清仓撤换 / 套牢只出不进，绝不在低位强制割肉）
      var stepFromStart = ii - startIdx + 1;
      var isPeriodEnd = mgmt === "B" && periodDays > 0 && stepFromStart % periodDays === 0 && ii < endIdx;
      if (isPeriodEnd) {
        codes.forEach(function (c2) {
          var s = st[c2]; if (!s || !s.active || s.pos <= 0) return;
          var sc = gridScore(c2, ii);
          var vol2 = sc.vol, adx2 = sc.adx, er2 = sc.er, perY = sc.parts.perY;
          var ok = !sc.gate.length && sc.score >= 60 && vol2 >= 0.10 && vol2 <= 0.50 && er2 < 0.45 && perY >= 15;
          if (adx2 > 25 && lastADX[c2] > 25) ok = false;
          lastADX[c2] = adx2;
          if (ok && !params.no_reanchor) {   // 压力测试参数扰动：no_reanchor=true 时保持固定参数（聚焦参数敏感性，不被体检重锚定覆盖）
            var g2 = gridParams(c2, ii, s.pos * s.ca[ii] + s.cash, comm + slip, volWin), volWin;
            if (g2 && g2.upper > g2.lower) {
              var lv2 = [];
              for (var li2 = 1; li2 <= g2.nLevels - 1; li2++) lv2.push(g2.lower + li2 * g2.step);
              s.lower = g2.lower; s.upper = g2.upper; s.step = g2.step; s.levels = lv2; s.perLevelAmt = g2.perLevelAmt;
              s.sellOnly = false;
              health.push({ d: cal[ii], code: c2, action: "重锚定", reason: "体检合格·区间重算（评分" + sc.score.toFixed(0) + "）" });
            }
          } else {
            var price = s.ca[ii];
            var inRange = price >= s.lower && price <= s.upper;
            var reason = [];
            if (sc.gate.length) reason = reason.concat(sc.gate);
            if (sc.score < 60) reason.push("综合分" + sc.score.toFixed(0) + "<60");
            if (vol2 < 0.10 || vol2 > 0.50) reason.push("波动" + (vol2 * 100).toFixed(0) + "%");
            if (er2 >= 0.45) reason.push("ER" + er2.toFixed(2));
            if (perY < 15) reason.push("年触发" + perY.toFixed(0));
            if (adx2 > 25 && lastADX[c2] > 25) reason.push("ADX连续>25");
            if (inRange) {
              s._exit = "clear"; s.exitReason = reason.join("；");
              health.push({ d: cal[ii], code: c2, action: "撤换·清仓", reason: reason.join("；") });
            } else {
              s.sellOnly = true; s._exit = "sellonly"; s.exitReason = reason.join("；");
              health.push({ d: cal[ii], code: c2, action: "只出不进", reason: reason.join("；") });
            }
          }
        });
      }
      // 4) 撤换执行（昨日决策，今日开盘执行；仅 clear 清仓释放资金，sellonly 只出不进、绝不在低位强制割肉）
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active || !s._exit) return;
        if (s._exit === "clear") {
          var px = s.oa[ii];
          if (isMiss(px) || !(px > 0)) px = s.ca[ii];
          if (px > 0 && !isNaN(px) && s.pos > 0) {
            var c1 = comm * s.pos * px;
            if (minComm > 0 && c1 > 0 && c1 < minComm) c1 = minComm;
            var amt = s.pos * px * (1 - slip) - c1;
            if (amt > 0) { s.cash += amt; trades.push({ d: cal[ii], code: c2, side: "SELL", level: px, px: px, sh: Math.round(s.pos * 100) / 100, amt: Math.round(amt * 100) / 100, tag: "撤换清仓" }); }
            s.pos = 0;
          }
          if (s.pos <= 0) { s.active = false; s._exit = null; s.sellOnly = false; freeCash += s.cash; s.cash = 0; }
        } else {
          s._exit = null;   // sellonly：不清仓，保留 sellOnly 标志继续只出不进（卖格继续卖）
        }
      });
      // 5) 补位（体检决策后次日开盘建仓；参数/评分用决策日数据，无前视）
      if (isPeriodEnd) {
        // 补位数 = 组合规模 N - 当前持仓标的数（只补退出空位，组合恒为 Top N）
        var heldN = 0;
        codes.forEach(function (c2) { var s = st[c2]; if (s && s.active && s.pos > 0) heldN++; });
        var need = Math.max(0, TOPN - heldN);
        if (need > 0) {
          if (freeCash <= 0) { need = 0; }   // 无释放资金则不补位
          var scored = [], c3;
          for (c3 = 0; c3 < POOL.length; c3++) {
            var pc3 = POOL[c3].code;
            if (!/^[0-9]{6}\.(SH|SZ)$/.test(pc3)) continue;   // 只补真实 ETF，排除指数类（如 8841431.WI）
            if (codes.indexOf(pc3) >= 0 && st[pc3] && st[pc3].active && st[pc3].pos > 0) continue;
            if (st[pc3] && st[pc3].active && (st[pc3]._exit || st[pc3].sellOnly)) continue;   // 仅 active 标的尊重退出状态；inactive 可重新入选
            var sc3 = gridScore(pc3, ii);
            if (!sc3.gate.length && sc3.score >= 60) scored.push({ code: pc3, score: sc3.score });
          }
          scored.sort(function (a, b) { return b.score - a.score; });
          var addIdx = 0;
          while (need > 0 && addIdx < scored.length) {
            var alloc = Math.max(0, freeCash / need);   // 释放资金均分给空位
            var nc = scored[addIdx].code;
            if (!st[nc] || !st[nc].active) {   // 被撤换退出（inactive）的标的可重新入选重建网格
              var g3 = gridParams(nc, ii, nInv, comm + slip, volWin);
              if (g3 && g3.upper > g3.lower) {
                var lv3 = [];
                for (var li3 = 1; li3 <= g3.nLevels - 1; li3++) lv3.push(g3.lower + li3 * g3.step);
                st[nc] = { lower: g3.lower, upper: g3.upper, step: g3.step, levels: lv3, perLevelAmt: g3.perLevelAmt,
                  pos: 0, cash: 0, buyDay: -1, todayBuy: 0, sellOnly: false, active: true, baseShares: 0, _pending: [],
                  ca: Dd.series[nc].close, oa: Dd.series[nc].open, ha: Dd.series[nc].high, la: Dd.series[nc].low, _exit: null };
                codes.push(nc);
                var pxN = st[nc].oa[ii + 1];
                if (isMiss(pxN) || !(pxN > 0)) pxN = st[nc].ca[ii + 1];
                if (pxN > 0 && !isNaN(pxN)) {
                  var shN = g3.baseAmt / pxN;
                  if (!(shN > 0)) { st[nc].pos = 0; st[nc].cash = alloc; freeCash -= alloc; need--; addIdx++; continue; }   // 价格高于上限，底仓0→现金待网格
                  var costN = (comm + slip) * shN * pxN;
                  if (minComm > 0 && (comm * shN * pxN) > 0 && (comm * shN * pxN) < minComm) costN = minComm + slip * shN * pxN;
                  if (shN * pxN + costN > alloc) shN = Math.max(0, (alloc - Math.min(costN, alloc * 0.01)) / pxN);
                  st[nc].pos = shN; st[nc].baseShares = shN; st[nc].cash = Math.max(0, alloc - shN * pxN - costN); st[nc].buyDay = ii + 1; freeCash -= alloc;
                  trades.push({ d: cal[ii + 1], code: nc, side: "BUY", level: pxN, px: pxN, sh: Math.round(shN * 100) / 100, amt: Math.round(shN * pxN * 100) / 100, tag: "补位底仓" });
                } else { st[nc].pos = 0; st[nc].cash = alloc; freeCash -= alloc; }
                need--;
              }
            }
            addIdx++;
          }
        }
      }
      // 6) 组合估值（含自由现金池）
      var navV = freeCash;
      if (idleArr && idleShares > 0) {
        var pxId2 = idleArr[ii];
        if (!isMiss(pxId2) && !isNaN(pxId2)) navV += idleShares * pxId2;
      } else if (remain > 0) {
        navV += remain;   // 空仓兜底：剩余资金保持现金（零收益）计入净值
      }
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s) return;
        var px2 = s.ca[ii];
        if (s.active) { if (!isMiss(px2) && !isNaN(px2)) navV += s.pos * px2; }
        navV += s.cash;
      });
      navArr[ii - startIdx - 1] = navV;
    }
    var finalNav = navArr[navArr.length - 1];
    if (!(finalNav > 0)) finalNav = invest;
    var total = finalNav / invest - 1;
    var years = (endIdx - startIdx) / 252;
    var cagr = years > 0 ? Math.pow(finalNav / invest, 1 / years) - 1 : 0;
    var peak = invest, maxDD = 0, curDD = 0;
    var drawdown = new Array(navArr.length);
    var qq;
    for (qq = 0; qq < navArr.length; qq++) {
      var vv = navArr[qq] || invest;
      if (vv > peak) peak = vv;
      curDD = vv / peak - 1;
      drawdown[qq] = curDD;
      if (curDD < maxDD) maxDD = curDD;
    }
    var rets = [], sharpe = 0, win = 0, tot = 0, rr;
    for (rr = 1; rr < navArr.length; rr++) {
      if (!(navArr[rr] > 0) || !(navArr[rr - 1] > 0)) continue;
      var rv = navArr[rr] / navArr[rr - 1] - 1;
      rets.push(rv); if (rv > 0) win++; tot++;
    }
    var volA = 0;
    if (rets.length > 1) {
      var mu = 0, vi = 0;
      for (rr = 0; rr < rets.length; rr++) mu += rets[rr];
      mu /= rets.length;
      for (rr = 0; rr < rets.length; rr++) vi += (rets[rr] - mu) * (rets[rr] - mu);
      var sd = Math.sqrt(vi / (rets.length - 1));
      if (sd > 0) sharpe = mu / sd * Math.sqrt(252);
      volA = sd * Math.sqrt(252);
    }
    return {
      metrics: { total_return: total, cagr: cagr, max_dd: maxDD, sharpe: sharpe, win_rate: tot ? win / tot : 0, vol: volA, n_trades: trades.length },
      nav: navArr, drawdown: drawdown, trades: trades, health: health, codes: codes,
      dates: cal.slice(startIdx + 1, endIdx + 1)   // 与 nav 对齐（估值从建仓日次日/startIdx+1 起）
    };
  }

    // ==================== 网格压力测试：历史极端段回放 + 破网情景模拟 + 参数扰动（风险评估用途，非真实收益） ====================
  // 预设极端段（日历对齐：2016-06-01 ~ 2026-10-09，2513 日；2015 段在数据覆盖之外）
  var STRESS_SEGS = [
    { label: "2015 股灾", start: "2015-06-15", end: "2016-01-28" },
    { label: "2018 熊市", start: "2018-01-24", end: "2019-01-03" },
    { label: "2020 疫情", start: "2020-02-03", end: "2020-03-23" },
    { label: "2022 熊市", start: "2022-01-04", end: "2022-04-27" },
    { label: "2024 小微盘流动性危机", start: "2024-01-02", end: "2024-02-05" },
    { label: "2025 关税急跌", start: "2025-04-07", end: "2025-04-18" }
  ];
  // 段内破网次数：标的后复权 close 跌破段首网格区间下限的独立事件数
  function gridBrokeCount(Dd, codes, sIdx, eIdx, lowerOf) {
    var cnt = 0;
    for (var ci = 0; ci < codes.length; ci++) {
      var code = codes[ci];
      var sArr = Dd.series[code]; if (!sArr) continue;
      var cl = sArr.close;
      var lower = lowerOf ? lowerOf(code) : null;
      if (!lower) continue;
      var inBreak = false;
      for (var i = sIdx; i <= eIdx; i++) {
        var px = cl[i];
        if (isMiss(px)) continue;
        if (px < lower) { if (!inBreak) { inBreak = true; cnt++; } }
        else inBreak = false;
      }
    }
    return cnt;
  }
  // 历史极端段回放：每段用网格引擎子段回测（段前预热窗口建仓），输出段收益/最大浮亏/补仓次数/破网次数/交易日数
  function gridStressSegs(Dd, params, segs) {
    var cal = Dd.calendar;
    var out = [];
    var costRt = (params.commission_rate || 0.00025) + (params.slippage_rate || 0.0005);
    var volWin = Math.max(20, +params.vol_win || 60);
    for (var si = 0; si < segs.length; si++) {
      var seg = segs[si];
      var sIdx = cal.indexOf(seg.start), eIdx = cal.indexOf(seg.end);
      if (sIdx < 0 || eIdx < 0) { out.push({ label: seg.label, status: "日历未覆盖", start: seg.start, end: seg.end }); continue; }
      var startIdx = Math.max(GRID_LOOK + 60, sIdx - (GRID_LOOK + 60));
      var r = backtestGrid(Dd, Object.assign({}, params, { start_idx: startIdx, end_idx: eIdx }));
      if (!r || !r.nav || r.nav.length < 2) { out.push({ label: seg.label, status: "无数据" }); continue; }
      var s0 = Math.max(0, sIdx - startIdx - 1), s1 = eIdx - startIdx - 1;
      if (s1 >= r.nav.length) s1 = r.nav.length - 1;
      var v0 = r.nav[s0], v1 = r.nav[s1];
      var tot = v0 > 0 ? v1 / v0 - 1 : 0;
      var pk = v0, mdd = 0, i2;
      for (i2 = s0; i2 <= s1; i2++) { if (r.nav[i2] > pk) pk = r.nav[i2]; var dd = 1 - r.nav[i2] / pk; if (dd > mdd) mdd = dd; }
      var buys = 0;
      for (var t = 0; t < r.trades.length; t++) {
        var tr = r.trades[t];
        if (tr.side === "BUY" && tr.d >= seg.start && tr.d <= seg.end) buys++;
      }
      var nInvSeg = (params.initial_capital || 1e6) / Math.max(1, +params.top_n || params.codes.length);
      var broke = gridBrokeCount(Dd, params.codes, sIdx, eIdx, function (c) {
        var g = gridParams(c, sIdx, nInvSeg, costRt, volWin);
        return g && g.lower > 0 ? g.lower : null;
      });
      out.push({
        label: seg.label, start: cal[sIdx], end: cal[eIdx],
        n_days: eIdx - sIdx + 1,
        total_return: Math.round(tot * 1e6) / 1e6,
        max_dd: Math.round(mdd * 1e6) / 1e6,
        buy_trades: buys, broke: broke
      });
    }
    return out;
  }
  // 全历史最大回撤段自动检测：全周期回测 → nav 峰值/谷值日期
  function gridMaxDDSeg(Dd, params) {
    var r = backtestGrid(Dd, params);
    if (!r || !r.nav || r.nav.length < 2) return null;
    var nav = r.nav, pk = nav[0], pkI = 0, mdd = 0, i0 = 0, i1 = 0, i;
    for (i = 1; i < nav.length; i++) {
      if (nav[i] > pk) { pk = nav[i]; pkI = i; }
      var dd = 1 - nav[i] / pk;
      if (dd > mdd) { mdd = dd; i0 = pkI; i1 = i; }
    }
    if (mdd <= 0) return null;
    return { label: "全历史最大回撤（自动检测）", start: r.dates[i0], end: r.dates[i1], maxDD: mdd };
  }
  // 破网情景模拟：从当前价沿格距逐格单边下跌，每穿越一格买入一格，直至跌破 区间下限×(1-X%)；输出累计买入/期末市值/最大浮亏/买入格数/剩余资金（纯情景，无前视）
  function gridBreachSim(Dd, params, depthPct) {
    var cal = Dd.calendar, iLast = cal.length - 1;
    var codes = params.codes.slice();
    var invest = params.initial_capital || 1e6;
    var topN = Math.max(1, +params.top_n || codes.length);
    var nInv = invest / topN;
    var costRt = (params.commission_rate || 0.00025) + (params.slippage_rate || 0.0005);
    var volWin = Math.max(20, +params.vol_win || 60);
    var depth = Math.max(5, Math.min(50, +depthPct || 20)) / 100;
    var rows = [], totalBuy = 0, hasRows = false;
    for (var ci = 0; ci < codes.length; ci++) {
      var code = codes[ci];
      var sArr = Dd.series[code]; if (!sArr) continue;
      var cur = sArr.close[iLast];
      if (isMiss(cur)) continue;
      var g = gridParams(code, iLast, nInv, costRt, volWin);
      if (!g || !(g.upper > g.lower)) { rows.push({ code: code, status: "无有效网格参数（未上市/无窗口）" }); continue; }
      hasRows = true;
      var lower = g.lower, step = g.step, per = g.perLevelAmt, base = g.baseAmt;
      var breakPx = lower * (1 - depth);
      var buyK = 0;
      for (var k = 1; ; k++) { if (cur - k * step <= breakPx + 1e-9) break; buyK++; }
      var cumBuy = base + buyK * per;
      var val = base * (breakPx / cur);
      for (var j = 1; j <= buyK; j++) val += per * (breakPx / (cur - j * step));
      var loss = cumBuy - val;
      rows.push({
        code: code, cur: Math.round(cur * 1e4) / 1e4, lower: Math.round(lower * 1e4) / 1e4,
        breakPx: Math.round(breakPx * 1e4) / 1e4, step: Math.round(step * 1e4) / 1e4,
        nLevels: g.nLevels, baseAmt: Math.round(base), perLevelAmt: Math.round(per),
        buyLevels: buyK, cumBuy: Math.round(cumBuy), val: Math.round(val),
        loss: Math.round(loss), lossPct: cumBuy > 0 ? Math.round(loss / cumBuy * 1e4) / 1e4 : 0,
        remain: Math.max(0, Math.round(nInv - cumBuy))
      });
      totalBuy += cumBuy;
    }
    return { depthPct: depth * 100, invest: invest, rows: rows, totalBuy: Math.round(totalBuy), totalRemain: Math.round(invest - totalBuy), hasRows: hasRows };
  }
  // 参数扰动：对当前推荐参数做 格距±30% / 格数±2(clamp 5~10) / 区间±10% 六组扰动 × 基准，跑全周期网格回测对比
  function gridStressPerturb(Dd, params) {
    var iLast = Dd.calendar.length - 1;
    var codes = params.codes.slice();
    var invest = params.initial_capital || 1e6;
    var topN = Math.max(1, +params.top_n || codes.length);
    var nInv = invest / topN;
    var costRt = (params.commission_rate || 0.00025) + (params.slippage_rate || 0.0005);
    var volWin = Math.max(20, +params.vol_win || 60);
    var variants = [
      { key: "base", label: "基准（推荐）", f: function (g) { return g; } },
      { key: "step07", label: "格距 ×0.7（格数×1.43）", f: function (g) { g.nLevels = Math.min(10, Math.max(5, Math.round(g.nLevels / 0.7))); g.perLevelAmt = g.baseAmt / g.nLevels; return g; } },
      { key: "step13", label: "格距 ×1.3（格数×0.77）", f: function (g) { g.nLevels = Math.min(10, Math.max(5, Math.round(g.nLevels / 1.3))); g.perLevelAmt = g.baseAmt / g.nLevels; return g; } },
      { key: "lv+2", label: "格数 +2", f: function (g) { g.nLevels = Math.min(10, Math.round(g.nLevels) + 2); g.perLevelAmt = g.baseAmt / g.nLevels; return g; } },
      { key: "lv-2", label: "格数 -2", f: function (g) { g.nLevels = Math.max(5, Math.round(g.nLevels) - 2); g.perLevelAmt = g.baseAmt / g.nLevels; return g; } },
      { key: "rng09", label: "区间 ×0.9", f: function (g) { g.lower *= 0.9; g.upper *= 0.9; return g; } },
      { key: "rng11", label: "区间 ×1.1", f: function (g) { g.lower *= 1.1; g.upper *= 1.1; return g; } }
    ];
    var out = [];
    for (var vi = 0; vi < variants.length; vi++) {
      var v = variants[vi];
      var overrides = {};
      var okAll = true;
      for (var ci = 0; ci < codes.length; ci++) {
        var g = gridParams(codes[ci], iLast, nInv, costRt, volWin);
        if (!g || !(g.upper > g.lower)) { okAll = false; continue; }
        var g2 = v.f({ lower: g.lower, upper: g.upper, step: g.step, nLevels: g.nLevels, perLevelAmt: g.perLevelAmt, baseAmt: g.baseAmt, triggerBase: g.cur });
        overrides[codes[ci]] = g2;
      }
      if (!okAll && vi === 0) { out.push({ label: v.label, key: v.key, status: "部分标的无有效参数" }); continue; }
      var r = backtestGrid(Dd, Object.assign({}, params, { gridOverrides: overrides, no_reanchor: true }));   // 扰动对比固定参数
      var sIdx = GRID_LOOK + 60, eIdx = Dd.calendar.length - 1;
      var broke = gridBrokeCount(Dd, codes, sIdx, eIdx, function (c) {
        var o = overrides[c];
        return o && o.lower > 0 ? o.lower : null;
      });
      out.push({
        label: v.label, key: v.key,
        cagr: r ? r.metrics.cagr : null, max_dd: r ? r.metrics.max_dd : null,
        n_trades: r ? r.metrics.n_trades : null, broke: broke
      });
    }
    return out;
  }
// ---------- 主回测 ----------
  // D: 导出数据对象；params: 参数对象（见 README / UI）
  function backtest(D, params) {
    // ---- 策略配置对象化：兼容 mode 字符串（老调用）与 strategy 配置对象（新 UI），行为等价 ----
    var ST = (params.strategy && typeof params.strategy === "object") ? params.strategy : { mode: params.mode || "rotation" };
    var isReb = ST.mode === "rebalance";
    // 稳健标准化辅助：与 numpy.percentile(linear)/median 同构（供截面 z-score 使用）
    function pctNp(sArr, p) {
      var n = sArr.length;
      if (!n) return 0;
      if (n === 1) return sArr[0];
      var rk = (p / 100) * (n - 1);
      var lo = Math.floor(rk), hi = Math.ceil(rk);
      if (lo === hi) return sArr[lo];
      var fr = rk - lo;
      return sArr[lo] * (1 - fr) + sArr[hi] * fr;
    }
    function medNp(sArr) {
      var n = sArr.length;
      if (!n) return 0;
      if (n % 2 === 1) return sArr[(n - 1) / 2];
      return (sArr[n / 2 - 1] + sArr[n / 2]) / 2;
    }
    var codes = params.codes;                    // 选中标的（顺序数组）
    // 空仓时持有标的（fallback）：非现金目标标的纳入数据/权重空间（不入候选池，仅作兜底持仓——即使未勾选也能持有）
    var idleMap0 = { cash: null, gold: "518880.SH", bond: "511010.SH", money: "511990.SH" };
    var idleC = idleMap0[params.fallback_when_no_signal] || null;
    if (!isReb && idleC && codes.indexOf(idleC) < 0) codes = codes.concat([idleC]);
    var scoreFloor = +(params.score_floor) || 0;
    var ann = params.annualize_factor || 252;
    var costPerSide = params.commission_rate + params.slippage_rate;
    var tiered = !!params.tiered_slippage;      // 按标的流动性分档滑点（近20日均成交额，万元）
    var baseSlip = params.slippage_rate;
    function slippageFor(code, i) {
    var D = (typeof gridData === "function" && gridData()) || null;
      if (!tiered) return baseSlip;
      if (!D) return baseSlip;   // 数据未就绪：按基础滑点降级，不抛错
      var aArr = D.series[code] ? D.series[code].amount : null;
      if (!aArr) return baseSlip;
      var s = 0, cnt = 0, kk;
      for (kk = Math.max(0, i - 19); kk <= i; kk++) {
        if (!isMiss(aArr[kk]) && aArr[kk] > 0) { s += aArr[kk]; cnt++; }
      }
      if (cnt < 5) return baseSlip;
      var adv = s / cnt;                        // 万元
      if (adv >= 100000) return 0.0003;
      if (adv >= 10000) return 0.0005;
      if (adv >= 5000) return 0.0008;
      if (adv >= 1000) return 0.0015;
      return 0.0030;
    }
    // 持有标的相对权重：equal=等权 / inv_vol=逆波动率(1/σ) / risk_parity=近60日协方差等风险贡献迭代（与 Python 同构）
    function holdingWeights(mode, codes, i) {
      var n = codes.length;
      if (!n) return {};
      if (mode !== "inv_vol" && mode !== "risk_parity") {
        var e0 = {}, jj0;
        for (jj0 = 0; jj0 < n; jj0++) e0[codes[jj0]] = 1 / n;
        return e0;
      }
      var vol = {}, c2, seg, kk2, rr, sdv, m2;
      var vj;
      for (vj = 0; vj < n; vj++) {
        c2 = codes[vj];
        seg = [];
        for (kk2 = Math.max(0, i - 20); kk2 <= i; kk2++) if (!isMiss(closes[c2][kk2])) seg.push(closes[c2][kk2]);
        if (seg.length < 5) { vol[c2] = null; continue; }
        rr = [];
        for (kk2 = 1; kk2 < seg.length; kk2++) rr.push(seg[kk2] / seg[kk2 - 1] - 1);
        m2 = 0;
        for (kk2 = 0; kk2 < rr.length; kk2++) m2 += rr[kk2];
        m2 /= rr.length;
        sdv = 0;
        for (kk2 = 0; kk2 < rr.length; kk2++) sdv += (rr[kk2] - m2) * (rr[kk2] - m2);
        vol[c2] = Math.sqrt(sdv / rr.length);
      }
      var okc = [];
      for (vj = 0; vj < n; vj++) if (vol[codes[vj]] !== null && vol[codes[vj]] > 1e-12) okc.push(codes[vj]);
      if (!okc.length) {
        var e2 = {}, jj2;
        for (jj2 = 0; jj2 < n; jj2++) e2[codes[jj2]] = 1 / n;
        return e2;
      }
      function totRel(rel) { var s = 0, kk; for (kk in rel) s += rel[kk]; return s; }
      function invVolRel() {
        var inv = {}, tot = 0, vj2;
        for (vj2 = 0; vj2 < okc.length; vj2++) { inv[okc[vj2]] = 1 / vol[okc[vj2]]; tot += inv[okc[vj2]]; }
        var rel = {}, vj3;
        for (vj3 = 0; vj3 < okc.length; vj3++) rel[okc[vj3]] = inv[okc[vj3]] / tot;
        if (okc.length < n) {
          var rem = 1 - totRel(rel), miss = [];
          for (vj3 = 0; vj3 < n; vj3++) if (okc.indexOf(codes[vj3]) < 0) miss.push(codes[vj3]);
          for (vj3 = 0; vj3 < miss.length; vj3++) rel[miss[vj3]] = rem / miss.length;
        }
        return rel;
      }
      if (mode === "inv_vol") return invVolRel();
      var T = 60, rets = [];
      for (vj = 0; vj < okc.length; vj++) {
        c2 = okc[vj];
        seg = [];
        for (kk2 = Math.max(0, i - T); kk2 <= i; kk2++) if (!isMiss(closes[c2][kk2])) seg.push(closes[c2][kk2]);
        rr = [];
        for (kk2 = 1; kk2 < seg.length; kk2++) rr.push(seg[kk2] / seg[kk2 - 1] - 1);
        rets.push(rr.slice(-Math.min(T, rr.length)));
      }
      var L = 1e9;
      for (vj = 0; vj < rets.length; vj++) L = Math.min(L, rets[vj].length);
      if (L < 30) return invVolRel();
      var m2c = [], vj4;
      for (vj4 = 0; vj4 < okc.length; vj4++) {
        var mm = 0;
        for (kk2 = 0; kk2 < L; kk2++) mm += rets[vj4][rets[vj4].length - L + kk2];
        m2c.push(mm / L);
      }
      var cov = [];
      for (vj4 = 0; vj4 < okc.length; vj4++) {
        cov.push([]);
        for (var vj5 = 0; vj5 < okc.length; vj5++) {
          var s2 = 0;
          for (kk2 = 0; kk2 < L; kk2++) {
            var ra = rets[vj4][rets[vj4].length - L + kk2] - m2c[vj4];
            var rb = rets[vj5][rets[vj5].length - L + kk2] - m2c[vj5];
            s2 += ra * rb;
          }
          cov[vj4].push(s2 / L + (vj4 === vj5 ? 1e-8 : 0));
        }
      }
      var w = [], vj6;
      for (vj6 = 0; vj6 < okc.length; vj6++) w.push(1 / okc.length);
      for (var it = 0; it < 100; it++) {
        var cv = [];
        for (vj6 = 0; vj6 < okc.length; vj6++) {
          var c3 = 0;
          for (var vj7 = 0; vj7 < okc.length; vj7++) c3 += cov[vj6][vj7] * w[vj7];
          cv.push(c3);
        }
        var pv = 0;
        for (vj6 = 0; vj6 < okc.length; vj6++) pv += w[vj6] * cv[vj6];
        if (pv <= 0) break;
        var rc = [];
        for (vj6 = 0; vj6 < okc.length; vj6++) rc.push(w[vj6] * cv[vj6] / Math.sqrt(pv));
        var avg = 0;
        for (vj6 = 0; vj6 < rc.length; vj6++) avg += rc[vj6];
        avg /= rc.length;
        if (avg <= 0) break;
        var wNew3 = [];
        for (vj6 = 0; vj6 < okc.length; vj6++) wNew3.push(w[vj6] * Math.sqrt(avg / Math.max(rc[vj6], 1e-12)));
        var ws = 0;
        for (vj6 = 0; vj6 < wNew3.length; vj6++) ws += wNew3[vj6];
        for (vj6 = 0; vj6 < wNew3.length; vj6++) w[vj6] = wNew3[vj6] / ws;
      }
      var rel2 = {};
      for (vj6 = 0; vj6 < okc.length; vj6++) rel2[okc[vj6]] = w[vj6];
      if (okc.length < n) {
        var rem2 = 1 - totRel(rel2), miss2 = [];
        for (vj6 = 0; vj6 < n; vj6++) if (okc.indexOf(codes[vj6]) < 0) miss2.push(codes[vj6]);
        for (vj6 = 0; vj6 < miss2.length; vj6++) rel2[miss2[vj6]] = rem2 / miss2.length;
      }
      return rel2;
    }
    var riskFree = params.risk_free_rate;
    var rfDaily = Math.pow(1 + riskFree, 1 / ann) - 1;
    var nAssets = codes.length;
    var overseasSet = {};
    (params.overseas_codes || []).forEach(function (c) { overseasSet[c] = 1; });

    var cal = D.calendar, n = cal.length;
    // 回测起点（日历已在导出时截断到 end_date）
    var startPos = 0;
    while (startPos < n && cal[startPos] < params.start_date) startPos++;
    var warmup = 40;
    // P2-10：预热按 needOf(f) 校验（ma_vs_ma_lag 需 max(w1, w2+w3)），避免前期用不完整窗口
    (params.factors || []).forEach(function (f) { warmup = Math.max(warmup, needOf(f) || 20); });
    var endPos = n - 1;
    if (params.end_date) { while (endPos >= 0 && cal[endPos] > params.end_date) endPos--; }
    if (startPos + warmup + 5 > endPos + 1) throw new Error("回测区间过短，无法完成动量预热");
    if (endPos < startPos) throw new Error("结束日期早于起始日期");

    // 序列
    var closes = {}, opens = {}, highs = {}, lows = {}, vols = {}, amts = {}, turnovers = {}, idxClose = {}, codeSet = {};
    var rawOpens = {}, rawCloses = {}, navs = {};
    codes.forEach(function (c) {
      closes[c] = D.series[c].close; opens[c] = D.series[c].open; codeSet[c] = 1;
      highs[c] = D.series[c].high || null; lows[c] = D.series[c].low || null;
      vols[c] = D.series[c].volume || null; amts[c] = D.series[c].amount || null;
      turnovers[c] = D.series[c].turnover || null;
      rawOpens[c] = D.series[c].raw_open || null; rawCloses[c] = D.series[c].raw_close || null;
      navs[c] = D.series[c].nav || null;
    });
    // 各标的首个有效交易日（幸存者偏差「真实可得池」用；close>0 的首日，上市前 -1 占位不计）
    var firstValid = {};
    codes.forEach(function (c) {
      var cv = closes[c], fvi = -1, vi2;
      for (vi2 = 0; vi2 < cv.length; vi2++) { if (cv[vi2] > 0) { fvi = vi2; break; } }
      firstValid[c] = fvi;
    });
    D.regime.forEach(function (ic) { idxClose[ic] = D.index[ic]; });

    // 指数序列统一取数：主块 D.index 优先，其次内嵌指数块 wufuIdxGz（RDIDX.index，异步加载后可用）——择时/基准/风格切换均支持全部 94 条内嵌指数
    function idxArr(code) {
    var D = gridData();
      if (!D) return null;
      var a = D.index[code];
      if (!a && RDIDX && RDIDX.index && RDIDX.index[code]) a = RDIDX.index[code];
      if (!a && typeof window !== "undefined" && window.RDIDX && window.RDIDX.index && window.RDIDX.index[code]) a = window.RDIDX.index[code];
      return a;
    }

    // 基准（默认 D.benchmark=H00300.CSI，可经 params.benchmark 换成任一内嵌指数；RDIDX 异步加载后任一内嵌指数均可用）
    var benchClose = idxArr(params.benchmark || D.benchmark);
    if (!benchClose) {
      benchClose = idxArr(D.benchmark);
      var ntEl = typeof document !== "undefined" ? document.getElementById("notice") : null;
      if (ntEl) ntEl.textContent = "所选基准指数「" + (params.benchmark || D.benchmark) + "」无可用行情，已回退默认基准（沪深300全收益）";
    }
    // P2-9：基准序列 -1/缺失日不参与计算——缺失日沿用前一值、日收益记 0，避免首日缺失污染整段基准
    var benchBase = 0;
    while (benchBase < n && (isMiss(benchClose[benchBase]) || benchClose[benchBase] <= 0)) benchBase++;
    var benchNav = new Array(n), benchDaily = new Array(n);
    if (benchBase >= n) {
      for (var bi = 0; bi < n; bi++) { benchNav[bi] = 1; benchDaily[bi] = 0; }
    } else {
      for (var i = 0; i < n; i++) {
        if (isMiss(benchClose[i]) || benchClose[i] <= 0) { benchNav[i] = i > 0 ? benchNav[i - 1] : 1; benchDaily[i] = 0; }
        else { benchNav[i] = benchClose[i] / benchClose[benchBase]; benchDaily[i] = i > 0 ? benchNav[i] / benchNav[i - 1] - 1 : 0; }
      }
    }

    // 等权池（选中标的）
    var ewDaily = new Array(n); ewDaily[0] = 0;
    for (i = 1; i < n; i++) {
      var rs = [], c1, c0, k, code;
      for (k = 0; k < nAssets; k++) {
        code = codes[k];
        c1 = closes[code][i]; c0 = closes[code][i - 1];
        if (!isMiss(c1) && !isMiss(c0) && c0 > 0) rs.push(c1 / c0 - 1);
      }
      ewDaily[i] = rs.length ? rs.reduce(function (a, b) { return a + b; }) / rs.length : 0;
    }
    var ewNav = new Array(n); ewNav[0] = 1;
    for (i = 1; i < n; i++) ewNav[i] = ewNav[i - 1] * (1 + ewDaily[i]);

    // 决策日：daily=每N个交易日 | weekly=每N周(周一或周五) | monthly=每N个月(月初或月末交易日) | quarterly=每N季度(季初或季末交易日) | yearly=每N年(年初或年末交易日) | days=每N个交易日(旧兼容)
    var decisionIdx = {};
    var rmode = params.rebalance_mode || "monthly";
    var rint = Math.max(1, params.rebalance_interval || 1);
    var anchor = params.rebalance_anchor || (rmode === "weekly" ? "mon" : "first");
    function weekId(ds) {
      var pp = ds.split("-"), dt = new Date(+pp[0], +pp[1] - 1, +pp[2]);
      var dow = dt.getDay(), diff = (dow === 0 ? -6 : 1 - dow);
      var m = new Date(dt.getTime() + diff * 86400000);
      return m.getFullYear() + "-" + (m.getMonth() < 9 ? "0" : "") + (m.getMonth() + 1) + "-" + (m.getDate() < 10 ? "0" : "") + m.getDate();
    }
    function periodKey(ds) {
      if (rmode === "monthly") return ds.slice(0, 7);
      if (rmode === "quarterly") {
        var ym = ds.slice(0, 7);
        return ym.slice(0, 4) + "-Q" + (Math.floor((+ym.slice(5, 7) - 1) / 3) + 1);
      }
      return ds.slice(0, 4);  // yearly
    }
    var w0 = null, wSeq = -1, mm0 = null, mSeq2 = -1;
    for (i = startPos; i <= endPos; i++) {
      var hit = false;
      if (rmode === "daily") hit = ((i - startPos) % rint) === 0;
      else if (rmode === "weekly") {
        var w = weekId(cal[i]);
        if (w !== w0) { w0 = w; wSeq++; }
        if (wSeq % rint === 0) {
          var isF = (i === startPos || weekId(cal[i - 1]) !== w);
          var isL = (i + 1 > endPos || weekId(cal[i + 1]) !== w);
          if ((anchor === "fri" && isL) || (anchor !== "fri" && isF)) hit = true;
        }
      } else if (rmode === "monthly" || rmode === "quarterly" || rmode === "yearly") {
        var mm = periodKey(cal[i]);
        if (mm !== mm0) { mm0 = mm; mSeq2++; }
        if (mSeq2 % rint === 0) {
          var isF2 = (i === startPos || periodKey(cal[i - 1]) !== mm);
          var isL2 = (i + 1 > endPos || periodKey(cal[i + 1]) !== mm);
          if ((anchor === "last" && isL2) || (anchor !== "last" && isF2)) hit = true;
        }
      } else hit = ((i - startPos) % (params.rebalance_days || 20)) === 0;
      if (hit) decisionIdx[i] = 1;
    }

    var wOld = new Array(nAssets).fill(0);
    var pending = null;               // [wNew(array), costPct]
    var lastSell = {};                // 卖出冷却：code -> 最近卖出决策日索引
    var posMeta = {};                 // 持仓状态：code -> {buy_i, buy_px, hi}（卖出/不卖条件用）
    var nav = 1, cumCost = 0, regime = "normal", mmWeakRun = 0, mmNormalRun = 0;
    var navSeries = new Array(n), ddSeries = new Array(n), expSeries = new Array(n);
    var holdSeries = new Array(n), regSeries = new Array(n), dailyRet = new Array(n);
    var tradeRecords = [];
    var peak = 1;

    // 通用多因子：factors 列表（{kind, window[, window2, window3], weight[, direction]}），逐因子截面 z-score（总体标准差）加权
    // kind: roc=N日涨幅 | slope_r2=OLS年化斜率×R² | wslope_r2=加权回归年化斜率×R² | vol=N日年化收益波动率（默认方向-1）
    //       | risk_adj=N日涨幅/年化波动率 | amount=N日平均成交额(万元) | volume=N日平均成交量(万手)
    //       | rsrs=N日RSRS（最高价对最低价OLS斜率）| c_vs_ma=收盘价相对近N日均线涨幅
    //       | c_vs_ma_lag=收盘价相对N日前M日均线涨幅（window=N平移, window2=M）| ma_vs_ma=近N均线相对近M均线涨幅
    //       | ma_vs_ma_lag=近N均线相对M日前O均线涨幅（window=N, window2=M平移, window3=O）
    function maAt(arr, i, w) {
      if (i + 1 < w) return NaN;
      var s = 0, j;
      for (j = i - w + 1; j <= i; j++) { if (isMiss(arr[j])) return NaN; s += arr[j]; }
      return s / w;
    }
    function olsSlope(xs, ys) {
      var n = xs.length, mx = 0, my = 0, tt;
      for (tt = 0; tt < n; tt++) { mx += xs[tt]; my += ys[tt]; }
      mx /= n; my /= n;
      var sxy = 0, sxx = 0;
      for (tt = 0; tt < n; tt++) { sxy += (xs[tt] - mx) * (ys[tt] - my); sxx += (xs[tt] - mx) * (xs[tt] - mx); }
      return sxx < 1e-12 ? 0 : sxy / sxx;
    }
    function sumAt(arr, i, w) {
      if (i + 1 < w) return NaN;
      var s = 0, j;
      for (j = i - w + 1; j <= i; j++) { if (isMiss(arr[j])) return NaN; s += arr[j]; }
      return s;
    }
    function factorValue(kind, code, i, f, annf) {
      var w1 = f.window || 20, w2 = f.window2 || 0, w3 = f.window3 || 0;
      var cArr = closes[code];
      if (kind === "custom") {
        var parts = f.formula_parts || [];
        if (parts.length < 2) return NaN;
        var vals = [], i2;
        for (i2 = 0; i2 < parts.length; i2++) {
          var pp = parts[i2];
          var pv = factorValue(pp.kind, code, i, { window: pp.window, window2: pp.window2, window3: pp.window3 }, annf);
          if (isNaN(pv)) return NaN;
          vals.push((pp.coef || 0) * pv);
        }
        // 标准四则运算：先乘除（从左到右），后加减
        var stack = [vals[0]];
        for (i2 = 1; i2 < vals.length; i2++) {
          var op2 = parts[i2].op || "+";
          var vi = vals[i2];
          if (op2 === "×" || op2 === "*" || op2 === "x") stack[stack.length - 1] = stack[stack.length - 1] * vi;
          else if (op2 === "÷" || op2 === "/") {
            if (vi === 0) return NaN;
            stack[stack.length - 1] = stack[stack.length - 1] / vi;
          } else if (op2 === "-" || op2 === "−") stack.push(-vi);
          else stack.push(vi);
        }
        var tot2 = 0;
        for (i2 = 0; i2 < stack.length; i2++) tot2 += stack[i2];
        return tot2;
      }
      if (kind === "roc") {
        if (i + 1 < w1) return NaN;
        var seg = cArr.slice(i - w1 + 1, i + 1);
        for (var q = 0; q < seg.length; q++) if (isMiss(seg[q])) return NaN;
        return seg[seg.length - 1] / seg[0] - 1;
      }
      if (kind === "slope_r2" || kind === "wslope_r2" || kind === "r2") {
        if (i + 1 < w1) return NaN;
        var seg2 = cArr.slice(i - w1 + 1, i + 1);
        for (var q2 = 0; q2 < seg2.length; q2++) if (isMiss(seg2[q2])) return NaN;
        var mm = kind === "slope_r2" ? momentumMetrics(seg2, w1, annf)
               : kind === "wslope_r2" ? weightedMomentumMetrics(seg2, w1, annf)
               : momentumMetrics(seg2, w1, annf);
        return kind === "r2" ? mm.r2 : mm.annSlope * mm.r2;
      }
      if (kind === "vol" || kind === "risk_adj") {
        if (i + 1 < w1) return NaN;
        var seg3 = cArr.slice(i - w1 + 1, i + 1);
        var rets = [], t2;
        for (t2 = 1; t2 < seg3.length; t2++) {
          if (isMiss(seg3[t2]) || isMiss(seg3[t2 - 1])) return NaN;
          rets.push(seg3[t2] / seg3[t2 - 1] - 1);
        }
        var mu = 0;
        for (t2 = 0; t2 < rets.length; t2++) mu += rets[t2];
        mu /= rets.length;
        var v2 = 0;
        for (t2 = 0; t2 < rets.length; t2++) v2 += (rets[t2] - mu) * (rets[t2] - mu);
        var sd = Math.sqrt(v2 / rets.length);
        var vol = sd * Math.sqrt(annf);
        if (kind === "vol") return vol;
        // 修复：年化波动率 <0.5% 的现金等价类（货币ETF/短融等价格恒平）波动率趋零，risk_adj=收益/波动率会爆炸虚高、挤入轮动排名
        return vol > 0.005 ? (seg3[seg3.length - 1] / seg3[0] - 1) / vol : 0;
      }
      if (kind === "amount") return sumAt(amts[code], i, w1) / w1;
      if (kind === "volume") return sumAt(vols[code], i, w1) / w1;
      if (kind === "turnover") {
        // N日平均换手率（%）
        var tArr = turnovers[code]; if (!tArr) return NaN;
        var loT = i - w1 + 1, sT = 0, cT = 0;
        for (var jT = Math.max(0, loT); jT <= i; jT++) { var tv = tArr[jT]; if (tv === -1 || tv == null || isNaN(tv)) return NaN; sT += tv; cT++; }
        return cT ? sT / cT : NaN;
      }
      if (kind === "vol_ratio") {
        // 放量比 = 近N日均量 / M日前M日均量（w1=N，w2=M）
        var m1v = sumAt(vols[code], i, w1) / w1;
        var loM = i - w2 - w2 + 1;
        if (loM < 0) return NaN;
        var m2v = sumAt(vols[code], i - w2, w2) / w2;
        if (!(m2v > 0) || isNaN(m2v)) return NaN;
        return m1v / m2v;
      }
      if (kind === "rsrs") {
        if (i + 1 < w1) return NaN;
        var hs = [], ls = [], j2;
        for (j2 = i - w1 + 1; j2 <= i; j2++) {
          if (isMiss(highs[code][j2]) || isMiss(lows[code][j2])) return NaN;
          hs.push(highs[code][j2]); ls.push(lows[code][j2]);
        }
        return olsSlope(hs, ls);
      }
      if (kind === "premium") {
        // N日溢价率：近N日平均 溢价率 = (未复权收盘价 - 单位净值) / 单位净值 × 100%
        var rc = rawCloses[code], nv = navs[code];
        if (!rc || !nv) return NaN;
        var sumP = 0, cntP = 0, j3;
        for (j3 = i - w1 + 1; j3 <= i; j3++) {
          var pc = rc[j3], pn = nv[j3];
          if (isMiss(pc) || isMiss(pn) || pn <= 0) return NaN;
          sumP += (pc / pn - 1.0);
          cntP++;
        }
        return sumP / cntP * 100.0;
      }
      if (kind === "c_vs_ma") {
        var m1 = maAt(cArr, i, w1);
        if (isNaN(m1)) return NaN;
        return cArr[i] / m1 - 1;
      }
      if (kind === "c_vs_ma_lag") {
        var m2 = maAt(cArr, i - w1, w2);
        if (isNaN(m2)) return NaN;
        return cArr[i] / m2 - 1;
      }
      if (kind === "ma_vs_ma") {
        var mn1 = maAt(cArr, i, w1), mm1 = maAt(cArr, i, w2);
        if (isNaN(mn1) || isNaN(mm1)) return NaN;
        return mn1 / mm1 - 1;
      }
      if (kind === "ma_vs_ma_lag") {
        var mn2 = maAt(cArr, i, w1), mm2 = maAt(cArr, i - w2, w3);
        if (isNaN(mn2) || isNaN(mm2)) return NaN;
        return mn2 / mm2 - 1;
      }
      if (kind === "close") return cArr[i];
      if (kind === "open") { var oArr = opens[code]; return isMiss(oArr[i]) ? NaN : oArr[i]; }
      if (kind === "high") { var hArr = highs[code]; return isMiss(hArr[i]) ? NaN : hArr[i]; }
      if (kind === "low") { var lArr = lows[code]; return isMiss(lArr[i]) ? NaN : lArr[i]; }
      if (kind === "ma") { var m1 = maAt(cArr, i, w1); return isNaN(m1) ? NaN : m1; }
      if (kind === "ma_lag") { var m2 = maAt(cArr, i - w1, w2); return isNaN(m2) ? NaN : m2; }
      if (kind === "amplitude") {
        var hA = highs[code][i], lA = lows[code][i];
        if (isMiss(hA) || isMiss(lA) || lA <= 0) return NaN;
        return (hA - lA) / lA;
      }
      if (kind === "position") {
        var hP = highs[code][i], lP = lows[code][i];
        if (isMiss(hP) || isMiss(lP) || hP <= lP) return NaN;
        return (cArr[i] - lP) / (hP - lP);
      }
      if (kind === "rsi") {
        // P2-11：Wilder 平滑——首值取前 w1 个涨跌幅的简单均值，其后按 alpha=1/w1 递推（与 TradingView/主流实现一致）
        if (i + 1 < w1 + 1) return NaN;
        var segR = cArr.slice(i - w1, i + 1);
        for (var qr = 0; qr < segR.length; qr++) if (isMiss(segR[qr])) return NaN;
        var gR = 0, lR = 0, tR;
        for (tR = 1; tR <= w1; tR++) {
          var dR0 = segR[tR] / segR[tR - 1] - 1;
          if (dR0 > 0) gR += dR0; else lR -= dR0;
        }
        var avgG = gR / w1, avgL = lR / w1;
        for (tR = w1 + 1; tR < segR.length; tR++) {
          var dR = segR[tR] / segR[tR - 1] - 1;
          avgG = (avgG * (w1 - 1) + (dR > 0 ? dR : 0)) / w1;
          avgL = (avgL * (w1 - 1) + (dR < 0 ? -dR : 0)) / w1;
        }
        if (avgG + avgL <= 0) return NaN;
        return avgL === 0 ? 100 : 100 * avgG / (avgG + avgL);
      }
      return NaN;
    }
    function needOf(f) {
      var w1 = f.window || 20, w2 = f.window2 || 0, w3 = f.window3 || 0;
      var kd = f.kind || "roc";
      if (kd === "custom") {
        var nd = 0, pi2, pp;
        for (pi2 = 0; pi2 < (f.formula_parts || []).length; pi2++) {
          pp = f.formula_parts[pi2];
          nd = Math.max(nd, needOf({ kind: pp.kind, window: pp.window, window2: pp.window2, window3: pp.window3 }));
        }
        return nd;
      }
      if (kd === "c_vs_ma_lag" || kd === "ma_lag") return w1 + w2;
      if (kd === "ma_vs_ma") return Math.max(w1, w2);
      if (kd === "ma_vs_ma_lag") return Math.max(w1, w2 + w3);
      return w1;
    }
    var icSnapshots = [];   // 每个调仓决策日的综合得分截面 + 单因子原始值（供组合IC/单因子IC分析）
    var icSnapshotsFull = [];  // 全池 IC 截面：决策日全部有效标的（未过滤 scoreFloor/筛选/走弱），供「筛选池 vs 全池」IC 对照
    function factorScores(candidates, i) {
      var rankFactors = (params.factors || []).filter(function (f) { return (f.usage || "rank") === "rank"; });
      if (!rankFactors.length) return { scored: [], full: [] };
      var need = 0, fi, f;
      for (fi = 0; fi < rankFactors.length; fi++) need = Math.max(need, needOf(rankFactors[fi]));
      need += 1;
      var raw = {}, out = [], fullOut = [], code, cArr, bad;
      for (var ci2 = 0; ci2 < candidates.length; ci2++) {
        code = candidates[ci2];
        cArr = closes[code];
        if (i + 1 < need || isMiss(cArr[i])) continue;
        var vals = {}, ok = true;
        for (fi = 0; fi < rankFactors.length; fi++) {
          f = rankFactors[fi];
          var kind = f.kind || "roc";
          var v = factorValue(kind, code, i, f, params.annualize_factor);
          if (isNaN(v) || v === null || v === undefined) { ok = false; break; }
          var kk = kind + ":" + (f.window || 20) + ":" + (f.window2 || 0) + ":" + (f.window3 || 0) + ":" + (f.formula_parts ? JSON.stringify(f.formula_parts.map(function (pp) { return pp.kind + ":" + (pp.window || 0) + ":" + (pp.window2 || 0) + ":" + (pp.window3 || 0) + ":" + (pp.coef || 0); })) : "");
          vals[kk] = v;
        }
        if (!ok) continue;
        raw[code] = vals;
      }
      var keys = Object.keys(raw);
      if (!keys.length) return { scored: [], full: [] };
      for (var kj = 0; kj < keys.length; kj++) {
        code = keys[kj];
        var score = 0;
        for (fi = 0; fi < rankFactors.length; fi++) {
          f = rankFactors[fi];
          var k = (f.kind || "roc") + ":" + (f.window || 20) + ":" + (f.window2 || 0) + ":" + (f.window3 || 0) + ":" + (f.formula_parts ? JSON.stringify(f.formula_parts.map(function (pp) { return pp.kind + ":" + (pp.window || 0) + ":" + (pp.window2 || 0) + ":" + (pp.window3 || 0) + ":" + (pp.coef || 0); })) : "");
          var arr = [], tt;
          for (tt = 0; tt < keys.length; tt++) arr.push(raw[keys[tt]][k]);
          var z;
          var stdMode = params.standardize || "robust";   // robust | zscore | rank | none
          if (stdMode === "none") {
            z = raw[code][k];
          } else if (stdMode === "zscore") {
            var sA2 = 0; for (tt = 0; tt < arr.length; tt++) sA2 += arr[tt];
            var meanA = sA2 / arr.length;
            var ss2 = 0; for (tt = 0; tt < arr.length; tt++) { var dd = arr[tt] - meanA; ss2 += dd * dd; }
            var sdA = Math.sqrt(ss2 / arr.length);
            z = sdA < 1e-12 ? 0 : (raw[code][k] - meanA) / sdA;
          } else if (stdMode === "rank") {
            // P2-12：线性求秩——一次遍历统计小于/等于当前值的个数，重复值取平均秩（替代 sort+indexOf 的首索引偏置与 O(n²)）
            var vv = raw[code][k], lt = 0, eq = 0, tt2;
            for (tt2 = 0; tt2 < arr.length; tt2++) { if (arr[tt2] < vv) lt++; else if (arr[tt2] === vv) eq++; }
            var ridx = lt + (eq - 1) / 2;
            z = keys.length > 1 ? (ridx < 0 ? 0 : ridx / (keys.length - 1)) : 0;
          } else {  // robust（默认，与 Python 同构）
            var sA = arr.slice().sort(function (a, b) { return a - b; });
            var loV = pctNp(sA, 1), hiV = pctNp(sA, 99);
            var wA = [];
            for (tt = 0; tt < arr.length; tt++) wA.push(arr[tt] < loV ? loV : (arr[tt] > hiV ? hiV : arr[tt]));
            var med = medNp(wA.slice().sort(function (a, b) { return a - b; }));
            var mad = medNp(wA.map(function (x) { return Math.abs(x - med); }).sort(function (a, b) { return a - b; }));
            var sd2 = mad > 0 ? mad * 1.4826 : 0;
            z = sd2 < 1e-12 ? 0 : (raw[code][k] - med) / sd2;
          }
          var dir = f.direction !== undefined ? f.direction : (f.kind === "vol" ? -1 : 1);
          score += (f.weight || 0) * dir * z;
        }
        // 全池记录：scoreFloor/筛选/走弱过滤之前先记一份（供「筛选池 vs 全池」IC 对照）
        if (fullOut) {
          var _fvm = {};
          for (fi = 0; fi < rankFactors.length; fi++) {
            var kkm = (rankFactors[fi].kind || "roc") + ":" + (rankFactors[fi].window || 20) + ":" + (rankFactors[fi].window2 || 0) + ":" + (rankFactors[fi].window3 || 0) + ":" + (rankFactors[fi].formula_parts ? JSON.stringify(rankFactors[fi].formula_parts.map(function (pp) { return pp.kind + ":" + (pp.window || 0) + ":" + (pp.window2 || 0) + ":" + (pp.window3 || 0) + ":" + (pp.coef || 0); })) : "");
            if (vals[kkm] !== undefined) _fvm[kkm] = vals[kkm];
          }
          fullOut.push({ code: code, score: score, fv: _fvm });
        }
        if (stdMode !== "none") {
          if (Math.abs(score) < 1e-12) score = 0;   // 浮点噪声归零（与 Python 同构；none 模式保留原始尺度不归零）
          // 修复：候选仅 1 个时无横向可比（robust 标准化得分为 0），不得按 score_floor 过滤为全程空仓
          if (keys.length > 1 && !(score > scoreFloor)) continue;
        }
        if (params.mm_weak_ma && regime === "weak") {
          var mv2 = rollingMA(closes[code], i, params.mm_window || 20);
          if (isNaN(mv2) || closes[code][i] <= mv2) continue;
        }
        out.push({ score: score, r2: null, code: code, annSlope: null, slope: null });
      }
      return { scored: out, full: fullOut };
    }

    for (i = 0; i <= endPos; i++) {
      // ---- 0) 执行昨日收盘设定的目标（今日开盘成交）----
      var executed = false, r = 0;
      if (pending) {
        var wNew = pending[0], costPct = pending[1], pendDf = pending[2] || 0;
        // P1-5a 可执行性：执行日任一需交易腿开盘价缺失（停牌/未上市）→ 顺延至下一交易日（上限 20 日，超限按可成交腿执行）
        var openOk = true, k2, code2, o1, c0b, c1b;
        for (k2 = 0; k2 < nAssets; k2++) {
          if (wOld[k2] > 0 || wNew[k2] > 0) {
            code2 = codes[k2];
            o1 = opens[code2][i];
            if (isMiss(o1) || o1 <= 0) { openOk = false; break; }
          }
        }
        if (!openOk && pendDf < 20) {
          pending = [wNew, costPct, pendDf + 1];
          executed = false;
        } else {
          // P1-5b 一字涨跌停（未复权口径）：开盘封板且收盘仍在板价 → 对应买卖腿标记不可成交
          var blocked = {};
          for (k2 = 0; k2 < nAssets; k2++) {
            if (!(wOld[k2] > 0 || wNew[k2] > 0)) continue;
            code2 = codes[k2];
            var ro0 = rawOpens && rawOpens[code2] ? rawOpens[code2][i] : null;
            var rc0 = rawCloses && rawCloses[code2] ? rawCloses[code2][i - 1] : null;
            var rcT = rawCloses && rawCloses[code2] ? rawCloses[code2][i] : null;
            if (!(ro0 > 0) || !(rc0 > 0) || !(rcT > 0)) continue;
            var LIM20 = {"588": 1, "589": 1, "159915.SZ": 1, "159949.SZ": 1, "159516.SZ": 1};
            var limR = (LIM20[code2.slice(0, 3)] || LIM20[code2]) ? 1.195 : 1.095;
            if (ro0 >= rc0 * limR - 1e-9 && rcT >= ro0 * 0.999) blocked[code2] = "buy";            // 一字涨停：买不进
            else if (ro0 <= rc0 * (2 - limR) + 1e-9 && rcT <= ro0 * 1.001) blocked[code2] = "sell";  // 一字跌停：卖不出
          }
          cumCost += nav * params.initial_capital * costPct;
          // 组合日收益 = 三分解加权加法（资金并行，非串行复利）：
          //   保留腿 min(wOld,wNew) 按全天收益 C_i/C_{i-1}；卖出腿 max(wOld-wNew,0) 按隔夜 O_i/C_{i-1}（卖后现金）；
          //   买入腿 max(wNew-wOld,0) 按当日 C_i/O_i（开盘买入）。一字板不可成交腿贡献 0（资金留现金/持仓不计）。
          var rLegs = 0;
          for (k2 = 0; k2 < nAssets; k2++) {
            if (!(wOld[k2] > 0 || wNew[k2] > 0)) continue;
            code2 = codes[k2];
            c0b = closes[code2][i - 1]; o1 = opens[code2][i]; c1b = closes[code2][i];
            var okC0 = !isMiss(c0b) && c0b > 0, okO = !isMiss(o1) && o1 > 0, okC1 = !isMiss(c1b) && c1b > 0;
            var blk2 = blocked[code2];
            var wKeep = Math.min(wOld[k2], wNew[k2]);
            var wSell = Math.max(wOld[k2] - wNew[k2], 0);
            var wBuy = Math.max(wNew[k2] - wOld[k2], 0);
            if (wKeep > 0 && blk2 !== "sell" && blk2 !== "buy" && okC0 && okC1) rLegs += wKeep * (c1b / c0b - 1);
            if (wSell > 0 && blk2 !== "sell" && okC0 && okO) rLegs += wSell * (o1 / c0b - 1);
            if (wBuy > 0 && blk2 !== "buy" && okO && okC1) rLegs += wBuy * (c1b / o1 - 1);
          }
          r = (1 - costPct) * (1 + rLegs) - 1;        // 成本开盘扣减，并入当日收益
          // P1-2 修复：buy_i/buy_px 以实际成交日为准（执行段落定；顺延时 i 即真正成交日；保留腿不动）
          for (var k2 = 0; k2 < nAssets; k2++) {
            if (!(wNew[k2] > 0)) continue;
            var ec2 = codes[k2];
            var em2 = posMeta[ec2];
            if (!em2) continue;
            if (em2.buy_i === undefined) {
              var ebp = (opens[ec2] && !isMiss(opens[ec2][i])) ? opens[ec2][i] : closes[ec2][i];
              if (ebp > 0 && !isNaN(ebp)) {
                em2.buy_i = i;
                em2.buy_px = ebp;
                if (!(em2.hi > 0) || isNaN(em2.hi) || em2.hi < ebp) em2.hi = ebp;
              }
            }
          }
          wOld = wNew;
          pending = null;
          executed = true;
          if (tradeRecords.length && tradeRecords[tradeRecords.length - 1].exec_date === cal[i]) {
            var blkL = Object.keys(blocked).map(function (bc) { return { code: bc, side: blocked[bc] }; });
            if (blkL.length) tradeRecords[tradeRecords.length - 1].blocked = blkL;
          }
        }
      }

        // ---- 持仓最高点每日更新（非调仓日不交易、仅记录数据：用当日 high，无前视）----
        var dk;
        for (dk = 0; dk < nAssets; dk++) {
          if (!(wOld[dk] > 0)) continue;
          var dhc = codes[dk];
          var dm = posMeta[dhc];
          if (!dm) continue;
          var dhi = (highs[dhc] && !isMiss(highs[dhc][i])) ? highs[dhc][i] : (closes[dhc][i] || 0);
          if (!(dhi > 0) || isNaN(dhi)) continue;
          dm.hi = Math.max(dm.hi !== undefined ? dm.hi : dhi, dhi);
        }

      // ---- 1) 收盘后决策（次日开盘执行，杜绝前视）----
      if (decisionIdx[i] && i + 1 < n) {
        var ic, mv;
        // 市场状态风控（合并走弱期机制 + 大盘择时）：统一状态机
        // 1) 对选中指数逐日判弱：rollingMA 比较，按触发模式（any=任一跌破 / all=全部跌破）聚合为「当日看弱」
        // 2) 连续迟滞：连续看弱 >= mm_enter_days 进入 weak；连续不看弱 >= mm_exit_days 恢复 normal（1=即时，可覆盖旧大盘择时无迟滞行为）
        // 3) 避险动作：cut=目标仓位整体×X% / cash=候选清空（空仓零收益/货币兜底语义不变） / switch=候选换入自定义避险池
        var REGIME_SINCE = params.regime_since || { "index_000510.SH": "2024-09-23" };
        var mmAction = "normal";
        if (params.mm_on && !isReb) {   // 再平衡模式不适用风控/择时
          var mmW = Math.max(1, +(params.mm_window) || 20);
          var mmCs = params.mm_bench;
          if (Object.prototype.toString.call(mmCs) !== "[object Array]" || !mmCs.length) mmCs = [];
          var mmMode = params.mm_mode === "all" ? "all" : "any";
          var mmBelow = 0, mmValid = 0;
          for (var mmTi = 0; mmTi < mmCs.length; mmTi++) {
            var mmC = mmCs[mmTi];
            var mmArr = idxArr(mmC);
            if (!mmArr) continue;
            var mmMv = rollingMA(mmArr, i, mmW);
            if (isNaN(mmMv)) continue;
            var mmPub = REGIME_SINCE[mmC] || REGIME_SINCE["index_" + mmC];
            if (mmPub && cal[i] < mmPub) continue;
            mmValid++;
            if (isMiss(mmArr[i]) || mmArr[i] <= 0 || mmArr[i] < mmMv) mmBelow++;
          }
          var dayWeak = false;
          if (mmValid > 0) dayWeak = (mmMode === "all") ? (mmBelow === mmValid) : (mmBelow >= 1);
          var mmN = Math.max(1, +(params.mm_enter_days) || 3);
          var mmM = Math.max(1, +(params.mm_exit_days) || 3);
          if (regime === "normal") {
            mmWeakRun = dayWeak ? mmWeakRun + 1 : 0;
            if (mmWeakRun >= mmN) { regime = "weak"; mmWeakRun = 0; mmNormalRun = 0; }
          } else {
            mmNormalRun = dayWeak ? 0 : mmNormalRun + 1;
            if (mmNormalRun >= mmM) { regime = "normal"; mmNormalRun = 0; mmWeakRun = 0; }
          }
          if (regime === "weak") mmAction = "cut";   // 避险动作统一为降仓路径（X%=0 即空仓现金零息）
        }

        var candidates, ci;
        candidates = codes;
        // fallback 标的仅作兜底持仓，不参与候选/排名/筛选
        if (idleC) candidates = candidates.filter(function (c) { return c !== idleC; });
        // 修复：货币ETF/短融等现金等价标的（价格恒平、波动率≈0、成交额虚高）仅作兜底持仓，不得作为轮动进攻标的（否则 risk_adj/amount 因子下得分虚高被误买入）
        var CASH_LIKE = {"511990.SH": 1, "511810.SH": 1};
        candidates = candidates.filter(function (c) { return !CASH_LIKE[c]; });
        // P1-4 幸存者偏差修正（开关）：只保留决策日已上市（已有行情）的标的
        if (params.use_real_pool) candidates = candidates.filter(function (c) { return firstValid[c] >= 0 && firstValid[c] <= i; });
        // 大盘择时-风格切换（相对强弱，独立开关）：小盘指数与大盘指数 N 日动量差 > 0 → 候选剔除大盘风格组（偏小盘）；< 0 → 剔除小盘风格组（偏大盘）
        if (params.st_on && (params.st_small_codes || []).length && (params.st_large_codes || []).length) {
          var stWin = Math.max(1, +(params.st_window) || 20);
          function momIdxAt(ic2, i2) {
            var arr = idxArr(ic2);
            if (!arr) return 0;
            var c1 = arr[i2], c0 = arr[i2 - stWin];
            if (isMiss(c1) || isMiss(c0) || c0 <= 0) return 0;
            return c1 / c0 - 1;
          }
          var momS = momIdxAt(params.st_small_idx || "000852.SH", i);
          var momL = momIdxAt(params.st_large_idx || "H00300.CSI", i);
          var stEx = {};
          (momS - momL > 0 ? (params.st_large_codes || []) : (params.st_small_codes || [])).forEach(function (c2) { stEx[c2] = 1; });
          candidates = candidates.filter(function (c2) { return !stEx[c2]; });
        }
        var candFull = candidates.slice();   // 全池截面（未过滤 scoreFloor/筛选，供全池 IC 对照）

        // 筛选条件：统一因子列表中 usage=filter 的全部满足才进入候选池（{kind, window, op: gte/lte, threshold}）
        var allFactors = (params.factors && params.factors.length) ? params.factors
                       : (params.filters || []).map(function (ft) { return { kind: ft.kind, window: ft.window, op: ft.op, threshold: ft.threshold, usage: "filter" }; });
        var filters = allFactors.filter(function (f) { return (f.usage || "rank") === "filter"; });
        if (filters.length) {
          var cand2 = [];
          for (ci = 0; ci < candidates.length; ci++) {
            var codeF = candidates[ci], cArrF = closes[codeF];
            if (isMiss(cArrF[i])) continue;
            var okF = true, fiF, ft;
            for (fiF = 0; fiF < filters.length; fiF++) {
              ft = filters[fiF];
              var kindF = ft.kind || "roc";
              var opF = ft.op || "gte", thrF = +(ft.threshold || 0);
              var valF = factorValue(kindF, codeF, i, ft, params.annualize_factor);
              if (isNaN(valF)) { okF = false; break; }
              if ((opF === "lte" && valF > thrF) || (opF === "gte" && valF < thrF)) { okF = false; break; }
            }
            if (okF) cand2.push(codeF);
          }
          candidates = cand2;
        }

        // 卖出冷却：最近 cooldown_days 个交易日内卖出的标的暂缓买入（默认 0 = 不限制）
        var cd = +(params.cooldown_days) || 0;
        if (cd > 0) {
          var cand3 = [];
          for (ci = 0; ci < candidates.length; ci++) {
            var cC = candidates[ci];
            var ls = lastSell[cC];
            if (ls === undefined || (i - ls) >= cd) cand3.push(cC);
          }
          candidates = cand3;
        }

        var fsR = factorScores(candidates, i);
        var scored = fsR.scored;
        scored.sort(function (a, b) { return b.score - a.score; });
        var fsFull = (candFull && candFull !== candidates) ? factorScores(candFull, i) : fsR;
        // 收集组合IC所需的截面：综合得分 + 各排名因子原始值（与本次回测同口径）
        if (scored.length) {
          var _sn = { i: i, scores: {}, fv: {} };
          for (var _si = 0; _si < scored.length; _si++) _sn.scores[scored[_si].code] = scored[_si].score;
          var _rkf = (params.factors || []).filter(function (f) { return (f.usage || "rank") === "rank"; });
          for (var _fi2 = 0; _fi2 < _rkf.length; _fi2++) {
            var _f2 = _rkf[_fi2];
            var _kk2 = _f2.kind + ":" + (_f2.window || 20) + ":" + (_f2.window2 || 0) + ":" + (_f2.window3 || 0);
            var _vals2 = {};
            // 只对综合得分（scored）内的标的取单因子值，确保单因子IC与组合IC同标的集（含走弱期过滤）同口径
            for (var _si2 = 0; _si2 < scored.length; _si2++) {
              var _code2 = scored[_si2].code;
              var _v2 = factorValue(_f2.kind, _code2, i, _f2, params.annualize_factor);
              if (!isNaN(_v2) && _v2 !== null && _v2 !== undefined) _vals2[_code2] = _v2;
            }
            _sn.fv[_kk2] = _vals2;
          }
          icSnapshots.push(_sn);
        }
        // 全池 IC 截面（未过滤：与筛选池同日对齐）
        if (fsFull.full.length) {
          var _snF = { i: i, scores: {}, fv: {} };
          for (var _siF = 0; _siF < fsFull.full.length; _siF++) {
            var _cF = fsFull.full[_siF];
            _snF.scores[_cF.code] = _cF.score;
            for (var _kF in _cF.fv) { _snF.fv[_kF] = _snF.fv[_kF] || {}; _snF.fv[_kF][_cF.code] = _cF.fv[_kF]; }
          }
          icSnapshotsFull.push(_snF);
        }

        var wNew2 = new Array(nAssets).fill(0);
        var holding = [];
        if (isReb) {
          // 再平衡：比例（reb_weights）或 动态权重（inv_vol/risk_parity，按决策日数据算目标权重再平衡）
          var rwM = params.reb_weights || {};
          var rwm2 = params.reb_weight_mode || "fixed";
          var codesH2 = [];
          for (var ckR0 = 0; ckR0 < nAssets; ckR0++) if ((rwM[codes[ckR0]] || 0) > 0) codesH2.push(codes[ckR0]);
          // P2-13 已上市检查：决策日尚无有效行情（未上市/停牌）的标的不参与再平衡，避免静默贡献 0 收益
          var notListed = [];
          codesH2 = codesH2.filter(function (c) {
            var okR = !isMiss(closes[c][i]) && closes[c][i] > 0;
            if (!okR) notListed.push(c);
            return okR;
          });
          if (rwm2 === "inv_vol" || rwm2 === "risk_parity") {
            var rc2 = params.reb_codes || codesH2;
            var codesH3 = rc2.filter(function (c) { return codeSet[c] && !isMiss(closes[c][i]) && closes[c][i] > 0; });
            var relW2 = holdingWeights(rwm2, codesH3, i);
            codesH3.forEach(function (ch) { wNew2[codes.indexOf(ch)] = relW2[ch]; holding.push(ch); });
          } else {
            for (var ckR = 0; ckR < nAssets; ckR++) {
              var wrR = rwM[codes[ckR]] || 0;
              if (wrR > 0 && codesH2.indexOf(codes[ckR]) >= 0) { wNew2[ckR] = wrR; holding.push(codes[ckR]); }
            }
            // 防御：比例权重归一化（导入老策略/手改总和≠1 时禁止杠杆；总和=1 时无变化）
            var swR = 0;
            for (ckR = 0; ckR < nAssets; ckR++) swR += wNew2[ckR];
            if (swR > 1e-9 && Math.abs(swR - 1) > 1e-9) { for (ckR = 0; ckR < nAssets; ckR++) wNew2[ckR] /= swR; }
          }
        } else {
          // ---- 轮动策略：持有排名区间 [N, M] + 三组附加交易条件 ----
          var rankN = params.rank_n !== undefined && params.rank_n !== null ? Math.max(1, +params.rank_n || 1)
                    : 1;
          var rankM = params.rank_m !== undefined && params.rank_m !== null ? Math.max(rankN, +params.rank_m || rankN)
                    : Math.max(rankN, +(params.top_n) || 1);
          var buyAdd = params.buy_add || [];
          var sellConds = params.sell_conds || [];
          var holdConds = params.hold_conds || [];
          var onlyR2 = params.only_rotation_codes || [];

          // 排名映射（1-based，含仅轮动标的；候选外代码名次=+∞）
          var rankMap = {};
          for (var rj = 0; rj < scored.length; rj++) rankMap[scored[rj].code] = rj + 1;

          function facHit(f, code, i) {
            var kind = f.kind || "roc", op = f.op || "gte", thr = +(f.threshold || 0);
            var v = factorValue(kind, code, i, f, params.annualize_factor);
            if (v === null || v === undefined || isNaN(v)) return false;
            return op === "lte" ? v <= thr : v >= thr;
          }
          function buyAddHit(f, code, i) {
            var t = f.type;
            if (t === "rank") {
              var rk = rankMap[code] !== undefined ? rankMap[code] : 1e9;
              var op = f.op || "lte", v = +(f.value || 1);
              return op === "lte" ? rk <= v : rk >= v;
            }
            if (t === "cooldown") {
              var ls = lastSell[code], v2 = +(f.value || 0);
              return ls === undefined || (i - ls) >= v2;
            }
            if (t === "factor") return facHit(f, code, i);
            return true;
          }
          function sellHit(f, code, i, meta) {
            var t = f.type, v = +(f.value || 1);
            var rk = rankMap[code] !== undefined ? rankMap[code] : 1e9;
            if (t === "rank") return rk >= v;
            if (t === "hold_days") {
              var bi = meta.buy_i;
              return bi !== undefined && (i - bi) >= v;
            }
            if (t === "buy_gain") {
              var bp = meta.buy_px;
              return bp !== undefined && bp > 0 && (closes[code][i] / bp - 1) * 100 >= v;
            }
            if (t === "buy_loss") {
              var bp2 = meta.buy_px;
              return bp2 !== undefined && bp2 > 0 && (closes[code][i] / bp2 - 1) * 100 <= -v;
            }
            if (t === "high_dd") {
              var hp = meta.hi;
              return hp !== undefined && hp > 0 && (hp - closes[code][i]) / hp * 100 >= v;
            }
            if (t === "factor") return facHit(f, code, i);
            return false;
          }
          function holdHit(f, code, i, meta) {
            var t = f.type;
            if (t === "hold_days") {
              var bi = meta.buy_i;
              return bi !== undefined && (i - bi) <= +(f.value || 1);
            }
            if (t === "factor") return facHit(f, code, i);
            return false;
          }

          // 卖出判定：轮动卖出基线（跌出排名区间）+ 卖出条件（任一命中）− 不卖条件（任一命中豁免）
          var wTarget = {};          // code -> 1（占位，权重随后统一）
          var soldNow = {};          // 本次已卖出的标的（同一决策日不再买入）
          var sellReason = {};       // code -> [原因]：rank_out=跌出排名区间 / sell_cond=卖出条件触发
          for (var sk = 0; sk < nAssets; sk++) {
            if (!(wOld[sk] > 0)) continue;
            var sc = codes[sk];
            var srk = rankMap[sc] !== undefined ? rankMap[sc] : 1e9;
            var bandOut = srk < rankN || srk > rankM;
            var meta = posMeta[sc] || {};
            var sH = false, idxC2;
            for (idxC2 = 0; idxC2 < sellConds.length; idxC2++) if (sellHit(sellConds[idxC2], sc, i, meta)) { sH = true; break; }
            var nH = false;
            for (idxC2 = 0; idxC2 < holdConds.length; idxC2++) if (holdHit(holdConds[idxC2], sc, i, meta)) { nH = true; break; }
            if ((bandOut || sH) && !nH) {
              lastSell[sc] = i;      // 卖出记录（决策日索引，冷却用）
              soldNow[sc] = 1;       // 本次不再买入
              var whyS = [];
              if (bandOut) whyS.push("rank_out");
              if (sH) whyS.push("sell_cond");
              sellReason[sc] = whyS;
            } else {
              wTarget[sc] = 1;       // 保留持仓
            }
          }

          // 买入候选：排名区间内 + 非仅轮动 + 非本次卖出 + 全部买入附加条件满足
          {
            for (var bj = 0; bj < scored.length; bj++) {
              var bc = scored[bj].code;
              var brk = rankMap[bc];
              if (brk < rankN || brk > rankM) continue;
              if (onlyR2.indexOf(bc) >= 0 || soldNow[bc]) continue;
              var bOk = true;
              for (var bj2 = 0; bj2 < buyAdd.length; bj2++) if (!buyAddHit(buyAdd[bj2], bc, i)) { bOk = false; break; }
              if (bOk) { if (wTarget[bc] === undefined) wTarget[bc] = 1; }
            }
          }

          // 权重：区间内等分 1/(M-N+1)；持有权重模式可换 逆波动率/风险平价（总仓位仍受区间长度约束，不足补持 fallback）
          var wt = 1 / (rankM - rankN + 1);
          var hwMode = params.holding_weight || "equal";
          var codesH = Object.keys(wTarget);
          // P2-12：idleC 已在 backtest 顶部由 idleMap0 声明，此处复用，删除同作用域重复 var 声明
          if (codesH.length) {
            var relW = holdingWeights(hwMode, codesH, i);
            var totalW = Math.min(1, codesH.length * wt);
            codesH.forEach(function (ch) {
              wNew2[codes.indexOf(ch)] = relW[ch] * totalW;
              holding.push(ch);
            });
            // 候选不足区间长度时：剩余仓位补持 fallback 资产（cash 则仍持现金）
            var need = rankM - rankN + 1;
            if (idleC && codeSet[idleC] && codesH.length < need) {
              var fill = 1 - totalW;
              wNew2[codes.indexOf(idleC)] += fill;
              if (holding.indexOf(idleC) < 0) holding.push(idleC);
            }
          } else {
            // 空仓时持有标的：cash=空仓 / gold=黄金ETF / bond=国债ETF / money=货币ETF（不在池内则空仓）
            if (idleC && codeSet[idleC]) {
              wNew2[codes.indexOf(idleC)] = 1;
              holding.push(idleC);
            }
          }

          // 持仓状态更新（决策日预置/更新 hi：继续持有并入执行日高点；新买入预置执行日高点初值；buy_i/buy_px 由执行段在真实成交日落定）
          holding.forEach(function (hc) {
            var hn = (highs[hc] && !isMiss(highs[hc][i + 1])) ? highs[hc][i + 1] : closes[hc][i];
            if (isNaN(hn) || !(hn > 0)) hn = closes[hc][i];
            if (posMeta[hc]) {
              posMeta[hc].hi = Math.max(posMeta[hc].hi !== undefined ? posMeta[hc].hi : hn, hn);
            } else {
              var hp0 = (opens[hc] && !isMiss(opens[hc][i + 1])) ? opens[hc][i + 1] : closes[hc][i];
              if (isNaN(hp0) || !(hp0 > 0)) hp0 = hn;
              posMeta[hc] = { hi: Math.max(hn, hp0) };
            }
          });
          Object.keys(posMeta).forEach(function (pc) {
            if (holding.indexOf(pc) < 0) delete posMeta[pc];
          });
        }

        // 市场状态风控-降仓动作（weak 且动作=降至X%）：目标仓位整体×X%（0=全部持现金/货币兜底）
        if (mmAction === "cut") {
          var mmCut = Math.max(0, Math.min(1, (+(params.mm_cut_pct) || 0) / 100));
          if (mmCut < 1) { for (var mK = 0; mK < nAssets; mK++) wNew2[mK] *= mmCut; }
        }

        var turnover = 0, k3;
        for (k3 = 0; k3 < nAssets; k3++) turnover += Math.abs(wNew2[k3] - wOld[k3]);
        // P1-5c 最低佣金（元/笔）：佣金部分不足最低额时按最低额计（占组合净值比例 = 最低佣金/当前组合净值×初始资金）
        var minCommPct = (params.min_commission > 0) ? params.min_commission / (nav * (params.initial_capital || 1000000)) : 0;
        function legCost(dw6, c6) {
          // 货币ETF/短融等现金等价兜底腿：现金管理操作，免佣金/滑点（否则每次换仓到货币再换回的佣金会吞掉货币收益，使持有货币反而不如空仓）
          if (CASH_LIKE[c6]) return 0;
          var comm = Math.abs(dw6) * params.commission_rate;
          if (minCommPct > 0 && comm < minCommPct) comm = minCommPct;
          return comm + Math.abs(dw6) * (tiered ? slippageFor(c6, i) : params.slippage_rate);
        }
        var costPct2 = 0, k6;
        for (k6 = 0; k6 < nAssets; k6++) {
          var dw6 = wNew2[k6] - wOld[k6];
          if (dw6 > 0) costPct2 += legCost(dw6, codes[k6]);
          else if (dw6 < 0) costPct2 += legCost(dw6, codes[k6]);
        }

        var fromCodes = [], k4;
        for (k4 = 0; k4 < nAssets; k4++) if (wOld[k4] > 0) fromCodes.push(codes[k4]);
        // 卖出/买入金额：按投资额 100 万元、决策日净值口径
        var sellAmt = 0, buyAmt = 0, k5;
        for (k5 = 0; k5 < nAssets; k5++) {
          var diff5 = wNew2[k5] - wOld[k5];
          if (diff5 < 0) sellAmt += -diff5; else buyAmt += diff5;
        }
        var capK = params.initial_capital || 1000000;
        sellAmt = sellAmt * nav * capK;
        buyAmt = buyAmt * nav * capK;
        // P2-15：买入均价 = 按目标权重（近似买入金额）加权的次日开盘未复权价；单标的直接取其开盘价
        var exRaw = null, wSumR = 0;
        for (var k7 = 0; k7 < holding.length; k7++) {
          var rr7 = rawOpens && rawOpens[holding[k7]] ? rawOpens[holding[k7]][i + 1] : null;
          if (!(rr7 > 0)) continue;
          var wK7 = wNew2[codes.indexOf(holding[k7])] || 0;
          if (exRaw === null) exRaw = 0;
          exRaw += wK7 * rr7; wSumR += wK7;
        }
        if (wSumR > 0 && exRaw !== null) exRaw /= wSumR;
        var buyShares = (exRaw && exRaw > 0) ? buyAmt / exRaw : null;
        var soldList = [];
        for (var k8 = 0; k8 < fromCodes.length; k8++) {
          if (holding.indexOf(fromCodes[k8]) < 0) {
            var frc = fromCodes[k8];
            soldList.push({ code: frc, reasons: sellReason[frc] || ["rank_out"] });
          }
        }
        tradeRecords.push({
          decision_date: cal[i], exec_date: cal[i + 1], regime: regime,
          from: fromCodes, to: holding, sold: soldList,
          top_scores: scored.slice(0, 3).map(function (t) { return { code: t.code, score: t.score, r2: t.r2, annual_slope: t.annSlope }; }),
          turnover: turnover, cost_pct: costPct2,
          sell_amount: sellAmt, buy_amount: buyAmt, buy_shares: buyShares,
          hold_unchanged: turnover < 1e-9
        });
        // 卖出冷却记录：本次不再持有的旧持仓记为卖出（决策日索引）
        for (k4 = 0; k4 < nAssets; k4++) {
          if (wOld[k4] > 0 && wNew2[k4] === 0) lastSell[codes[k4]] = i;
        }
        pending = [wNew2, costPct2];
      }

      // ---- 2) 当日收益 ----
      if (i === 0) { navSeries[0] = nav; regSeries[0] = regime; ddSeries[0] = 0; expSeries[0] = 0; holdSeries[0] = []; dailyRet[0] = 0; continue; }
      if (!executed) {
        r = 0;
        for (k = 0; k < nAssets; k++) {
          if (wOld[k] > 0) {
            code = codes[k];
            c0 = closes[code][i - 1]; c1 = closes[code][i];
            if (!isMiss(c0) && !isMiss(c1) && c0 > 0) { var rkFall = (idleC === code && params.fallback_when_no_signal === "money") ? rfDaily : (c1 / c0 - 1); r += wOld[k] * rkFall; }
          }
        }
      }
      dailyRet[i] = r;
      nav *= (1 + r);
      navSeries[i] = nav;
      if (nav > peak) peak = nav;
      ddSeries[i] = nav / peak - 1;
      expSeries[i] = wOld.reduce(function (a, b) { return a + b; }, 0);
      holdSeries[i] = [];
      for (k = 0; k < nAssets; k++) if (wOld[k] > 0) holdSeries[i].push(codes[k]);
      regSeries[i] = regime;
    }

    // ---- 切片到回测区间 ----
    var calS = cal.slice(startPos, endPos + 1);
    var navV = navSeries.slice(startPos, endPos + 1), ddV = ddSeries.slice(startPos, endPos + 1);
    var benchV = benchNav.slice(startPos, endPos + 1), ewV = ewNav.slice(startPos, endPos + 1);
    var dailyR = dailyRet.slice(startPos, endPos + 1), benchD = benchDaily.slice(startPos, endPos + 1);
    var holdV = holdSeries.slice(startPos, endPos + 1), regV = regSeries.slice(startPos, endPos + 1), expV = expSeries.slice(startPos, endPos + 1);
    var benchDD = benchV.map(function (v, idx) { return v / benchV.slice(0, idx + 1).reduce(function (a, b) { return b > a ? b : a; }, -Infinity) - 1; });

    // ---- 指标 ----
    var totalReturn = navV[navV.length - 1] / navV[0] - 1;
    var nDays = calS.length - 1;
    var cagr = nDays > 0 ? Math.pow(navV[navV.length - 1] / navV[0], ann / nDays) - 1 : 0;
    var rets = dailyR.slice(1);
    var meanR = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var stdR = 0;
    if (rets.length > 1) {
      var sse = rets.reduce(function (a, b) { var d = b - meanR; return a + d * d; }, 0);
      stdR = Math.sqrt(sse / (rets.length - 1));
    }
    var vol = stdR * Math.sqrt(ann);
    var sharpe = stdR > 0 ? (meanR - rfDaily) / stdR * Math.sqrt(ann) : 0;
    var maxDD = Math.min.apply(null, ddV);
    var calmar = maxDD < 0 ? cagr / Math.abs(maxDD) : NaN;
    var winRate = rets.filter(function (v) { return v > 0; }).length / rets.length;
    var gains = 0, losses = 0, vi;
    for (vi = 0; vi < rets.length; vi++) { if (rets[vi] > 0) gains += rets[vi]; else losses -= rets[vi]; }
    var profitFactor = losses > 0 ? gains / losses : Infinity;
    var exposure = expV.slice(1).filter(function (v) { return v > 0; }).length / Math.max(1, expV.length - 1);

    function benchMetrics(bnav, bret) {
      var tr = bnav[bnav.length - 1] / bnav[0] - 1;
      var cg = Math.pow(bnav[bnav.length - 1] / bnav[0], ann / nDays) - 1;
      var bdd = Math.min.apply(null, bnav.map(function (v, idx) { return v / bnav.slice(0, idx + 1).reduce(function (a, b) { return b > a ? b : a; }, -Infinity) - 1; }));
      var br = bret.slice(1);
      var m = br.reduce(function (a, b) { return a + b; }, 0) / br.length;
      var sse = br.reduce(function (a, b) { var d = b - m; return a + d * d; }, 0);
      var sd = br.length > 1 ? Math.sqrt(sse / (br.length - 1)) : 0;
      return { total: tr, cagr: cg, max_dd: bdd, vol: sd * Math.sqrt(ann), sharpe: sd > 0 ? (m - rfDaily) / sd * Math.sqrt(ann) : 0 };
    }

    function sliceEw(ew) {
      var rr = new Array(ew.length).fill(0);
      for (var x = 1; x < ew.length; x++) rr[x] = ew[x] / ew[x - 1] - 1;
      return rr;
    }

    var years = {}, months = {}, bYears = {}, key;
    for (i = 1; i < calS.length; i++) {
      key = calS[i].slice(0, 4);
      if (!(key in years)) { years[key] = 1; bYears[key] = 1; }
      years[key] *= (1 + dailyR[i]);
      bYears[key] *= (1 + benchD[i]);
      key = calS[i].slice(0, 7);
      if (!(key in months)) months[key] = 1;
      months[key] *= (1 + dailyR[i]);
    }
    var annual = {}, ba = {}, mo = {};
    for (key in years) annual[key] = years[key] - 1;
    for (key in bYears) ba[key] = bYears[key] - 1;
    for (key in months) mo[key] = months[key] - 1;

    return {
      calendar: calS, nav: navV, bench_nav: benchV, ew_nav: ewV,
      drawdown: ddV, bench_drawdown: benchDD, daily_ret: dailyR,
      holdings: holdV, regime: regV, exposure: expV,
      trades: tradeRecords, pool: codes,
      ic_snapshots: icSnapshots, ic_snapshots_full: icSnapshotsFull,
      metrics: {
        total_return: totalReturn, cagr: cagr, max_dd: maxDD,
        sharpe: sharpe, vol: vol, calmar: calmar,
        win_rate: winRate, profit_factor: profitFactor,
        exposure: exposure, n_days: nDays,
        n_trades: tradeRecords.length, cum_cost: cumCost,
        sell_cond_times: tradeRecords.reduce(function (a, t) { return a + (t.sold || []).filter(function (s) { return (s.reasons || []).indexOf("sell_cond") >= 0; }).length; }, 0),
        benchmark: benchMetrics(benchV, benchD),
        equal_weight: benchMetrics(ewV, sliceEw(ewV)),
        bench_corr: (function () {
          var rl = [], bl = [], cnt = 0, kc, mR = 0, mB = 0;
          for (kc = 0; kc < dailyR.length; kc++) {
            if (isNaN(dailyR[kc]) || isNaN(benchD[kc])) continue;
            rl.push(dailyR[kc]); bl.push(benchD[kc]); mR += dailyR[kc]; mB += benchD[kc]; cnt++;
          }
          if (cnt < 2) return 0;
          mR /= cnt; mB /= cnt;
          var num = 0, dR = 0, dB = 0;
          for (kc = 0; kc < cnt; kc++) { num += (rl[kc] - mR) * (bl[kc] - mB); dR += (rl[kc] - mR) * (rl[kc] - mR); dB += (bl[kc] - mB) * (bl[kc] - mB); }
          return dR > 0 && dB > 0 ? num / Math.sqrt(dR * dB) : 0;
        })(),
        annual: annual, bench_annual: ba, monthly: mo,
        // 样本内外分割：验证段 = 最近 3 年（研究段 = 之前），与 Python 同构
        segments: (function () {
          var vIdx = calS.length;
          var ey = parseInt(calS[calS.length - 1].slice(0, 4), 10) - 3;
          var vDate = String(ey) + calS[calS.length - 1].slice(4);
          for (var vi = 0; vi < calS.length; vi++) {
            if (calS[vi] >= vDate) { vIdx = vi; break; }
          }
          function segM(a, b) {
            if (b - a < 5) return null;
            var seg = navV.slice(a, b);
            var tot = seg[seg.length - 1] / seg[0] - 1;
            var yrs = (b - a) / ann;
            var cg = yrs > 0 && seg[0] > 0 ? Math.pow(seg[seg.length - 1] / seg[0], 1 / yrs) - 1 : 0;
            var pk = seg[0], mdd = 0, si;
            for (si = 0; si < seg.length; si++) {
              if (seg[si] > pk) pk = seg[si];
              var dd = 1 - seg[si] / pk;
              if (dd > mdd) mdd = dd;
            }
            var sr = [];
            for (si = 1; si < seg.length; si++) sr.push(seg[si] / seg[si - 1] - 1);
            var mm = 0;
            for (si = 0; si < sr.length; si++) mm += sr[si];
            mm /= sr.length;
            var sd = 0;
            for (si = 0; si < sr.length; si++) sd += (sr[si] - mm) * (sr[si] - mm);
            sd = Math.sqrt(sd / sr.length);
            var shp = sd > 0 ? (mm - rfDaily) / sd * Math.sqrt(ann) : 0;
            return { total: Math.round(tot * 1e6) / 1e6, cagr: Math.round(cg * 1e6) / 1e6, max_dd: Math.round(mdd * 1e6) / 1e6, sharpe: Math.round(shp * 1e4) / 1e4, n_days: b - a };
          }
          return {
            v_start: vIdx < calS.length ? calS[vIdx] : null,
            study: segM(0, vIdx),
            validation: segM(vIdx, calS.length)
          };
        })()
      }
    };
  }

  var api = { backtest: backtest, momentumMetrics: momentumMetrics, rollingMA: rollingMA, gridER: gridER, gridAnnVol: gridAnnVol, gridADX: gridADX, gridQuantile: gridQuantile, gridMean: gridMean, gridStd: gridStd, gridScore: gridScore, gridParams: gridParams, backtestGrid: backtestGrid, gridUnitDays: gridUnitDays, GRID_LOOK: GRID_LOOK, STRESS_SEGS: STRESS_SEGS, gridStressSegs: gridStressSegs, gridMaxDDSeg: gridMaxDDSeg, gridBreachSim: gridBreachSim, gridStressPerturb: gridStressPerturb };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.WufuEngine = api;
})(this);