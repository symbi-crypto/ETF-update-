// js_tune.js — 参数调优（约束版网格搜索）
// ==========================================
// 基于当前回测参数做受限网格搜索：固定因子结构，只调用户勾选的维度
// （排名因子窗口 / 持有排名区间 / 调仓周期 / 因子权重），在页面主线程分片
// 后台运行（每批让出 UI，不卡界面），结果按优化目标排序，可一键应用并保存。
// 依赖 js_ui.js 暴露的 window.WufuUI（getParams/applyParams/run/getData）。
(function () {
  var W = window.WufuUI, eng = window.WufuEngine;
  function $(id) { return document.getElementById(id); }
  var MAXGRID = 400;                    // 网格组合上限（防浏览器卡顿）
  var BATCH = 50;                       // 每批回测组数（分批让出主线程）
  var anchorMap = { daily: "", weekly: "mon", monthly: "first", quarterly: "first", yearly: "first" };

  function parseCsv(s) {
    return String(s || "").split(/[,，;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function parseWeightRows(s) {
    return String(s || "").split(/\n+/).map(function (ln) { return ln.trim(); }).filter(Boolean);
  }

  // 采集用户勾选的维度与取值，做笛卡尔积
  function buildGrid() {
    var dims = [];
    if ($("tdWindow") && $("tdWindow").checked) dims.push({ k: "window", vals: parseCsv($("tdWindowVal").value) });
    if ($("tdRank") && $("tdRank").checked) dims.push({ k: "rank", vals: parseCsv($("tdRankVal").value) });
    if ($("tdReb") && $("tdReb").checked) dims.push({ k: "reb", vals: parseCsv($("tdRebVal").value) });
    if ($("tdWeight") && $("tdWeight").checked) dims.push({ k: "weight", vals: parseWeightRows($("tdWeightVal").value) });
    if (!dims.length) return { err: "请至少勾选一个要调优的维度" };
    var combos = [{}];
    dims.forEach(function (d) {
      if (!d.vals.length) return;
      var next = [];
      combos.forEach(function (c) {
        d.vals.forEach(function (v) {
          var o = {}; for (var k in c) o[k] = c[k]; o[d.k] = v; next.push(o);
        });
      });
      combos = next;
    });
    if (!combos.length) return { err: "取值网格为空" };
    if (combos.length > MAXGRID) return { err: "网格组合 " + combos.length + " 组超过上限 " + MAXGRID + "，请减少维度或取值" };
    return { combos: combos };
  }

  function rankFacs(p) { return (p.factors || []).filter(function (f) { return (f.usage || "rank") === "rank"; }); }

  // 把一组网格取值应用到完整 params（克隆后覆盖对应字段）；非法组合返回 null
  function applyCombo(base, combo) {
    var p = JSON.parse(JSON.stringify(base));
    var rf = rankFacs(p);
    if (combo.window !== undefined) {
      var wv = parseInt(combo.window, 10);
      if (!wv || wv <= 0) return null;
      rf.forEach(function (f) { f.window = wv; });
    }
    if (combo.rank !== undefined) {
      var nm = String(combo.rank).split("-");
      var n = parseInt(nm[0], 10), m = nm.length > 1 ? parseInt(nm[1], 10) : n;
      if (!n || !m || m < n || n < 1) return null;
      p.rank_n = n; p.rank_m = m;
    }
    if (combo.reb !== undefined) {
      if (!(combo.reb in anchorMap)) return null;
      p.rebalance_mode = combo.reb; p.rebalance_interval = 1; p.rebalance_anchor = anchorMap[combo.reb];
    }
    if (combo.weight !== undefined) {
      var w = String(combo.weight).split(/[,，\s]+/).map(function (x) { return parseFloat(x); });
      if (w.length !== rf.length) return null;   // 权重个数必须等于排名因子数
      rf.forEach(function (f, i) { f.weight = w[i]; });
    }
    return p;
  }

  function metric(p) {
    var r;
    try { r = eng.backtest(W.getData(), p); } catch (e) { return null; }
    var m = r.metrics;
    var obj = $("tuneObj").value;
    // P1-1 数据窥探修正：排序分数一律取研究段（前N年）指标；验证段（最近3年冻结段）只检验、不参与排序推荐
    var sg = m.segments && m.segments.study;
    function segScore(s) {
      if (!s || s.n_days < 5) return null;
      if (obj === "sharpe") return s.sharpe;
      if (obj === "calmar") return (s.max_dd < 0 ? s.cagr / Math.abs(s.max_dd) : null);
      return s.total;
    }
    var score = segScore(sg);
    if (score === null || score === undefined || isNaN(score)) return null;
    return {
      score: score,
      total: m.total_return, cagr: m.cagr, dd: m.max_dd,
      sharpe: m.sharpe,
      stTotal: sg ? sg.total : null,
      stSharpe: sg ? sg.sharpe : null,
      stCalmar: sg ? (sg.max_dd < 0 ? sg.cagr / Math.abs(sg.max_dd) : null) : null,
      valTotal: m.segments && m.segments.validation ? m.segments.validation.total : null,
      valSharpe: m.segments && m.segments.validation ? m.segments.validation.sharpe : null
    };
  }

  var running = false;
  function runTune() {
    if (running) { $("tuneState").textContent = "调优进行中…"; return; }
    var grid = buildGrid();
    if (grid.err) { $("tuneState").textContent = grid.err; return; }
    var base = W.getParams();
    if (!base.codes.length) { $("tuneState").textContent = "请先在第一步勾选标的"; return; }
    var rf = rankFacs(base);
    // 权重维度预校验：候选每行的权重个数必须等于排名因子数
    if ($("tdWeight") && $("tdWeight").checked) {
      var wRows = parseWeightRows($("tdWeightVal").value);
      for (var i = 0; i < wRows.length; i++) {
        var c = String(wRows[i]).split(/[,，\s]+/).filter(Boolean).map(function (x) { return parseFloat(x); });
        if (c.length !== rf.length) {
          $("tuneState").textContent = "权重第 " + (i + 1) + " 组需 " + rf.length + " 个值（当前排名因子 " + rf.length + " 个），实际 " + c.length;
          return;
        }
      }
    }
    var combos = grid.combos, results = [], done = 0;
    $("tuneState").textContent = "搜索 " + combos.length + " 组…";
    $("tuneProg").style.display = "block";
    $("tuneResult").style.display = "none";
    $("tuneBtn").disabled = true;
    running = true;
    function step() {
      try {
        var start = done;
        var batch = Math.min(BATCH, combos.length - start);
        for (var k = 0; k < batch; k++) {
          var idx = start + k;
          var combo = combos[idx];
          var p = applyCombo(base, combo);
          if (p) { var mt = metric(p); if (mt) results.push({ combo: combo, m: mt }); }
          done++;
        }
        $("tuneBar").style.width = Math.round(done / combos.length * 100) + "%";
        $("tuneProgTxt").textContent = done + "/" + combos.length + " 组";
        if (done < combos.length) { setTimeout(step, 0); }
        else finish(results, base);
      } catch (e) { $("tuneState").textContent = "调优异常: " + (e && e.message); running = false; $("tuneBtn").disabled = false; }
    }
    step();
  }

  function pct(v, d) {
    return (v === null || v === undefined || isNaN(v)) ? "—" : ((v >= 0 ? "+" : "") + (v * 100).toFixed(d || 1) + "%");
  }

  function finish(results, base) {
    running = false;
    $("tuneBtn").disabled = false;
    $("tuneProg").style.display = "none";
    $("tuneResult").style.display = "block";
    var obj = $("tuneObj").value;
    results.sort(function (a, b) { return b.m.score - a.m.score; });
    var bm = metric(base);
    var objLabel = { total: "目标·研究段累计", sharpe: "目标·研究段夏普", calmar: "目标·研究段收益回撤" }[obj] || "目标";

    function scoreText(m) {
      if (obj === "sharpe") return (isFinite(m.stSharpe) ? m.stSharpe.toFixed(2) : "—");
      var v = (obj === "calmar") ? (m.stCalmar !== undefined && m.stCalmar !== null ? m.stCalmar : null) : m.stTotal;
      return pct(v);
    }

    // 单个指标项（标签 + 值）
    function item(label, valText, valColor) {
      return '<span style="font-size:12px;color:#9FB0C3;white-space:nowrap">' + label +
        ' <b style="color:' + valColor + '">' + valText + '</b></span>';
    }

    // 一行（卡片式，flex-wrap 在窄屏自动换行）
    function row(idx, desc, m, isBase, combo) {
      var rank = '<span style="color:#7C8DA1;width:22px;font-size:12px;text-align:center">' + idx + '</span>';
      var name = '<span style="font-size:12px;' + (isBase ? "color:#9FB0C3" : "color:#D8E2EF") + ';min-width:130px;flex:1;flex-basis:120px;word-break:break-all">' + desc + '</span>';
      var cells = item(objLabel, scoreText(m), "#4FC3F7") +
        item("研究段", pct(m.stTotal), "#F59E0B") +
        item("验证段", pct(m.valTotal), "#F1F5F9") +
        item("累计", pct(m.total), "#F87171") +
        item("年化", pct(m.cagr), "#F1F5F9") +
        item("回撤", pct(m.dd), "#34D399") +
        item("夏普", (isFinite(m.sharpe) ? m.sharpe.toFixed(2) : "—"), "#F1F5F9") +
        item("验证段", pct(m.valTotal), "#F1F5F9");
      var btn = combo ? '<button type="button" class="tuneApply" data-combo="' + JSON.stringify(combo).replace(/"/g, "&quot;") + '" style="padding:2px 10px;font-size:12px;border-radius:4px;border:1px solid #3E4E63;background:#202E3F;color:#F1F5F9;cursor:pointer">应用</button>' : '';
      return '<div style="display:flex;flex-wrap:wrap;gap:3px 12px;align-items:center;padding:6px 2px;border-top:1px solid #243244">' + rank + name + cells + btn + '</div>';
    }

    var html = '<div style="font-size:11px;color:#7C8DA1;padding:2px 2px 6px">加粗蓝为所选优化目标（研究段指标）；正收益红、回撤绿，点「应用」回填参数。验证段只检验、不参与排序</div>';
    if (bm) html += row("基线", "基线 · 当前参数", bm, true, null);
    var shown = Math.min(25, results.length);
    for (var i = 0; i < shown; i++) {
      var r = results[i];
      html += row(String(i + 1), describeCombo(r.combo), r.m, false, r.combo);
    }
    $("tuneGrid").innerHTML = html;
    $("tuneCount").textContent = "前 " + shown + "/" + results.length + " 组（按研究段排序）· 基线=当前参数（仅参考）· 验证段仅检验不参与排序";
    $("tuneState").textContent = "完成 · " + results.length + " 组";
    renderSenseSummary(results, base);
  }

  // P1-1：最优参数 vs 参数中位数 收益差 + 参数敏感度平原图（最优点孤峰突起 → 过拟合提示）
  function renderSenseSummary(results, base) {
    var el = $("tuneSense");
    if (!el) return;
    var best = results.length ? results[0] : null;
    if (!best) { el.innerHTML = ""; return; }
    var dimKeys = Object.keys(best.combo);
    var medCombo = {};
    dimKeys.forEach(function (dk) {
      var vals = [];
      results.forEach(function (rr) { if (vals.indexOf(rr.combo[dk]) < 0) vals.push(rr.combo[dk]); });
      vals.sort(function (a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); });
      medCombo[dk] = vals[Math.floor((vals.length - 1) / 2)];
    });
    var medRes = null;
    for (var mr = 0; mr < results.length; mr++) {
      var c = results[mr].combo, okM = true;
      for (var dk2 in medCombo) if (String(c[dk2]) !== String(medCombo[dk2])) { okM = false; break; }
      if (okM) { medRes = results[mr]; break; }
    }
    var txt = "";
    if (best && medRes && best !== medRes) {
      txt = "最优(研究段 " + pct(best.m.stTotal) + " / 验证段 " + pct(best.m.valTotal) + ") vs 中位参数(研究段 " + pct(medRes.m.stTotal) + " / 验证段 " + pct(medRes.m.valTotal) + ") —— 研究段差 " + pct(best.m.stTotal - medRes.m.stTotal) + "、验证段差 " + pct(best.m.valTotal - medRes.m.valTotal) + "：若研究段优势大而验证段趋同，最优点疑似过拟合（孤峰）。";
    }
    el.innerHTML = txt;
    var chEl = $("tuneSenseChart");
    if (!chEl || !window.echarts || !dimKeys.length) return;
    var series = [], xlabels = [];
    dimKeys.forEach(function (dk) {
      var pts = [];
      results.forEach(function (rr) {
        var c = rr.combo, same = true;
        for (var d2 in c) { if (d2 !== dk && String(c[d2]) !== String(best.combo[d2])) { same = false; break; } }
        if (!same) return;
        pts.push({ v: String(c[dk]), st: rr.m.stTotal, va: rr.m.valTotal });
      });
      if (pts.length >= 2) {
        pts.sort(function (a, b) { return String(a.v).localeCompare(String(b.v), undefined, { numeric: true }); });
        pts.forEach(function (p) { if (xlabels.indexOf(p.v) < 0) xlabels.push(p.v); });
        series.push({ name: "研究段·" + dk, type: "line", symbolSize: 5, data: pts.map(function (p) { return [p.v, +(p.st * 100).toFixed(2)]; }) });
        series.push({ name: "验证段·" + dk, type: "line", symbolSize: 5, data: pts.map(function (p) { return [p.v, +(p.va * 100).toFixed(2)]; }) });
      }
    });
    if (!series.length) { chEl.style.display = "none"; return; }
    chEl.style.display = "block";
    var chart = echarts.getInstanceByDom(chEl) || echarts.init(chEl);
    chart.setOption({
      tooltip: { trigger: "axis", triggerOn: "click", renderMode: "richText", confine: true },
      legend: { type: "scroll", textStyle: { color: "#9FB0C3", fontSize: 10 }, top: 4, height: 22, iconSize: 9 },
      grid: { left: 44, right: 16, top: 62, bottom: 26, containLabel: true },
      xAxis: { type: "category", data: xlabels, axisLabel: { color: "#7C8DA1", fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { color: "#7C8DA1", fontSize: 10, formatter: function (v) { return v + "%"; } }, splitLine: { lineStyle: { color: "#243244" } } },
      series: series
    }, true);
    chart.resize();
  }

  function describeCombo(c) {
    var parts = [];
    if (c.window !== undefined) parts.push("窗口 " + c.window);
    if (c.rank !== undefined) parts.push("排名 " + c.rank);
    if (c.reb !== undefined) parts.push("周期 " + c.reb);
    if (c.weight !== undefined) parts.push("权重 [" + c.weight + "]");
    return parts.length ? parts.join(" · ") : "（仅基线）";
  }

  // 应用某行：基于当前参数 + 该行网格取值，回填面板并重跑
  function applyRow(combo) {
    var cur = W.getParams();
    var p = applyCombo(cur, combo);
    if (!p) { $("tuneState").textContent = "该组合无法应用（权重不匹配当前排名因子数）"; return; }
    W.applyParams(p);
    $("tuneState").textContent = "已应用，可点击「保存」存为策略";
  }

  // 事件委托：结果表"应用"按钮
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("tuneApply")) {
      var combo;
      try { combo = JSON.parse(t.getAttribute("data-combo").replace(/&quot;/g, '"')); } catch (err) { return; }
      applyRow(combo);
    }
  });
  var tb = $("tuneBtn"); if (tb) tb.addEventListener("click", runTune);
})();
