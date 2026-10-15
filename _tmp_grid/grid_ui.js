  // ==================== 网格回测视图（GridView） ====================
  window.GridView = {
    checked: {},
    initDone: false,
    lastScores: null,
    lastParams: {},
    _charts: {},
    init: function () {
      var self = this;
      this.renderPoolBox();
      $("gridPoolSearch").addEventListener("input", function () { self.renderPoolBox(); });
      $("gridPoolAll").addEventListener("click", function () { self.setAll(true); });
      $("gridPoolNone").addEventListener("click", function () { self.setAll(false); });
      $("gridScoreBtn").addEventListener("click", function () { self.computeScores(); });
      $("gridRunBtn").addEventListener("click", function () { self.run(); });
      $("gridBackBtn").addEventListener("click", function () { $("gridResult").style.display = "none"; });
      this.initDone = true;
    },
    render: function () {
      if (!this.initDone) this.init();
    },
    setAll: function (on) {
      var self = this;
      POOL.forEach(function (p) { if (/^[0-9]{6}\.(SH|SZ)$/.test(p.code)) self.checked[p.code] = on; });
      this.renderPoolBox();
    },
    renderPoolBox: function () {
      var box = $("gridPoolBox"); if (!box) return;
      box.innerHTML = "";
      var kw = ($("gridPoolSearch").value || "").trim().toLowerCase();
      var groups = [], self = this;
      POOL.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
      groups.forEach(function (g) {
        var allItems = POOL.filter(function (p) { return p.group === g; });
        var items = allItems.filter(function (p) {
          if (!kw) return true;
          return (p.name + " " + p.code).toLowerCase().indexOf(kw) >= 0;
        });
        if (!items.length) return;
        var head = document.createElement("div");
        head.style.cssText = "width:100%;font-size:12px;color:#94A3B8;margin:3px 0 1px";
        var allOn = true;
        allItems.forEach(function (p) { if (!self.checked[p.code]) allOn = false; });
        head.innerHTML = '<label style="cursor:pointer"><input type="checkbox" style="margin:0 4px 0 0;accent-color:#F59E0B;cursor:pointer">' + g + "（" + items.length + "）</label>";
        head.querySelector("input").checked = allOn;
        head.querySelector("input").addEventListener("change", function () {
          var on = this.checked;
          allItems.forEach(function (p) { self.checked[p.code] = on; });
          self.renderPoolBox();
        });
        box.appendChild(head);
        items.forEach(function (p) {
          var l = document.createElement("label");
          l.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#CBD5E1;background:#111827;border:1px solid #1E293B;border-radius:4px;padding:1px 6px;cursor:pointer;white-space:nowrap";
          l.innerHTML = '<input type="checkbox" style="margin:0;accent-color:#F59E0B;cursor:pointer">' + p.name + ' <span style="color:#64748B">' + p.code + "</span>";
          if (self.checked[p.code]) l.querySelector("input").checked = true;
          l.querySelector("input").addEventListener("change", function () { self.checked[p.code] = this.checked; });
          box.appendChild(l);
        });
      });
    },
    computeScores: function () {
      if (!D) { showNotice("行情数据加载中，请稍候…"); return; }
      var self = this;
      var i = D.calendar.length - 1;
      var n = Math.max(1, +($("gridTopN").value) || 10);
      var sel = POOL.filter(function (p) { return self.checked[p.code]; });
      if (!sel.length) { showNotice("请先在①中勾选至少 1 只标的"); return; }
      var scores = sel.map(function (p) { return WufuEngine.gridScore(p.code, i); })
        .filter(function (s) { return s && !s.gate.length; })
        .sort(function (a, b) { return b.score - a.score; });
      var top = scores.slice(0, n);
      this.lastScores = top;
      var invest = Math.max(1, +($("gridCapital").value) || 1000000);
      var perCode = invest / Math.max(1, top.length);
      var costRt = (+($("gridComm").value) || 0.00025) + (+($("gridSlip").value) || 0.0005);
      var html = '<table class="trades" style="width:100%"><thead><tr>' +
        "<th>代码</th><th>名称</th><th>综合分</th><th>震荡度</th><th>波动空间</th><th>区间覆盖</th><th>触发频率</th><th>流动性</th><th>年化波动</th><th>ADX</th><th>ER</th><th>年触发</th></tr></thead><tbody>";
      top.forEach(function (s) {
        var p0 = WufuEngine.gridParams(s.code, i, perCode, costRt);
        self.lastParams[s.code] = p0;
        var warns = p0 && p0.warns ? p0.warns.map(function (w) { return '<span style="color:#FBBF24">⚠ ' + w + "</span>"; }).join("") : "";
        html += "<tr><td>" + s.code + "</td><td>" + nameOf(s.code) + "</td><td style='color:#60A5FA;font-weight:600'>" + s.score.toFixed(1) +
          "</td><td>" + s.parts.osc.toFixed(0) + "</td><td>" + s.parts.vol.toFixed(0) + "</td><td>" + s.parts.cov.toFixed(0) +
          "</td><td>" + s.parts.trig.toFixed(0) + "</td><td>" + s.parts.liq.toFixed(0) + "</td><td>" + (s.vol * 100).toFixed(1) +
          "%</td><td>" + (s.adx ? s.adx.toFixed(1) : "-") + "</td><td>" + (s.er ? s.er.toFixed(2) : "-") + "</td><td>" +
          (s.parts.perY ? s.parts.perY.toFixed(0) : "-") + "</td></tr><tr><td colspan='12' style='color:#94A3B8;font-size:11px'>" +
          "区间 [" + (p0.lower).toFixed(3) + ", " + (p0.upper).toFixed(3) + "] · 格距 " + p0.step.toFixed(3) + " · " + p0.nLevels +
          " 格 · 每格 " + p0.perLevelAmt.toFixed(0) + " 元 · 底仓 " + p0.baseAmt.toFixed(0) + " 元 " + warns + "</td></tr>";
      });
      html += "</tbody></table>";
      var el = $("gridScoreTable");
      el.innerHTML = '<div style="font-size:12px;color:#CBD5E1;margin:4px 0">适配度评分 · Top ' + top.length + "（勾选 " + sel.length + " 只，通过硬门槛 " + scores.length + " 只）</div>" + html;
      this.renderParamsTable();
    },
    renderParamsTable: function () {
      var self = this;
      var el = $("gridParamTable"); if (!el) return;
      if (!this.lastScores || !this.lastScores.length) { el.innerHTML = '<div style="font-size:12px;color:#64748B">先执行适配度评分，自动生成每标的网格参数</div>'; return; }
      var invest = Math.max(1, +($("gridCapital").value) || 1000000);
      var perCode = invest / this.lastScores.length;
      var html = '<table class="trades" style="width:100%"><thead><tr>' +
        "<th>代码</th><th>名称</th><th>区间下限</th><th>区间上限</th><th>格距</th><th>格数</th><th>每格金额</th><th>底仓金额</th></tr></thead><tbody>";
      this.lastScores.forEach(function (s) {
        var p = self.lastParams[s.code];
        if (!p) return;
        html += "<tr><td>" + s.code + "</td><td>" + nameOf(s.code) + "</td>" +
          "<td><input type='number' step='0.001' data-k='lower' data-c='" + s.code + "' value='" + p.lower.toFixed(3) + "' style='width:74px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827'></td>" +
          "<td><input type='number' step='0.001' data-k='upper' data-c='" + s.code + "' value='" + p.upper.toFixed(3) + "' style='width:74px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827'></td>" +
          "<td><input type='number' step='0.0005' data-k='step' data-c='" + s.code + "' value='" + p.step.toFixed(3) + "' style='width:66px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827'></td>" +
          "<td><input type='number' step='1' min='1' data-k='nLevels' data-c='" + s.code + "' value='" + p.nLevels + "' style='width:52px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827'></td>" +
          "<td><input type='number' step='100' data-k='perLevelAmt' data-c='" + s.code + "' value='" + p.perLevelAmt.toFixed(0) + "' style='width:78px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827'></td>" +
          "<td><input type='number' step='100' data-k='baseAmt' data-c='" + s.code + "' value='" + p.baseAmt.toFixed(0) + "' style='width:78px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827'></td></tr>";
      });
      html += "</tbody></table>";
      el.innerHTML = html;
      el.querySelectorAll("input").forEach(function (inp) {
        inp.addEventListener("change", function () {
          var c = inp.getAttribute("data-c"), k = inp.getAttribute("data-k");
          var p = self.lastParams[c]; if (!p) return;
          p[k] = +inp.value || p[k];
          if (k === "lower" || k === "upper" || k === "nLevels") {
            var nL = Math.max(1, Math.round(p.nLevels || 5));
            p.step = (p.upper - p.lower) / nL;
          }
          self.lastParams[c] = p;
        });
      });
    },
    run: function () {
      if (!D) { showNotice("行情数据加载中，请稍候…"); return; }
      if (!this.lastScores || !this.lastScores.length) { showNotice("请先计算适配度评分"); return; }
      var self = this;
      var codes = this.lastScores.map(function (s) { return s.code; });
      var overrides = {};
      this.lastScores.forEach(function (s) {
        var p = self.lastParams[s.code];
        if (!p) return;
        overrides[s.code] = { lower: p.lower, upper: p.upper, step: p.step, nLevels: p.nLevels, perLevelAmt: p.perLevelAmt, baseAmt: p.baseAmt };
      });
      this.lastCapital = Math.max(1, +($("gridCapital").value) || 1000000);
      var params = {
        codes: codes, initial_capital: this.lastCapital, Math.max(1, +($("gridCapital").value) || 1000000),
        mgmt: $("gridMgmt").value || "B",
        period_n: Math.max(1, +($("gridPeriodN").value) || 12),
        period_unit: $("gridPeriodUnit").value || "周",
        commission_rate: +($("gridComm").value) || 0.00025,
        slippage_rate: +($("gridSlip").value) || 0.0005,
        min_commission: +($("gridMinComm").value) || 0,
        gridOverrides: overrides
      };
      var stEl = $("gridRunState"); stEl.textContent = "计算中…";
      try {
        var res = WufuEngine.backtestGrid(D, params);
        stEl.textContent = "完成";
        this.renderResult(res);
      } catch (e) {
        stEl.textContent = "失败：" + ((e && e.message) || e);
      }
    },
    renderResult: function (res) {
      var m = res.metrics;
      $("gridResult").style.display = "";
      this.lastCapital = this.lastCapital || 1000000;
      var kpi = [
        ["累计收益", gPct(m.total_return), m.total_return >= 0 ? "up" : "down"],
        ["年化收益", gPct(m.cagr), m.cagr >= 0 ? "up" : "down"],
        ["最大回撤", gPct(m.max_dd), "down"],
        ["夏普比率", m.sharpe.toFixed(2), ""],
        ["年化波动", gPct(m.vol), ""],
        ["胜率", (m.win_rate * 100).toFixed(1) + "%", ""],
        ["成交笔数", String(m.n_trades), ""],
        ["体检次数", String(res.health.length), ""]
      ];
      var kh = "";
      kpi.forEach(function (k) {
        var cls = k[2] === "up" ? "color:#34D399" : k[2] === "down" ? "color:#F87171" : "";
        kh += '<div class="kpi"><div class="t">' + k[0] + '</div><div class="v" style="' + cls + '">' + k[1] + '</div><div class="s">' + (k[3] || "") + "</div></div>";
      });
      $("gridKpis").innerHTML = kh;
      // 净值
      var nav = res.nav.map(function (v, idx) { return [+res.dates[idx].slice(0, 4) + "-" + res.dates[idx].slice(4, 6) + "-" + res.dates[idx].slice(6, 8), +(v > 0 ? v : this.lastCapital)]; });
      var dts = nav.map(function (x) { return x[0]; });
      var navs = nav.map(function (x) { return +(x[1] / GridView.lastCapital).toFixed(4); });
      this.drawChart("gridNavChart", dts, navs, "组合净值", "#F59E0B");
      this.drawDd("gridDdChart", dts, res.drawdown, "回撤", "#F87171");
      // 成交表
      var tt = $("gridTradeTable");
      var th = "<tr><th>日期</th><th>标的</th><th>方向</th><th>格位</th><th>成交价</th><th>份额</th><th>金额(元)</th><th>标签</th></tr>";
      var tb = res.trades.slice(0, 300).map(function (t) {
        return "<tr><td>" + t.d + "</td><td>" + t.code + "</td><td style='color:" + (t.side === "BUY" ? "#34D399" : "#F87171") + "'>" + (t.side === "BUY" ? "买入" : "卖出") +
          "</td><td>" + (+t.level).toFixed(3) + "</td><td>" + (+t.px).toFixed(3) + "</td><td>" + t.sh + "</td><td>" + (+t.amt).toFixed(0) + "</td><td>" + t.tag + "</td></tr>";
      }).join("");
      tt.innerHTML = "<thead>" + th + "</thead><tbody>" + tb + "</tbody>";
      // 体检表
      var ht = $("gridHealthTable");
      var hh = "<tr><th>日期</th><th>标的</th><th>动作</th><th>原因</th></tr>";
      var hb = res.health.map(function (h) {
        return "<tr><td>" + h.d + "</td><td>" + h.code + "</td><td style='color:#FBBF24'>" + h.action + "</td><td>" + h.reason + "</td></tr>";
      }).join("");
      ht.innerHTML = "<thead>" + hh + "</thead><tbody>" + hb + "</tbody>";
    },
    drawChart: function (id, x, y, name, color) {
      if (this._charts[id]) this._charts[id].dispose();
      var el = document.getElementById(id); if (!el) return;
      var c = echarts.init(el);
      c.setOption({
        backgroundColor: "transparent",
        grid: { left: 46, right: 14, top: 18, bottom: 26 },
        tooltip: { trigger: "axis", backgroundColor: "#0F172A", borderColor: "#334155", textStyle: { color: "#E2E8F0", fontSize: 11 } },
        xAxis: { type: "category", data: x, axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        yAxis: { type: "value", scale: true, axisLabel: { color: "#94A3B8", fontSize: 10 }, splitLine: { lineStyle: { color: "#1E293B" } } },
        series: [{ name: name, type: "line", data: y, showSymbol: false, lineStyle: { width: 1.4, color: color }, areaStyle: { opacity: 0.06, color: color } }]
      });
      this._charts[id] = c;
    },
    drawDd: function (id, x, y, name, color) {
      if (this._charts[id]) this._charts[id].dispose();
      var el = document.getElementById(id); if (!el) return;
      var c = echarts.init(el);
      c.setOption({
        backgroundColor: "transparent",
        grid: { left: 46, right: 14, top: 18, bottom: 26 },
        tooltip: { trigger: "axis", backgroundColor: "#0F172A", borderColor: "#334155", textStyle: { color: "#E2E8F0", fontSize: 11 }, valueFormatter: function (v) { return (v * 100).toFixed(1) + "%"; } },
        xAxis: { type: "category", data: x, axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { color: "#94A3B8", fontSize: 10, formatter: function (v) { return (v * 100).toFixed(0) + "%"; } }, splitLine: { lineStyle: { color: "#1E293B" } } },
        series: [{ name: name, type: "line", data: y, showSymbol: false, lineStyle: { width: 1.2, color: color }, areaStyle: { opacity: 0.12, color: color } }]
      });
      this._charts[id] = c;
    }
  };
  function gPct(v) { return (v * 100).toFixed(2) + "%"; }
