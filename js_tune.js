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
    var score = (obj === "total") ? m.total_return
      : (obj === "sharpe") ? m.sharpe
      : (obj === "calmar") ? (isFinite(m.calmar) ? m.calmar : null)
      : (m.segments && m.segments.validation ? m.segments.validation.total : null);
    if (score === null || score === undefined || isNaN(score)) return null;
    return {
      score: score,
      total: m.total_return, cagr: m.cagr, dd: m.max_dd,
      sharpe: m.sharpe,
      valTotal: m.segments && m.segments.validation ? m.segments.validation.total : null
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
    var objLabel = { total: "目标·累计", sharpe: "目标·夏普", calmar: "目标·收益回撤", val_total: "目标·验证段累计" }[obj] || "目标";

    function scoreText(m) {
      if (obj === "sharpe") return (isFinite(m.sharpe) ? m.sharpe.toFixed(2) : "—");
      var v = (obj === "total") ? m.total : (obj === "val_total") ? m.valTotal : (isFinite(m.calmar) ? m.calmar : null);
      return pct(v);
    }

    // 单个指标项（标签 + 值）
    function item(label, valText, valColor) {
      return '<span style="font-size:12px;color:#94A3B8;white-space:nowrap">' + label +
        ' <b style="color:' + valColor + '">' + valText + '</b></span>';
    }

    // 一行（卡片式，flex-wrap 在窄屏自动换行）
    function row(idx, desc, m, isBase, combo) {
      var rank = '<span style="color:#64748B;width:22px;font-size:12px;text-align:center">' + idx + '</span>';
      var name = '<span style="font-size:12px;' + (isBase ? "color:#94A3B8" : "color:#CBD5E1") + ';min-width:130px;flex:1;flex-basis:120px;word-break:break-all">' + desc + '</span>';
      var cells = item(objLabel, scoreText(m), "#38BDF8") +
        item("累计", pct(m.total), "#F87171") +
        item("年化", pct(m.cagr), "#E2E8F0") +
        item("回撤", pct(m.dd), "#34D399") +
        item("夏普", (isFinite(m.sharpe) ? m.sharpe.toFixed(2) : "—"), "#E2E8F0") +
        item("验证", pct(m.valTotal), "#E2E8F0");
      var btn = combo ? '<button type="button" class="tuneApply" data-combo="' + JSON.stringify(combo).replace(/"/g, "&quot;") + '" style="padding:2px 10px;font-size:12px;border-radius:4px;border:1px solid #334155;background:#111827;color:#E2E8F0;cursor:pointer">应用</button>' : '';
      return '<div style="display:flex;flex-wrap:wrap;gap:3px 12px;align-items:center;padding:6px 2px;border-top:1px solid #1E293B">' + rank + name + cells + btn + '</div>';
    }

    var html = '<div style="font-size:11px;color:#64748B;padding:2px 2px 6px">加粗蓝为所选优化目标；正收益红、回撤绿，点「应用」回填参数</div>';
    if (bm) html += row("基线", "基线 · 当前参数", bm, true, null);
    var shown = Math.min(25, results.length);
    for (var i = 0; i < shown; i++) {
      var r = results[i];
      html += row(String(i + 1), describeCombo(r.combo), r.m, false, r.combo);
    }
    $("tuneGrid").innerHTML = html;
    $("tuneCount").textContent = "前 " + shown + "/" + results.length + " 组 · 基线=当前参数（仅参考）";
    $("tuneState").textContent = "完成 · " + results.length + " 组";
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
