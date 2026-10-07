// ic_view.js —— 因子 IC 分析视图（信息系数：因子值 vs 未来收益的截面秩相关）
// 独立于回测：对所选标的池、多因子、未来收益窗口 N、截面频率，计算每个因子的
// 平均 IC、ICIR（IC 均值/IC 标准差）、有效占比，输出 IC 时间序列与衰减曲线。
(function () {
  var IC_KINDS = {
    roc: "涨幅", slope_r2: "斜率动量", wslope_r2: "加权斜率", vol: "波动率", risk_adj: "风险调整动量",
    r2: "R²阈值", c_vs_ma: "收盘vs均线", c_vs_ma_lag: "收盘vs前均线", ma_vs_ma: "均线vs均线", ma_vs_ma_lag: "均线vs前均线",
    ma: "N日均线", ma_lag: "N日前均线", close: "后复权收盘", open: "开盘价", high: "最高价", low: "最低价",
    amplitude: "日内振幅", position: "日内位置", rsi: "RSI", amount: "成交额", volume: "成交量", turnover: "换手率", vol_ratio: "放量比", rsrs: "RSRS"
  };
  window.IC_KINDS = IC_KINDS;
  var icSel = {}, fSel = {};   // 标的池 / 因子的勾选状态（首次默认不勾选，重渲染保留）
  function poolMeta(D) {
    var list = (D.pool || []).slice();
    (D.indexNames || []).forEach(function (inm) {
      if (!list.some(function (p) { return p.code === inm.code; }))
        list.push({ code: inm.code, name: inm.name, group: "指数" });
    });
    return list;
  }
  function isMiss(v) { return v === null || v === undefined || (typeof v === "number" && (isNaN(v) || v < 0)); }

  // ---- 动量得分（与 js_engine 同构）----
  function momentumMetrics(closes, w, ann) {
    var i, n = w, y = new Array(n);
    for (i = 0; i < n; i++) y[i] = Math.log(closes[i]);
    var xm = (w - 1) / 2, ym = 0;
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
  function weightedMomentumMetrics(closes, w, ann) {
    var i, n = w, y = new Array(n), wt = new Array(n);
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
  function maAt(arr, i, w) {
    if (i + 1 < w) return NaN;
    var s = 0, j;
    for (j = i - w + 1; j <= i; j++) { if (isMiss(arr[j])) return NaN; s += arr[j]; }
    return s / w;
  }
  function sumAt(arr, i, w) {
    if (i + 1 < w) return NaN;
    var s = 0, j;
    for (j = i - w + 1; j <= i; j++) { if (isMiss(arr[j])) return NaN; s += arr[j]; }
    return s;
  }
  function olsSlope(xs, ys) {
    var n = xs.length, mx = 0, my = 0, tt;
    for (tt = 0; tt < n; tt++) { mx += xs[tt]; my += ys[tt]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0;
    for (tt = 0; tt < n; tt++) { sxy += (xs[tt] - mx) * (ys[tt] - my); sxx += (xs[tt] - mx) * (xs[tt] - mx); }
    return sxx < 1e-12 ? 0 : sxy / sxx;
  }

  // ---- 因子值计算（与 js_engine factorValue 同构；不依赖回测闭包）----
  function factorValAt(seq, kind, code, i, f, ann) {
    var w1 = f.window || 20, w2 = f.window2 || 0, w3 = f.window3 || 0;
    var closes = seq.closes, cArr = closes[code];
    if (!cArr) return NaN;
    if (kind === "custom") {
      var parts = f.formula_parts || [];
      if (parts.length < 2) return NaN;
      var vals = [], i2;
      for (i2 = 0; i2 < parts.length; i2++) {
        var pp = parts[i2];
        var pv = factorValAt(seq, pp.kind, code, i, { window: pp.window, window2: pp.window2, window3: pp.window3 }, ann);
        if (isNaN(pv)) return NaN;
        vals.push((pp.coef || 0) * pv);
      }
      var stack = [vals[0]];
      for (i2 = 1; i2 < vals.length; i2++) {
        var op2 = parts[i2].op || "+", vi = vals[i2];
        if (op2 === "×" || op2 === "*" || op2 === "x") stack[stack.length - 1] = stack[stack.length - 1] * vi;
        else if (op2 === "÷" || op2 === "/") { if (vi === 0) return NaN; stack[stack.length - 1] = stack[stack.length - 1] / vi; }
        else if (op2 === "-" || op2 === "−") stack.push(-vi);
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
      var mm = kind === "wslope_r2" ? weightedMomentumMetrics(seg2, w1, ann) : momentumMetrics(seg2, w1, ann);
      return kind === "r2" ? mm.r2 : mm.annSlope * mm.r2;
    }
    if (kind === "vol" || kind === "risk_adj") {
      if (i + 1 < w1) return NaN;
      var seg3 = cArr.slice(i - w1 + 1, i + 1), rets = [], t2;
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
      var vol = sd * Math.sqrt(ann);
      if (kind === "vol") return vol;
      return vol > 0 ? (seg3[seg3.length - 1] / seg3[0] - 1) / vol : 0;
    }
    var amts = seq.amts, vols = seq.vols, turnovers = seq.turnovers;
    if (kind === "amount") return sumAt(amts[code], i, w1) / w1;
    if (kind === "volume") return sumAt(vols[code], i, w1) / w1;
    if (kind === "turnover") {
      var tArr = turnovers[code]; if (!tArr) return NaN;
      var loT = i - w1 + 1, sT = 0, cT = 0;
      for (var jT = Math.max(0, loT); jT <= i; jT++) { var tv = tArr[jT]; if (tv === -1 || tv == null || isNaN(tv)) return NaN; sT += tv; cT++; }
      return cT ? sT / cT : NaN;
    }
    if (kind === "vol_ratio") {
      var m1v = sumAt(vols[code], i, w1) / w1;
      var loM = i - w2 - w2 + 1;
      if (loM < 0) return NaN;
      var m2v = sumAt(vols[code], i - w2, w2) / w2;
      if (!(m2v > 0) || isNaN(m2v)) return NaN;
      return m1v / m2v;
    }
    if (kind === "rsrs") {
      if (i + 1 < w1) return NaN;
      var highs = seq.highs, lows = seq.lows, hs = [], ls = [], j2;
      for (j2 = i - w1 + 1; j2 <= i; j2++) {
        if (isMiss(highs[code][j2]) || isMiss(lows[code][j2])) return NaN;
        hs.push(highs[code][j2]); ls.push(lows[code][j2]);
      }
      return olsSlope(hs, ls);
    }
    if (kind === "premium") {
      var rc = seq.rawCloses[code], nv = seq.navs[code];
      if (!rc || !nv) return NaN;
      var sumP = 0, cntP = 0, j3;
      for (j3 = i - w1 + 1; j3 <= i; j3++) {
        var pc = rc[j3], pn = nv[j3];
        if (isMiss(pc) || isMiss(pn) || pn <= 0) return NaN;
        sumP += (pc / pn - 1.0); cntP++;
      }
      return sumP / cntP * 100.0;
    }
    if (kind === "c_vs_ma") { var m1 = maAt(cArr, i, w1); return isNaN(m1) ? NaN : cArr[i] / m1 - 1; }
    if (kind === "c_vs_ma_lag") { var m2 = maAt(cArr, i - w1, w2); return isNaN(m2) ? NaN : cArr[i] / m2 - 1; }
    if (kind === "ma_vs_ma") { var mn1 = maAt(cArr, i, w1), mm1 = maAt(cArr, i, w2); return (isNaN(mn1) || isNaN(mm1)) ? NaN : mn1 / mm1 - 1; }
    if (kind === "ma_vs_ma_lag") { var mn2 = maAt(cArr, i, w1), mm2 = maAt(cArr, i - w2, w3); return (isNaN(mn2) || isNaN(mm2)) ? NaN : mn2 / mm2 - 1; }
    if (kind === "close") return cArr[i];
    if (kind === "open") { var oArr = seq.opens[code]; return isMiss(oArr[i]) ? NaN : oArr[i]; }
    if (kind === "high") { var hArr = seq.highs[code]; return isMiss(hArr[i]) ? NaN : hArr[i]; }
    if (kind === "low") { var lArr = seq.lows[code]; return isMiss(lArr[i]) ? NaN : lArr[i]; }
    if (kind === "ma") { var m1b = maAt(cArr, i, w1); return isNaN(m1b) ? NaN : m1b; }
    if (kind === "ma_lag") { var m2b = maAt(cArr, i - w1, w2); return isNaN(m2b) ? NaN : m2b; }
    if (kind === "amplitude") {
      var hA = seq.highs[code][i], lA = seq.lows[code][i];
      if (isMiss(hA) || isMiss(lA) || lA <= 0) return NaN;
      return (hA - lA) / lA;
    }
    if (kind === "position") {
      var hP = seq.highs[code][i], lP = seq.lows[code][i];
      if (isMiss(hP) || isMiss(lP) || hP <= lP) return NaN;
      return (cArr[i] - lP) / (hP - lP);
    }
    if (kind === "rsi") {
      if (i + 1 < w1) return NaN;
      var segR = cArr.slice(i - w1 + 1, i + 1);
      for (var qr = 0; qr < segR.length; qr++) if (isMiss(segR[qr])) return NaN;
      var gR = 0, lR = 0, tr;
      for (tr = 1; tr < segR.length; tr++) { var dR = segR[tr] - segR[tr - 1]; if (dR > 0) gR += dR; else lR -= dR; }
      if (gR + lR <= 0) return NaN;
      return 100 * gR / (gR + lR);
    }
    return NaN;
  }

  function needOf(f) {
    var kd = f.kind, w1 = f.window || 20, w2 = f.window2 || 0, w3 = f.window3 || 0;
    if (kd === "c_vs_ma_lag" || kd === "ma_lag") return w1 + w2;
    if (kd === "ma_vs_ma") return Math.max(w1, w2);
    if (kd === "ma_vs_ma_lag") return Math.max(w1, w2 + w3);
    if (kd === "vol_ratio") return Math.max(w1, 2 * w2);
    if (kd === "custom") {
      var mx = 0;
      (f.formula_parts || []).forEach(function (pp) { mx = Math.max(mx, needOf({ kind: pp.kind, window: pp.window, window2: pp.window2, window3: pp.window3 })); });
      return mx;
    }
    return w1;
  }

  // ---- 秩相关（Spearman）----
  function rankArr(a) {
    var n = a.length, idx = new Array(n), k;
    for (k = 0; k < n; k++) idx[k] = [a[k], k];
    idx.sort(function (x, y) { return x[0] - y[0]; });
    var ranks = new Array(n), s = 0;
    while (s < n) {
      var v = idx[s][0], e = s + 1;
      while (e < n && idx[e][0] === v) e++;
      var r = (s + 1 + e) / 2;
      for (var t = s; t < e; t++) ranks[idx[t][1]] = r;
      s = e;
    }
    return ranks;
  }
  function pearson(a, b) {
    var n = a.length, ma = 0, mb = 0, t;
    for (t = 0; t < n; t++) { ma += a[t]; mb += b[t]; }
    ma /= n; mb /= n;
    var sa = 0, sb = 0, sc = 0;
    for (t = 0; t < n; t++) { sa += (a[t] - ma) * (a[t] - ma); sb += (b[t] - mb) * (b[t] - mb); sc += (a[t] - ma) * (b[t] - mb); }
    if (sa < 1e-12 || sb < 1e-12) return NaN;
    return sc / Math.sqrt(sa * sb);
  }
  function rankIC(fv, ret) {
    var n = fv.length;
    if (n < 5) return NaN;
    return pearson(rankArr(fv), rankArr(ret));
  }

  // ---- 主计算：单因子在某 futN 下的 IC 序列 ----
  function calcFactorIC(seq, kind, f, opts, calendar, codes) {
    var futN = opts.futN, freq = opts.freq, ann = opts.ann;
    var closes = seq.closes;
    var need = needOf(f);
    var L = calendar.length;
    var icList = [], dates = [], nList = [];
    for (var i = need; i + futN < L; i += freq) {
      var fvs = [], rets = [], j;
      for (j = 0; j < codes.length; j++) {
        var c = codes[j], cc = closes[c];
        if (!cc || isMiss(cc[i]) || isMiss(cc[i + futN]) || !(cc[i] > 0)) continue;
        var fv = factorValAt(seq, kind, c, i, f, ann);
        if (isNaN(fv)) continue;
        fvs.push(fv); rets.push(cc[i + futN] / cc[i] - 1);
      }
      if (fvs.length >= 5) {
        var ic = rankIC(fvs, rets);
        if (!isNaN(ic)) { icList.push(ic); dates.push(calendar[i]); nList.push(fvs.length); }
      }
    }
    return { icList: icList, dates: dates, nList: nList };
  }

  function buildSeries(D, codes) {
    var closes = {}, opens = {}, highs = {}, lows = {}, vols = {}, amts = {}, turnovers = {}, rawCloses = {}, navs = {};
    codes.forEach(function (c) {
      var s = D.series[c] || {};
      closes[c] = s.close || []; opens[c] = s.open || null; highs[c] = s.high || null;
      lows[c] = s.low || null; vols[c] = s.volume || null; amts[c] = s.amount || null;
      turnovers[c] = s.turnover || null; rawCloses[c] = s.raw_close || null; navs[c] = s.nav || null;
    });
    return { closes: closes, opens: opens, highs: highs, lows: lows, vols: vols, amts: amts, turnovers: turnovers, rawCloses: rawCloses, navs: navs };
  }

  // ---- 渲染 ----
  function renderSetup() {
    var D = window.WufuUI && WufuUI.getData ? WufuUI.getData() : null;
    if (!D) { if (window.WufuUI && WufuUI.ensureData) WufuUI.ensureData(function () { renderSetup(); }); return; }
    // 标的池：名称 + 代码，保留勾选状态
    var pool = document.getElementById("icPool");
    pool.innerHTML = "";
    var search = document.getElementById("icPoolSearch");
    var kw = search ? (search.value || "").trim().toLowerCase() : "";
    var any = false;
    poolMeta(D).forEach(function (p) {
      var show = !kw || p.code.toLowerCase().indexOf(kw) >= 0 || p.name.toLowerCase().indexOf(kw) >= 0;
      if (!show) return;
      if (!(p.code in icSel)) icSel[p.code] = false;   // 首次默认不勾选
      var lab = document.createElement("label");
      lab.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;color:#CBD5E1;cursor:pointer;padding:3px 0";
      lab.innerHTML = "<input type='checkbox' value='" + p.code + "' " + (icSel[p.code] ? "checked" : "") + "> <span style='color:#E2E8F0'>" + p.name + "</span><span style='color:#64748B;font-size:10px'>" + p.code + "</span>";
      pool.appendChild(lab);
      any = true;
    });
    if (!any) { var e2 = document.createElement("div"); e2.style.cssText = "font-size:12px;color:#94A3B8"; e2.textContent = "无匹配标的"; pool.appendChild(e2); }
    Array.prototype.forEach.call(pool.querySelectorAll("input[type=checkbox]"), function (cb) {
      cb.addEventListener("change", function () { icSel[this.value] = this.checked; });
    });
    // 因子多选：保留勾选状态
    var kinds = ["roc", "slope_r2", "wslope_r2", "vol", "risk_adj", "r2", "rsrs", "c_vs_ma", "c_vs_ma_lag", "ma_vs_ma", "ma_vs_ma_lag", "ma", "ma_lag", "close", "open", "high", "low", "amplitude", "position", "rsi", "amount", "volume", "turnover", "vol_ratio"];
    var fbox = document.getElementById("icFactors");
    fbox.innerHTML = "";
    kinds.forEach(function (k) {
      var label = (window.IC_KINDS && IC_KINDS[k]) ? IC_KINDS[k] : k;
      if (!(k in fSel)) fSel[k] = false;   // 首次默认不勾选
      var lab = document.createElement("label");
      lab.style.cssText = "display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#CBD5E1;cursor:pointer;padding:3px 7px;border:1px solid #1E293B;border-radius:4px;margin:2px";
      lab.innerHTML = "<input type='checkbox' value='" + k + "' " + (fSel[k] ? "checked" : "") + "> " + label;
      fbox.appendChild(lab);
    });
    Array.prototype.forEach.call(fbox.querySelectorAll("input[type=checkbox]"), function (cb) {
      cb.addEventListener("change", function () { fSel[this.value] = this.checked; });
    });
  }

  function run() {
    var D = window.WufuUI && WufuUI.getData ? WufuUI.getData() : null;
    if (!D) { if (window.WufuUI && WufuUI.ensureData) WufuUI.ensureData(run); return; }
    var pool = document.getElementById("icPool");
    var codes = [], cs = pool.querySelectorAll("input:checked");
    for (var q = 0; q < cs.length; q++) codes.push(cs[q].value);
    if (codes.length < 3) { showMsg("请至少勾选 3 个标的"); return; }
    var fbox = document.getElementById("icFactors");
    var selKinds = [], fs = fbox.querySelectorAll("input:checked");
    for (var q2 = 0; q2 < fs.length; q2++) selKinds.push(fs[q2].value);
    if (!selKinds.length) { showMsg("请至少勾选 1 个因子"); return; }
    var futN = parseInt(document.getElementById("icFutN").value, 10) || 20;
    var freqMap = { daily: 1, weekly: 5, monthly: 21 };
    var freq = freqMap[document.getElementById("icFreq").value] || 5;
    var ann = 252;
    var btn = document.getElementById("icRun");
    if (btn) { btn.disabled = true; btn.textContent = "计算中…"; }
    setTimeout(function () {
      try {
        var seq = buildSeries(D, codes);
        var calendar = D.calendar;
        // 主 futN 的排名与时间序列
        var rows = [], seriesData = {};
        selKinds.forEach(function (k) {
          var f = { kind: k, window: 20, window2: 5, window3: 20 };
          if (k === "vol" || k === "risk_adj") f.window = 60;
          if (k === "c_vs_ma_lag" || k === "ma_lag" || k === "ma_vs_ma_lag") { f.window = 5; f.window2 = 20; f.window3 = 20; }
          if (k === "vol_ratio") { f.window = 20; f.window2 = 60; }
          var r = calcFactorIC(seq, k, f, { futN: futN, freq: freq, ann: ann }, calendar, codes);
          if (!r.icList.length) return;
          var mean = 0, t;
          for (t = 0; t < r.icList.length; t++) mean += r.icList[t];
          mean /= r.icList.length;
          var sd = 0;
          for (t = 0; t < r.icList.length; t++) sd += (r.icList[t] - mean) * (r.icList[t] - mean);
          sd = Math.sqrt(sd / r.icList.length);
          var pos = 0;
          for (t = 0; t < r.icList.length; t++) if (r.icList[t] > 0) pos++;
          rows.push({ kind: k, label: (window.IC_KINDS && IC_KINDS[k]) || k, mean: mean, icir: sd > 0 ? mean / sd : 0, posRate: r.icList.length ? pos / r.icList.length : 0, n: r.icList.length, dates: r.dates, icList: r.icList });
        });
        rows.sort(function (a, b) { return Math.abs(b.mean) - Math.abs(a.mean); });
        if (!rows.length) { showMsg("所选标的/因子下未算出有效 IC（每截面需至少 5 个有效标的），请增加标的数或调整参数"); return; }
        renderRank(rows);
        renderSeries(rows);
        renderDecay(seq, codes, calendar, freq, ann, rows);
        showMsg("完成：因子 " + rows.length + " 个 × 标的 " + codes.length + " 只，未来收益窗口 " + futN + " 日");
      } catch (e) { showMsg("计算出错：" + e.message); }
      if (btn) { btn.disabled = false; btn.textContent = "开始计算"; }
    }, 30);
  }

  function showMsg(t) {
    var el = document.getElementById("icMsg");
    if (!el) return;
    el.textContent = t;
    el.style.display = t ? "" : "none";
  }

  function renderRank(rows) {
    var tb = document.getElementById("icRankBody");
    if (!tb) return;
    document.getElementById("icRankWrap").style.display = rows.length ? "" : "none";
    tb.innerHTML = "";
    rows.forEach(function (r, idx) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (idx + 1) + "</td><td>" + r.label + "</td><td style='color:" + (r.mean >= 0 ? "#34D399" : "#F87171") + "'>" + (r.mean > 0 ? "+" : "") + r.mean.toFixed(3) + "</td><td>" + r.icir.toFixed(2) + "</td><td>" + (r.posRate * 100).toFixed(0) + "%</td><td>" + r.n + "</td>";
      tb.appendChild(tr);
    });
  }

  function renderSeries(rows) {
    var el = document.getElementById("icSeriesChart");
    if (!el || !window.echarts) return;
    var top = rows.slice(0, 5);
    var wrap = document.getElementById("icSeriesWrap");
    if (wrap) wrap.style.display = top.length ? "" : "none";
    if (!top.length) return;
    var dates = top[0].dates;
    var series = top.map(function (r) {
      return { name: r.label, type: "line", symbol: "none", data: r.icList, smooth: true };
    });
    var option = {
      tooltip: { trigger: "axis", triggerOn: "click", renderMode: "richText", confine: true },
      legend: { type: "scroll", textStyle: { color: "#94A3B8", fontSize: 10 }, top: 26, height: 26, iconSize: 9, pageIconColor: "#94A3B8", pageTextStyle: { color: "#94A3B8" } },
      grid: { left: 44, right: 14, top: 58, bottom: 28, containLabel: true },
      xAxis: { type: "category", data: dates, axisLabel: { color: "#64748B", fontSize: 10, interval: "auto", formatter: function (v) { return (v || "").slice(0, 4); } } },
      yAxis: { type: "value", axisLabel: { color: "#64748B", fontSize: 10 }, splitLine: { lineStyle: { color: "#1E293B" } } },
      series: series
    };
    var chart = echarts.getInstanceByDom(el) || echarts.init(el);
    chart.setOption(option, true);
    chart.resize();
  }

  function renderDecay(seq, codes, calendar, freq, ann, rows) {
    var el = document.getElementById("icDecayChart");
    if (!el || !window.echarts) return;
    var futNs = [5, 10, 20, 40];
    var top = rows.slice(0, 8);
    var wrap = document.getElementById("icDecayWrap");
    if (wrap) wrap.style.display = top.length ? "" : "none";
    if (!top.length) return;
    var series = top.map(function (r) {
      var k = r.kind, f = { kind: k, window: 20, window2: 5, window3: 20 };
      if (k === "vol" || k === "risk_adj") f.window = 60;
      if (k === "c_vs_ma_lag" || k === "ma_lag" || k === "ma_vs_ma_lag") { f.window = 5; f.window2 = 20; f.window3 = 20; }
      if (k === "vol_ratio") { f.window = 20; f.window2 = 60; }
      var means = futNs.map(function (fn) {
        var rr = calcFactorIC(seq, k, f, { futN: fn, freq: freq, ann: ann }, calendar, codes);
        if (!rr.icList.length) return 0;
        var m = 0, t;
        for (t = 0; t < rr.icList.length; t++) m += rr.icList[t];
        return m / rr.icList.length;
      });
      return { name: r.label, type: "line", symbol: "circle", symbolSize: 5, data: means, smooth: true };
    });
    var option = {
      tooltip: { trigger: "axis", triggerOn: "click", renderMode: "richText", confine: true },
      legend: { type: "scroll", textStyle: { color: "#94A3B8", fontSize: 10 }, top: 26, height: 26, iconSize: 9, pageIconColor: "#94A3B8", pageTextStyle: { color: "#94A3B8" } },
      grid: { left: 44, right: 16, top: 58, bottom: 28, containLabel: true },
      xAxis: { type: "category", data: futNs.map(function (n) { return n + "日"; }), axisLabel: { color: "#64748B", fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { color: "#64748B", fontSize: 10 }, splitLine: { lineStyle: { color: "#1E293B" } } },
      series: series
    };
    var chart = echarts.getInstanceByDom(el) || echarts.init(el);
    chart.setOption(option, true);
    chart.resize();
  }

  window.ICView = { render: renderSetup, run: run, calcFactorIC: calcFactorIC, buildSeries: buildSeries };
})();
