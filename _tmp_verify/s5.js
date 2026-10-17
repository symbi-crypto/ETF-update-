// ============================================================
// js_engine.js — ETF动量轮动引擎（JavaScript 版）
// 与 engine.py 语义完全一致：
//   收盘决策 -> 次日开盘换仓（无前视）；成本在换仓日开盘扣减；
//   动量得分 = 对数收盘价 OLS 年化斜率 × R²；
//   走弱期 = 4 指数 MA 迟滞切换；可选海外池/空仓/全池轮动。
// 双环境：node（CommonJS 导出）/ 浏览器（挂 window.WufuEngine）
// ============================================================
(function (global) {
  "use strict";
  // 数据源统一入口：浏览器由 UI 块把已解析的数据挂到 global.D（node 独立测试同理）。引擎内部一律经此取数。
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
    function holdingWeights(mode, codes, i, lookback) {
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
        var W = lookback || 20;
        seg = [];
        for (kk2 = Math.max(0, i - W); kk2 <= i; kk2++) if (!isMiss(closes[c2][kk2])) seg.push(closes[c2][kk2]);
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
      var T = lookback || 20, rets = [];
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
      if (L < Math.min(30, T)) return invVolRel();
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
    // 预热起点 = 策略保存时的起始日期（_warm_start）：warmStartPos~startPos 段只算指标/因子、不出交易、不进入净值
    var warmStartPos = 0;
    var warmStartDate = params.warm_start || params._warm_start;   // 兼容新参数名与保存固化字段
    if (warmStartDate) { while (warmStartPos < n && cal[warmStartPos] < warmStartDate) warmStartPos++; }
    else warmStartPos = startPos;
    var warmup = 40;
    // P2-10：预热按 needOf(f) 校验（ma_vs_ma_lag 需 max(w1, w2+w3)），避免前期用不完整窗口
    (params.factors || []).forEach(function (f) { warmup = Math.max(warmup, needOf(f) || 20); });
    var endPos = n - 1;
    if (params.end_date) { while (endPos >= 0 && cal[endPos] > params.end_date) endPos--; }
    if (startPos > endPos) {
      if (startPos >= n) throw new Error("起始日期晚于最新行情日期（" + cal[n - 1] + "），请等待行情数据更新后重试");
      throw new Error("结束日期早于起始日期");
    }
    // 预热段不足（未修改起始日期时 warmStartPos===startPos 恒成立）→ 保持原区间内预热逻辑与报错，行为与之前完全一致
    if (warmStartPos + warmup > startPos) {
      if (startPos + warmup + 5 > endPos + 1) throw new Error("回测区间过短，无法完成动量预热");
    }

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
    var tradeRecords = [], txRecords = [];
    var targetW = null;   // 再平衡目标权重（决策日更新，供偏离触发检查基准）
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
    var attrSnap = [];   // 单因子归因快照（仅轮动）：决策后权重 wNew2 + 候选池因子标准化值 fsR.full
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
            // 逐笔成交记录（未复权价 raw_open，供「交易明细」展示；金额=引擎记账口径不含成本；数量由渲染层按未复权价整手取整）
            var fundNow = nav * params.initial_capital;
            if (wSell > 0 && blk2 !== "sell" && okC0 && okO) { var rpS = rawOpens[code2] ? rawOpens[code2][i] : null; txRecords.push({ d: cal[i], code: code2, side: "SELL", raw_px: (rpS > 0) ? rpS : null, amt: wSell * fundNow * (o1 / c0b) }); }
            if (wBuy > 0 && blk2 !== "buy" && okO && okC1) { var rpB = rawOpens[code2] ? rawOpens[code2][i] : null; txRecords.push({ d: cal[i], code: code2, side: "BUY", raw_px: (rpB > 0) ? rpB : null, amt: wBuy * fundNow }); }
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
      // 再平衡偏离触发：非周期日实际权重偏离目标权重任一标的大于 reb_dev_pct 即触发再平衡（逐日检查，基于当日漂移后实际权重）
      var rebDevTrig = false;
      if (isReb && targetW && params.reb_dev_pct && params.reb_band_on !== false) {
        var devThr = (+params.reb_dev_pct) / 100;
        for (var dkR = 0; dkR < nAssets; dkR++) {
          if (wOld[dkR] > 0 || targetW[dkR] > 0) {
            if (Math.abs(wOld[dkR] - targetW[dkR]) > devThr) { rebDevTrig = true; break; }
          }
        }
      }
      // 勾选触发：调仓周期(reb_period_on)或偏离目标范围(reb_band_on)任一触发；i === startPos 首日强制建仓决策（不受勾选限制，保证初始仓位成立）
      if (((((params.reb_period_on !== false) && decisionIdx[i]) || ((params.reb_band_on !== false) && rebDevTrig)) || i === startPos) && i + 1 < n) {
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
          var rsty = params.reb_style || "equal";
          var codesH2 = [];
          for (var ckR0 = 0; ckR0 < nAssets; ckR0++) if ((rwM[codes[ckR0]] || 0) > 0) codesH2.push(codes[ckR0]);
          // 比例模式无有效比例数据（旧策略无比例/手填全 0/等比例时权重已在 getParams 组好）：按已上市全部标等权兜底
          if (codesH2.length === 0 && rwm2 === "fixed") {
            for (var ckR0b = 0; ckR0b < nAssets; ckR0b++) codesH2.push(codes[ckR0b]);
          }
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
            var relW2 = holdingWeights(rwm2, codesH3, i, params.reb_lookback);
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
          targetW = wNew2.slice();   // 记录再平衡目标权重（偏离触发基准）
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
          // 单因子归因快照（仅轮动）：决策后权重 + 候选池因子标准化值（fsR.full 含各因子 fv）
          if (!isReb && fsR && fsR.full && fsR.full.length > 1) {
            attrSnap.push({ i: i, full: fsR.full.slice(), w: wNew2.slice() });
          }
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
            if (!isMiss(c0) && !isMiss(c1) && c0 > 0) { var rkFall = (idleC === code && params.fallback_when_no_signal === "money") ? rfDaily : (c1 / c0 - 1); r += wOld[k] * rkFall; if (isReb) wOld[k] *= (1 + rkFall); }
          }
        }
        // 再平衡修复：非调仓日（未执行）按各标的当日收益漂移真实权重——决策日目标比例 vs 漂移后权重产生调仓买卖，实现真正再平衡；归一化保持权重和为 1
        if (isReb) {
          var sWDr = 0;
          for (k = 0; k < nAssets; k++) sWDr += wOld[k];
          if (sWDr > 1e-9 && Math.abs(sWDr - 1) > 1e-9) for (k = 0; k < nAssets; k++) wOld[k] /= sWDr;
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
    // 需求·绩效补全：Sortino（下行波动，仅负收益期）/ IR（vs 基准）/ 平均资金占用率 / 占用口径年化
    var downSq = 0, qi2;
    for (qi2 = 0; qi2 < rets.length; qi2++) { var rr2 = rets[qi2]; if (!isNaN(rr2) && rr2 < 0) downSq += rr2 * rr2; }
    var downDev = rets.length > 0 ? Math.sqrt(downSq / rets.length) : 0;
    var sortino = downDev > 0 ? (meanR - rfDaily) / downDev * Math.sqrt(ann) : 0;
    var exA = [], bi3;
    for (bi3 = 1; bi3 < dailyR.length; bi3++) {
      var dr3 = dailyR[bi3], db3 = benchD[bi3];
      if (isNaN(dr3) || isNaN(db3)) continue;
      exA.push(dr3 - db3);
    }
    var exM = 0;
    for (bi3 = 0; bi3 < exA.length; bi3++) exM += exA[bi3];
    if (exA.length) exM /= exA.length;
    var exSd = 0;
    for (bi3 = 0; bi3 < exA.length; bi3++) exSd += (exA[bi3] - exM) * (exA[bi3] - exM);
    exSd = exA.length > 1 ? Math.sqrt(exSd / (exA.length - 1)) : 0;
    var ir = exSd > 0 ? (exM * ann) / (exSd * Math.sqrt(ann)) : 0;
    var expSum = 0, expN = 0, bi4;
    for (bi4 = 0; bi4 < expV.length; bi4++) { var ev4 = expV[bi4]; if (ev4 != null && !isNaN(ev4)) { expSum += ev4; expN++; } }
    var avgExposure = expN > 0 ? expSum / expN : 1;
    var occCagr = (avgExposure > 0 && avgExposure !== 1) ? Math.pow(1 + cagr, 1 / avgExposure) - 1 : cagr;
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

    var finalHold = {};
    for (var fk = 0; fk < nAssets; fk++) if (wOld[fk] > 0) finalHold[codes[fk]] = wOld[fk];
    return {
      calendar: calS, nav: navV, bench_nav: benchV, ew_nav: ewV,
      bh_nav: ewV,   // 买入持有对照：选中标的等权、不调仓（ewNav 切片），供再平衡 WFO 相对买入持有超额
      drawdown: ddV, bench_drawdown: benchDD, daily_ret: dailyR,
      holdings: holdV, regime: regV, exposure: expV,
      final_hold: finalHold,   // 末态持仓权重 {code: weight}（轮动/再平衡详情「当前持仓」数据源）
      trades: tradeRecords, tx: txRecords, pool: codes,
      ic_snapshots: icSnapshots, ic_snapshots_full: icSnapshotsFull,
      metrics: {
        total_return: totalReturn, cagr: cagr, max_dd: maxDD,
        sharpe: sharpe, vol: vol, calmar: calmar,
        sortino: sortino, ir: ir, avg_exposure: avgExposure, occ_cagr: occCagr,
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
        ,
        // 单因子收益归因（仅轮动）：每调仓期 暴露×因子收益（高减低分组），Barra-lite 口径
        attribution: (function () {
          if (isReb || !attrSnap.length) return null;
          var rankFs2 = (params.factors || []).filter(function (f) { return (f.usage || "rank") === "rank"; });
          if (!rankFs2.length) return null;
          function fkey2(f) {
            return (f.kind || "roc") + ":" + (f.window || 20) + ":" + (f.window2 || 0) + ":" + (f.window3 || 0) + ":" + (f.formula_parts ? JSON.stringify(f.formula_parts.map(function (pp) { return pp.kind + ":" + (pp.window || 0) + ":" + (pp.window2 || 0) + ":" + (pp.window3 || 0) + ":" + (pp.coef || 0); })) : "");
          }
          function flabel(f) {
            if (f.kind === "custom") return f.name || "自定义因子";
            var nm = { roc: "涨幅", slope: "斜率动量", vol: "波动率", ma: "均线偏离", ma_vs_ma: "均线关系", ma_vs_ma_lag: "均线滞后", ret: "收益" }[f.kind] || f.kind;
            return nm + (f.window ? "(" + f.window + ")" : "");
          }
          var fTot = new Array(rankFs2.length).fill(0);
          var pTot = 0, mSum = 0;
          for (var ai = 0; ai < attrSnap.length; ai++) {
            var sn = attrSnap[ai];
            var t0 = sn.i, t1 = (ai + 1 < attrSnap.length) ? attrSnap[ai + 1].i : endPos;
            var wMap = {};
            for (var ww = 0; ww < nAssets; ww++) { if (sn.w[ww] > 0) wMap[codes[ww]] = sn.w[ww]; }
            var retB = {};
            for (var cc in wMap) {
              var cArr2 = closes[cc];
              var v0 = cArr2[t0], v1 = cArr2[t1];
              if (!isMiss(v0) && !isMiss(v1) && v0 > 0) retB[cc] = v1 / v0 - 1;
            }
            var rp = 0;
            for (var cc in wMap) if (retB[cc] !== undefined) rp += wMap[cc] * retB[cc];
            pTot += rp;
            var fSum = 0;
            for (var fi = 0; fi < rankFs2.length; fi++) {
              var f2 = rankFs2[fi], key2 = fkey2(f2);
              var pairs = [];
              for (var fx = 0; fx < sn.full.length; fx++) {
                var el2 = sn.full[fx];
                if (el2.fv && el2.fv[key2] !== undefined) pairs.push({ code: el2.code, z: el2.fv[key2], r: retB[el2.code] !== undefined ? retB[el2.code] : 0 });
              }
              if (pairs.length < 2) continue;
              pairs.sort(function (a, b) { return b.z - a.z; });
              var nT = Math.max(1, Math.round(pairs.length * 0.3));
              var tR = 0, bR = 0, tq;
              for (tq = 0; tq < nT; tq++) tR += pairs[tq].r;
              for (tq = pairs.length - nT; tq < pairs.length; tq++) bR += pairs[tq].r;
              tR /= nT; bR /= nT;
              var rF = tR - bR;
              var expo = 0;
              for (var ex2 = 0; ex2 < pairs.length; ex2++) { var ww2 = wMap[pairs[ex2].code]; if (ww2) expo += ww2 * pairs[ex2].z; }
              var cf = expo * rF;
              fTot[fi] += cf; fSum += cf;
            }
            mSum += rp - fSum;
          }
          var cap = params.initial_capital || 1000000;
          return {
            factors: rankFs2.map(function (f, idx) { return { name: flabel(f), contrib: fTot[idx] * cap, pct: pTot !== 0 ? fTot[idx] / pTot : 0 }; }),
            market: { name: "宽基/其他", contrib: mSum * cap, pct: pTot !== 0 ? mSum / pTot : 0 },
            total: pTot * cap,
            capital: cap,
            n_periods: attrSnap.length,
            method: "每调仓期按候选池因子标准化得分排序，前30%组合收益−后30%组合收益为该期因子收益；因子贡献=持仓组合因子暴露(Σ权重×标准化得分)×因子收益；宽基/其他=组合收益−Σ因子贡献（含市场beta与残差）；各期收益为简单加总口径，非净值复合"
          };
        })()
      }
    };
  }

  var api = { backtest: backtest, momentumMetrics: momentumMetrics, rollingMA: rollingMA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.WufuEngine = api;
})(this);
