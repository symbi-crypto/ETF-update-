// ===== 相关性分析视图（并入主系统，复用同一份行情数据 D） =====
(function () {
  if (window.CorrView) return;
  var $ = function (id) { return document.getElementById(id); };
  var COLOR = "#38BDF8";
  var checked = [];  // 默认不勾选任何标的（可全选 / 推荐分散组合一键勾选）
  var inited = false;

  function poolMeta() {
    var D = WufuUI.getData();
    var list = (D.pool || []).slice();
    (D.indexNames || []).forEach(function (inm) {
      if (!list.some(function (p) { return p.code === inm.code; }))
        list.push({ code: inm.code, name: inm.name, group: "指数" });
    });
    return list;
  }

  function renderPool() {
    var grid = $("corrPool"); if (!grid) return;
    grid.innerHTML = "";
    var kw = ($("corrSearch").value || "").trim().toLowerCase();
    var byGroup = {};
    poolMeta().forEach(function (p) {
      if (kw && p.code.toLowerCase().indexOf(kw) < 0 && p.name.toLowerCase().indexOf(kw) < 0) return;
      (byGroup[p.group] = byGroup[p.group] || []).push(p);
    });
    var rows = [];
    Object.keys(byGroup).forEach(function (g) {
      rows.push('<div class="corr-grp">' + g + "</div>");
      byGroup[g].forEach(function (p) {
        var on = checked.indexOf(p.code) >= 0 ? "checked" : "";
        rows.push('<label class="corr-item"><input type="checkbox" data-c="' + p.code + '" ' + on + '><span class="corr-nm">' + p.name + '</span><span class="corr-cd">' + p.code + "</span></label>");
      });
    });
    grid.innerHTML = rows.join("");
    Array.prototype.forEach.call(grid.querySelectorAll("input[type=checkbox]"), function (cb) {
      cb.addEventListener("change", function () {
        var c = this.getAttribute("data-c");
        var i = checked.indexOf(c);
        if (this.checked && i < 0) checked.push(c);
        if (!this.checked && i >= 0) checked.splice(i, 1);
        if ($("corrResult").style.display !== "none") compute();
      });
    });
  }

  function closeFor(code) {
    var D = WufuUI.getData();
    var s = D.series && D.series[code];
    if (s && s.close) return s.close;
    if (D.index && D.index[code]) return D.index[code]; // list
    return null;
  }

  function nameOf(code) {
    var m = poolMeta().filter(function (p) { return p.code === code; })[0];
    return m ? m.name : code;
  }
  function groupOf(code) {
    var m = poolMeta().filter(function (p) { return p.code === code; })[0];
    return m ? m.group : "";
  }

  function weekKey(d) {
    var dt = new Date(d.replace(/-/g, "/"));
    var one = 86400000, day = dt.getDay() || 7;
    var thurs = new Date(dt.getTime() + (4 - day) * one);
    var y = thurs.getFullYear(), start = new Date(y, 0, 1);
    var week = Math.ceil(((thurs - start) / one + 1) / 7);
    return y + "-W" + week;
  }
  function periodEnds(validIdx, freq) {
    var cal = WufuUI.getData().calendar;
    var ends = [], lastKey = null, lastT = null;
    for (var i = 0; i < validIdx.length; i++) {
      var d = cal[validIdx[i]];
      var key = freq === "weekly" ? weekKey(d) : d.slice(0, 7);
      if (lastKey !== null && key !== lastKey) ends.push(lastT);
      lastKey = key; lastT = validIdx[i];
    }
    if (lastT !== null) ends.push(lastT);
    return ends;
  }

  function pearson(x, y) {
    var n = x.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    var cov = 0, vx = 0, vy = 0;
    for (i = 0; i < n; i++) { var dx = x[i] - mx, dy = y[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy; }
    if (vx === 0 || vy === 0) return 0;
    return cov / Math.sqrt(vx * vy);
  }

  function compute() {
    if (checked.length < 2) { corrTip("请至少勾选 2 个标的"); return; }
    var start = $("corrStart").value, end = $("corrEnd").value, freq = $("corrFreq").value;
    if (!start || !end || end < start) { corrTip("日期区间无效"); return; }
    var D = WufuUI.getData(), cal = D.calendar;
    var si = -1, ei = -1, i;
    for (i = 0; i < cal.length; i++) { if (cal[i] >= start) { si = i; break; } }
    for (i = cal.length - 1; i >= 0; i--) { if (cal[i] <= end) { ei = i; break; } }
    if (si < 0 || ei < si) { corrTip("日期超出数据范围"); return; }
    var codes = checked.slice(), mat = {};
    codes.forEach(function (c) { mat[c] = closeFor(c); });
    var validIdx = [];
    for (var t = si; t <= ei; t++) {
      var ok = true;
      for (var k = 0; k < codes.length; k++) { var v = mat[codes[k]] && mat[codes[k]][t]; if (!(v > 0)) { ok = false; break; } }
      if (ok) validIdx.push(t);
    }
    if (validIdx.length < 10) { corrTip("共同交易日不足（" + validIdx.length + " 天），请调整区间或标的"); return; }
    var P = codes.map(function (c) { return validIdx.map(function (t) { return mat[c][t]; }); });
    // 收益率
    var R;
    if (freq === "daily") {
      R = P.map(function (px) { var r = []; for (var i2 = 1; i2 < px.length; i2++) { var a = px[i2 - 1], b = px[i2]; if (a > 0 && b > 0) r.push(b / a - 1); } return r; });
    } else {
      var perIdx = periodEnds(validIdx, freq);
      if (perIdx.length < 10) { corrTip("周期样本不足（" + perIdx.length + "），请改用更高频或更长区间"); return; }
      var PP = P.map(function (px) { return perIdx.map(function (t) { return px[validIdx.indexOf(t)]; }); });
      R = PP.map(function (px) { var r = []; for (var i3 = 1; i3 < px.length; i3++) { var a2 = px[i3 - 1], b2 = px[i3]; if (a2 > 0 && b2 > 0) r.push(b2 / a2 - 1); } return r; });
    }
    var n = codes.length, C = [];
    for (var a = 0; a < n; a++) { C[a] = []; for (var b = 0; b < n; b++) C[a][b] = a === b ? 1 : pearson(R[a], R[b]); }
    var avg = codes.map(function (c, ai) { var s = 0; for (var bb = 0; bb < n; bb++) if (bb !== ai) s += C[ai][bb]; return { code: c, name: nameOf(c), avg: s / (n - 1) }; });
    avg.sort(function (x, y) { return x.avg - y.avg; });
    var pairs = [];
    for (var a2 = 0; a2 < n; a2++) for (var b2 = a2 + 1; b2 < n; b2++) pairs.push({ a: a2, b: b2, v: C[a2][b2] });
    pairs.sort(function (x, y) { return x.v - y.v; });
    renderKPIs(n, validIdx.length, codes, C, avg);
    renderPairs(pairs, codes);
    $("corrResult").style.display = "";
    $("corrNote").textContent = "口径说明：相关系数基于所选标的在「" + start + " ~ " + end + "」区间的" +
      (freq === "daily" ? "日" : (freq === "weekly" ? "周" : "月")) + "收益率序列（Pearson）。平均相关度 = 该标的与其余所选标的相关系数的算术平均，越低说明与其他标的重合度越小、越利于分散风险。低相关组合按两两相关系数升序取最低 20 对。";
  }

  function fmt(v) { return (Math.round(v * 1000) / 1000).toFixed(2); }

  function renderKPIs(n, days, codes, C, avg) {
    var allAvg = avg.reduce(function (s, x) { return s + x.avg; }, 0) / avg.length;
    var lo = avg[0], hi = avg[avg.length - 1], minPair = 1;
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) minPair = Math.min(minPair, C[a][b]);
    $("corrKpis").innerHTML =
      '<div class="corr-kpi"><div class="k">所选标的</div><div class="v">' + n + '</div><div class="s">只</div></div>' +
      '<div class="corr-kpi"><div class="k">共同交易日</div><div class="v">' + days + '</div><div class="s">交易日</div></div>' +
      '<div class="corr-kpi"><div class="k">平均相关度</div><div class="v" style="color:' + (allAvg < 0.5 ? "#34D399" : "#FBBF24") + '">' + fmt(allAvg) + '</div><div class="s">越低越分散</div></div>' +
      '<div class="corr-kpi"><div class="k">最低相关标的</div><div class="v" style="font-size:13px;color:#34D399">' + lo.name + '</div><div class="s">平均 ' + fmt(lo.avg) + '</div></div>' +
      '<div class="corr-kpi"><div class="k">最高相关标的</div><div class="v" style="font-size:13px;color:#F87171">' + hi.name + '</div><div class="s">平均 ' + fmt(hi.avg) + '</div></div>' +
      '<div class="corr-kpi"><div class="k">最低单对相关</div><div class="v" style="font-size:13px;color:#34D399">' + fmt(minPair) + '</div><div class="s">分散潜力</div></div>';
  }

  function renderPairs(pairs, codes) {
    var body = $("corrPairBody"); if (!body) return; body.innerHTML = "";
    pairs.slice(0, 20).forEach(function (p, i) {
      var a = codes[p.a], b = codes[p.b];
      var tr = document.createElement("tr");
      tr.className = p.v < 0.5 ? "low" : "";
      tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + nameOf(a) + ' <span style="color:#64748B;font-size:10px">' + a + '</span></td><td>' + nameOf(b) + ' <span style="color:#64748B;font-size:10px">' + b + '</span></td><td class="c" style="color:' + (p.v < 0.5 ? "#34D399" : "inherit") + '">' + fmt(p.v) + '</td><td>' + groupOf(a) + '</td><td>' + groupOf(b) + "</td>";
      body.appendChild(tr);
    });
  }

  function corrTip(msg) {
    var t = $("corrTip");
    if (!t) { alert(msg); return; }
    t.textContent = msg; t.style.display = "block";
    setTimeout(function () { t.style.display = "none"; }, 4000);
  }

  function init() {
    if (inited) return;
    var st = $("corrStart");
    if (!st) return;
    WufuUI.ensureData(function () {
      var D = WufuUI.getData();
      var last = D.calendar[D.calendar.length - 1];
      $("corrStart").value = "2017-01-01";
      $("corrEnd").value = last;
      $("corrStart").min = D.calendar[0]; $("corrStart").max = last;
      $("corrEnd").min = D.calendar[0]; $("corrEnd").max = last;
      $("corrBadge").textContent = "数据截止 " + last + " · " + D.pool.length + " 标的";
      renderPool();
      compute();
      inited = true;
    });
  }

  function render() {
    if (!inited) { setTimeout(init, 0); return; }   // 容器刚由 display:none 变可见，延迟一帧待布局后再初始化
    var r = $("corrResult");
    if (r && r.style.display === "none") { /* 保持已出结果 */ }
  }

  window.CorrView = { init: init, render: render };

  // 事件绑定（脚本加载即绑定；init 中数据就绪后才可 compute）
  if (document.getElementById("corrCalc")) {
    $("corrCalc").addEventListener("click", function () { init(); compute(); });
    ["corrFreq", "corrStart", "corrEnd"].forEach(function (id) {
      $(id).addEventListener("change", function () { if ($("corrResult").style.display !== "none") compute(); });
    });
    $("corrSearch").addEventListener("input", function () { if (inited) renderPool(); });
    $("corrAll").addEventListener("click", function () {
      var kw = ($("corrSearch").value || "").trim().toLowerCase();
      poolMeta().forEach(function (p) { if (!kw || p.code.toLowerCase().indexOf(kw) >= 0 || p.name.toLowerCase().indexOf(kw) >= 0) checked.push(p.code); });
      checked = checked.filter(function (c, i) { return checked.indexOf(c) === i; });
      renderPool();
    });
    $("corrNone").addEventListener("click", function () { checked = []; renderPool(); });
    $("corrDiver").addEventListener("click", function () {
      checked = poolMeta().map(function (p) { return p.code; });
      renderPool();
      init(); compute();
    });
  }
})();
