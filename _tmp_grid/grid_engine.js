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
  function gridParams(code, i, invest, costRt) {
    var sArr = D.series[code];
    var cArr = sArr.close, hArr = sArr.high, lArr = sArr.low;
    var lo = Math.max(0, i - GRID_LOOK + 1);
    var p10 = gridQuantile(cArr, lo, i, 0.10), p90 = gridQuantile(cArr, lo, i, 0.90);
    var cur = cArr[i];
    if (isNaN(p10) || isNaN(p90) || !(p90 > p10) || isMiss(cur)) return null;
    var mid = (p10 + p90) / 2;
    var sig = gridStd(cArr, Math.max(1, i - 59), i);
    var ampSum = 0, ampN = 0, j;
    for (j = Math.max(0, i - 59); j <= i; j++) { if (!isMiss(hArr[j]) && !isMiss(lArr[j]) && !isMiss(cArr[j]) && cArr[j] > 0) { ampSum += (hArr[j] - lArr[j]) / cArr[j]; ampN++; } }
    var amp = ampN ? ampSum / ampN : sig;
    var stepRatio = Math.max(isNaN(sig) ? 0 : sig, isNaN(amp) ? 0 : amp);
    if (!(stepRatio > 0)) stepRatio = 0.02;
    var step = stepRatio * mid;
    var nLev = Math.max(5, Math.min(10, Math.round((p90 - p10) / step)));
    step = (p90 - p10) / nLev;
    var perLevelAmt = invest / nLev;
    var baseRatio = (p90 - cur) / (p90 - p10);
    baseRatio = Math.max(0, Math.min(1, baseRatio));
    var baseAmt = invest * baseRatio;
    var p = { code: code, lower: p10, upper: p90, mid: mid, step: step, nLevels: nLev, perLevelAmt: perLevelAmt, baseAmt: baseAmt, cur: cur, stepRatio: stepRatio };
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
    var startIdx = params.start_idx !== undefined ? params.start_idx : 0;
    var endIdx = params.end_idx !== undefined ? params.end_idx : n - 1;
    var invest = params.initial_capital || 1000000;
    var nInv = invest / codes.length;
    var comm = params.commission_rate || 0.00025, slip = params.slippage_rate || 0.0005;
    var minComm = params.min_commission || 0;
    var mgmt = params.mgmt || "B";
    var periodN = Math.max(1, params.period_n || 12), unitD = gridUnitDays(params.period_unit || "周");
    var periodDays = periodN * unitD;
    var st = {};
    codes.forEach(function (c2) {
      var sArr = Dd.series[c2];
      var g = gridParams(c2, startIdx, nInv, comm + slip);
      if (!g || !(g.upper > g.lower)) { st[c2] = { active: false, ca: sArr.close, oa: sArr.open, ha: sArr.high, la: sArr.low, pos: 0, cash: 0 }; return; }
      var levels = [], li;
      for (li = 1; li <= g.nLevels - 1; li++) levels.push(g.lower + li * g.step);
      st[c2] = { lower: g.lower, upper: g.upper, step: g.step, levels: levels, perLevelAmt: g.perLevelAmt,
        pos: 0, cash: 0, buyDay: -1, todayBuy: 0, sellOnly: false, active: true, baseShares: 0, _pending: [],
        ca: sArr.close, oa: sArr.open, ha: sArr.high, la: sArr.low, _exit: null };
    });
    var navArr = new Array(endIdx - startIdx + 1);
    var trades = [], health = [];
    var initI = Math.min(startIdx + 1, endIdx);
    if (initI > startIdx) {
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active) return;
        var g0 = gridParams(c2, startIdx, nInv, comm + slip); if (!g0) return;
        var px = s.oa[initI];
        if (isMiss(px) || !(px > 0)) px = s.ca[initI];
        if (!(px > 0) || isNaN(px)) return;
        var sh = g0.baseAmt / px;
        var costPct = (comm + slip) * sh * px;
        if (minComm > 0 && (comm * sh * px) > 0 && (comm * sh * px) < minComm) costPct = minComm + slip * sh * px;
        if (sh * px + costPct > nInv) sh = Math.max(0, (nInv - Math.min(costPct, nInv * 0.01)) / px);
        s.pos = sh; s.baseShares = sh; s.cash = Math.max(0, nInv - sh * px - costPct); s.buyDay = initI;
        trades.push({ d: cal[initI], code: c2, side: "BUY", level: px, px: px, sh: Math.round(sh * 100) / 100, amt: Math.round(sh * px * 100) / 100, tag: "底仓" });
      });
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
          if (ok) {
            var g2 = gridParams(c2, ii, s.pos * s.ca[ii] + s.cash, comm + slip);
            if (g2 && g2.upper > g2.lower) {
              var lv2 = [];
              for (var li2 = 1; li2 <= g2.nLevels - 1; li2++) lv2.push(g2.lower + li2 * g2.step);
              s.lower = g2.lower; s.upper = g2.upper; s.step = g2.step; s.levels = lv2; s.perLevelAmt = g2.perLevelAmt;
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
      // 4) 撤换执行（昨日决策，今日开盘执行）
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active || !s._exit) return;
        var px = s.oa[ii];
        if (isMiss(px) || !(px > 0)) px = s.ca[ii];
        if (px > 0 && !isNaN(px) && s.pos > 0) {
          var c1 = comm * s.pos * px;
          if (minComm > 0 && c1 > 0 && c1 < minComm) c1 = minComm;
          var amt = s.pos * px * (1 - slip) - c1;
          if (amt > 0) { s.cash += amt; trades.push({ d: cal[ii], code: c2, side: "SELL", level: px, px: px, sh: Math.round(s.pos * 100) / 100, amt: Math.round(amt * 100) / 100, tag: "撤换清仓" }); }
          s.pos = 0;
        }
        if (s.pos <= 0) { s.active = false; s._exit = null; }
      });
      // 5) 补位（体检决策后次日开盘建仓；参数/评分用决策日数据，无前视）
      if (isPeriodEnd) {
        var need = 0;
        codes.forEach(function (c2) { var s = st[c2]; if (!s || !s.active || s.pos <= 0) need++; });
        if (need > 0) {
          var scored = [], c3;
          for (c3 = 0; c3 < POOL.length; c3++) {
            var pc3 = POOL[c3].code;
            if (codes.indexOf(pc3) >= 0 && st[pc3] && st[pc3].active && st[pc3].pos > 0) continue;
            if (st[pc3] && (st[pc3]._exit || st[pc3].sellOnly)) continue;
            var sc3 = gridScore(pc3, ii);
            if (!sc3.gate.length && sc3.score >= 60) scored.push({ code: pc3, score: sc3.score });
          }
          scored.sort(function (a, b) { return b.score - a.score; });
          var addIdx = 0;
          while (need > 0 && addIdx < scored.length) {
            var nc = scored[addIdx].code;
            if (!st[nc]) {
              var g3 = gridParams(nc, ii, nInv, comm + slip);
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
                  var costN = (comm + slip) * shN * pxN;
                  if (minComm > 0 && (comm * shN * pxN) > 0 && (comm * shN * pxN) < minComm) costN = minComm + slip * shN * pxN;
                  if (shN * pxN + costN > nInv) shN = Math.max(0, (nInv - Math.min(costN, nInv * 0.01)) / pxN);
                  st[nc].pos = shN; st[nc].baseShares = shN; st[nc].cash = Math.max(0, nInv - shN * pxN - costN); st[nc].buyDay = ii + 1;
                  trades.push({ d: cal[ii + 1], code: nc, side: "BUY", level: pxN, px: pxN, sh: Math.round(shN * 100) / 100, amt: Math.round(shN * pxN * 100) / 100, tag: "补位底仓" });
                }
                need--;
              }
            }
            addIdx++;
          }
        }
      }
      // 6) 组合估值
      var navV = 0;
      codes.forEach(function (c2) {
        var s = st[c2]; if (!s || !s.active) return;
        var px2 = s.ca[ii];
        if (!isMiss(px2) && !isNaN(px2)) navV += s.pos * px2;
        navV += s.cash;
      });
      navArr[ii - startIdx] = navV;
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
      dates: cal.slice(startIdx, endIdx + 1)
    };
  }
