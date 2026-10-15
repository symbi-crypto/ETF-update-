// ============================================================
// js_ui.js — ETF动量轮动回测系统 · 交互界面
// 参数面板 -> 防抖重跑 -> ECharts 图表 + 指标卡片 + 调仓表
// ============================================================
(function () {
  "use strict";
  // ---------- 全局错误诊断（任何 JS 异常都在页面顶部显示原因） ----------
  function showPageErr(msg) {
    var el = document.getElementById("pageErr");
    if (!el) return;
    el.style.display = "block";
    el.textContent = "页面脚本异常：" + msg + "（请截图此提示发给助手）";
  }
  window.addEventListener("error", function (ev) { showPageErr(String(ev.message || "未知错误")); });
  window.addEventListener("unhandledrejection", function (ev) { showPageErr("异步错误：" + String(ev.reason)); });
  var D = null;                     // 行情大数据：点击「下一步」后才解析（首屏不解析 10MB JSON）
  var POOL = window.WUFU_POOL || [];  // 标的池元信息：即时可用
  var FIRSTDATE = window.WUFU_FIRSTDATE || {};  // 各标的首个有效交易日（幸存者偏差披露）
  var engine = window.WufuEngine;
  var $ = function (id) { return document.getElementById(id); };

  var COLOR = { str: "#38BDF8", bench: "#94A3B8", ew: "#A78BFA", dd: "#F87171", weak: "#F59E0B" };
  var FMT = { pct: function (v, d) { return (v * 100).toFixed(d === undefined ? 2 : d) + "%"; } };

  var charts = {};

  // ---------- 标的池渲染（第一步：仅用 POOL 元信息，无需行情数据） ----------
  var poolChecked = {}, onlyRot = {}, rebalanceChecked = {};   // 轮动/再平衡视图各自独立勾选状态
  POOL.forEach(function (p) { poolChecked[p.code] = false; rebalanceChecked[p.code] = false; onlyRot[p.code] = false; });
  var activeView = "rotation";             // rotation | rebalance（视图路由）
  var rebW = {};                           // 再平衡模式：code -> 用户手填比例（%），未手填用等权
  function checkedCodes() { var cm = activeView === "rebalance" ? rebalanceChecked : poolChecked; return POOL.filter(function (p) { return cm[p.code]; }); }
  function wFor(code, n) { var v = rebW[code]; return (v !== undefined && v >= 0) ? v : 0; }
  function syncWIn() {
    POOL.forEach(function (p) {
      var w = poolBox.querySelector('.wIn[data-code="' + p.code + '"]');
      if (w) {
        var v = rebW[p.code];
        w.value = (v !== undefined && v >= 0) ? v : "";
      }
    });
  }
  function updateWSum() {
    var n = checkedCodes().length, s = 0;
    checkedCodes().forEach(function (p) { s += wFor(p.code, n); });
    var el = $("wSum");
    if (!el) return;
    if (!n) { el.textContent = ""; return; }
    el.textContent = " | 权重合计 " + (Math.round(s * 100) / 100) + "%" +
      (Math.abs(s - 100) > 0.01 ? (s < 100 ? "（余 " + (100 - s).toFixed(1) + "% 现金→货币ETF）" : "（超 100%，请调整）") : "");
  }
  function applyModeUI() {
    // 视图拆分后：轮动/再平衡面板已物理分离，此处仅处理共享块内按视图切换的显隐
    var isReb = activeView === "rebalance";
    var robw = $("robwrap"); if (robw) robw.style.display = isReb ? "none" : "";
    if (isReb) { var rb = $("robBox"); if (rb) rb.style.display = "none"; }
    var cic = $("cICCard"); if (cic) cic.style.display = isReb ? "none" : "";
    // ③择时管理（市场状态风控）不适用再平衡模式：整块隐藏，切回轮动恢复
    var exeB = $("sfg-exe"); if (exeB) exeB.style.display = isReb ? "none" : "";
    var dyn = isReb && $("rebWeightMode") && $("rebWeightMode").value !== "fixed";
    if (poolBox) Array.prototype.forEach.call(poolBox.querySelectorAll(".wlab"), function (el) { el.style.display = (isReb && !dyn) ? "flex" : "none"; });
    if (poolBox) Array.prototype.forEach.call(poolBox.querySelectorAll(".rot"), function (el) { el.style.display = isReb ? "none" : ""; });
    var ws = $("wSum"); if (ws) ws.style.display = (isReb && !dyn) ? "" : "none";
    if (isReb && !dyn) { syncWIn(); updateWSum(); }
  }

  var poolBox = $("poolBox");
  function renderPool() {
  var cm = activeView === "rebalance" ? rebalanceChecked : poolChecked;
  poolBox.innerHTML = "";
  var kw = ($("poolSearch").value || "").trim().toLowerCase();
  var groups = [], frag = document.createDocumentFragment();
  POOL.forEach(function (p) {
    if (groups.indexOf(p.group) < 0) groups.push(p.group);
  });

  groups.forEach(function (g) {
    var allItems = POOL.filter(function (p) { return p.group === g; });
    var items = allItems.filter(function (p) {
      if (!kw) return true;
      return (p.name + " " + idxNameOf(p.code)).toLowerCase().indexOf(kw) >= 0 || p.code.toLowerCase().indexOf(kw) >= 0;
    });
    if (!items.length) return;
    var head = document.createElement("div");
    head.className = "corr-grp";
    head.innerHTML = '<input type="checkbox" style="margin:0;accent-color:var(--acc);cursor:pointer">' + g + " (" + items.length + "只)";
    var allOn = true, anyOn = false;
    for (var ai1 = 0; ai1 < allItems.length; ai1++) { if (!cm[allItems[ai1].code]) allOn = false; else anyOn = true; }
    head.querySelector("input").checked = allOn;
    head.querySelector("input").indeterminate = anyOn && !allOn;
    head.querySelector("input").addEventListener("change", function () {
      var on = this.checked;
      allItems.forEach(function (p) { cm[p.code] = on; });
      // 同步本组已渲染子项的勾选状态（大类级联）
      Array.prototype.forEach.call(poolBox.querySelectorAll(".pick"), function (cb) {
        var c = cb.getAttribute("data-c");
        var hit = false;
        for (var ai2 = 0; ai2 < allItems.length; ai2++) { if (allItems[ai2].code === c) { hit = true; break; } }
        if (hit) cb.checked = on;
      });
      updatePoolCount();
      if (activeView === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    frag.appendChild(head);
    items.forEach(function (p) {
      var l = document.createElement("div");
      l.className = "corr-item";
      l.style.flexWrap = "wrap";
      var isRebNow = activeView === "rebalance";
      var dynNow = isRebNow && $("rebWeightMode") && $("rebWeightMode").value !== "fixed";
      l.innerHTML = '<input type="checkbox" class="pick" data-c="' + p.code + '">' +
        '<span class="corr-nm">' + p.name + "</span><span class='corr-cd'>" + p.code + "</span>" +
        "<label class='rot' style='display:" + (isRebNow ? "none" : "") + "'><input type='checkbox' class='rotc'>仅轮动</label>" +
        "<label class='wlab' style='display:" + ((isRebNow && !dynNow) ? "flex" : "none") + "'>比例<input type='number' class='wIn' data-code='" + p.code + "' min='0' max='100' step='0.1' style='width:52px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;text-align:right'>%</label>";
      if (cm[p.code]) l.querySelector(".pick").checked = true;
      if (onlyRot[p.code]) l.querySelector(".rotc").checked = true;
      var wv0 = rebW[p.code];
      if (wv0 !== undefined && wv0 >= 0) l.querySelector(".wIn").value = wv0;
      l.querySelector(".pick").addEventListener("change", function () {
        cm[p.code] = this.checked;
        updatePoolCount();
        if (activeView === "rebalance") { updateWSum(); }
        if (D) scheduleRun();
      });
      l.querySelector(".rotc").addEventListener("change", function () {
        onlyRot[p.code] = this.checked;
        if (D) scheduleRun();
      });
      l.querySelector(".wIn").addEventListener("change", function () {
        var v = Math.max(0, Math.min(100, +this.value || 0));
        rebW[p.code] = v; this.value = v; updateWSum();
        if (D) scheduleRun();
      });
      frag.appendChild(l);
    });
  });
  poolBox.appendChild(frag);
  if (activeView === "rebalance") { syncWIn(); updateWSum(); }
  }
  if ($("poolSearch")) {
    $("poolSearch").addEventListener("input", function () { renderPool(); });
    $("poolAll").addEventListener("click", function () {
      POOL.forEach(function (p) { cm[p.code] = true; });
      renderPool(); updatePoolCount();
      if (activeView === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    $("poolNone").addEventListener("click", function () {
      POOL.forEach(function (p) { cm[p.code] = false; });
      renderPool(); updatePoolCount();
      if (activeView === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    applyModeUI();   // poolBox 重建后重应用视图显隐（.rot 隐藏 / .wlab 比例输入显示）
  }

  function updatePoolCount() {
    var n = 0;
    POOL.forEach(function (p) { if (poolChecked[p.code]) n++; });
    $("poolCount").textContent = n + " 只";
  }

  // ---------- 参数控件 ----------
  var REB = [
    { label: "日", mode: "daily", unit: "个交易日", def: 1, min: 1, max: 60,
      anchors: null, anchorDef: "" },
    { label: "周", mode: "weekly", unit: "周", def: 1, min: 1, max: 12,
      anchors: [{ label: "周一", value: "mon" }, { label: "周五", value: "fri" }], anchorDef: "mon" },
    { label: "月", mode: "monthly", unit: "个月", def: 1, min: 1, max: 12,
      anchors: [{ label: "月初", value: "first" }, { label: "月末", value: "last" }], anchorDef: "first" },
    { label: "季", mode: "quarterly", unit: "个季度", def: 1, min: 1, max: 8,
      anchors: [{ label: "季初", value: "first" }, { label: "季末", value: "last" }], anchorDef: "first" },
    { label: "年", mode: "yearly", unit: "年", def: 1, min: 1, max: 5,
      anchors: [{ label: "年初", value: "first" }, { label: "年末", value: "last" }], anchorDef: "first" }
  ];
  var rebSel = REB[1], rebInterval = 1, rebAnchor = "mon", startDate = "2016-06-01", endDate = "2026-09-30";
  // ---------- 因子列表（可增删；kind: roc/slope_r2/vol/risk_adj/amount/volume/rsrs/c_vs_ma/c_vs_ma_lag/ma_vs_ma/ma_vs_ma_lag） ----------
  // nwin=窗口数；多窗口时窗口2/3 用 wMin2/wMax2/wStep2/def2、wMin3/...（窗口A/B/C 语义见 title）
  // cat=因子分类：price=行情因子 / tech=技术因子 / custom=自定义因子
  var KIND_INFO = {
    roc:       { label: "涨幅",        wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 1, cat: "price" },
    r2:        { label: "R²阈值",      wMin: 20,  wMax: 120, wStep: 5,  def: 25,  nwin: 1, title: "对数收盘价线性回归的R²（0~1）", cat: "tech" },
    slope_r2:  { label: "斜率动量",    wMin: 20,  wMax: 120, wStep: 5,  def: 25,  nwin: 1, cat: "tech" },
    wslope_r2: { label: "加权斜率动量", wMin: 20,  wMax: 120, wStep: 5,  def: 25,  nwin: 1, cat: "tech" },
    vol:       { label: "收益波动率", wMin: 20, wMax: 120, wStep: 5, def: 60, nwin: 1, cat: "tech" },
    risk_adj:  { label: "风险调整动量", wMin: 20,  wMax: 120, wStep: 5,  def: 60,  nwin: 1, cat: "tech" },
    amount:    { label: "成交额",      wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 1, title: "N日平均成交额（万元）", cat: "price" },
    volume:    { label: "成交量",      wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 1, title: "N日平均成交量（万手）", cat: "price" },
    rsrs:      { label: "RSRS",        wMin: 5,   wMax: 120, wStep: 5,  def: 20,  nwin: 1, title: "N日RSRS：N日最高价对最低价OLS回归斜率", cat: "tech" },
    c_vs_ma:   { label: "收盘vs均线",  wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 1, title: "后复权收盘价相对近N日均线的涨幅", cat: "tech" },
    c_vs_ma_lag: { label: "收盘vs前均线", wMin: 1,  wMax: 120, wStep: 1, def: 5,  nwin: 2,
                   wMin2: 5, wMax2: 250, wStep2: 5, def2: 20,
                   winTitles: ["平移N日（回看N日前）", "M日均线窗口"], cat: "tech" },
    ma_vs_ma:  { label: "均线vs均线",  wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 2,
                 wMin2: 5, wMax2: 250, wStep2: 5, def2: 60,
                 winTitles: ["近N日均线窗口", "近M日均线窗口"], cat: "tech" },
    ma_vs_ma_lag: { label: "均线vs前均线", wMin: 5, wMax: 250, wStep: 5, def: 20, nwin: 3,
                   wMin2: 1, wMax2: 120, wStep2: 1, def2: 5,
                   wMin3: 5, wMax3: 250, wStep3: 5, def3: 20,
                   winTitles: ["近N日均线窗口", "平移M日（回看M日前）", "O日均线窗口"], cat: "tech" },
    close:     { label: "后复权收盘价", wMin: 1,   wMax: 250, wStep: 1,  def: 20,  nwin: 1, title: "当日后复权收盘价（截面原值排序）", cat: "price" },
    open:      { label: "后复权开盘价", wMin: 1,   wMax: 250, wStep: 1,  def: 20,  nwin: 1, title: "当日后复权开盘价（截面原值排序）", cat: "price" },
    high:      { label: "后复权最高价", wMin: 1,   wMax: 250, wStep: 1,  def: 20,  nwin: 1, title: "当日后复权最高价（截面原值排序）", cat: "price" },
    low:       { label: "后复权最低价", wMin: 1,   wMax: 250, wStep: 1,  def: 20,  nwin: 1, title: "当日后复权最低价（截面原值排序）", cat: "price" },
    ma:        { label: "N日均线",     wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 1, title: "近N日均线（后复权收盘）", cat: "tech" },
    ma_lag:    { label: "N日前均线",   wMin: 1,   wMax: 120, wStep: 1,  def: 5,   nwin: 2,
                 wMin2: 5, wMax2: 250, wStep2: 5, def2: 20,
                 winTitles: ["平移N日（回看N日前）", "M日均线窗口"], cat: "tech" },
    amplitude: { label: "日内振幅",    wMin: 5,   wMax: 120, wStep: 1,  def: 20,  nwin: 1, title: "(最高-最低)/最低", cat: "tech" },
    position:  { label: "日内位置",    wMin: 5,   wMax: 120, wStep: 1,  def: 20,  nwin: 1, title: "(收盘-最低)/(最高-最低)", cat: "tech" },
    rsi:       { label: "RSI",         wMin: 5,   wMax: 60,  wStep: 1,  def: 14,  nwin: 1, title: "14日相对强弱指标 RSI=100×均涨/(均涨+均跌)", cat: "tech" },
    turnover:  { label: "换手率",      wMin: 1,   wMax: 120, wStep: 1,  def: 20,  nwin: 1, title: "N日平均换手率（%）——流动性/关注度，数据来自原始CHANGEHANDRATE", cat: "price" },
    vol_ratio: { label: "放量比",      wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 2,
                 wMin2: 5, wMax2: 250, wStep2: 5, def2: 60,
                 winTitles: ["近N日均量窗口", "M日前M日均量窗口"], title: "近N日均量 ÷ M日前M日均量（量能放大程度）", cat: "tech" }
  };
  var KIND_CAT = {
    all: null,
    price: ["close", "open", "high", "low", "amount", "volume", "turnover", "roc"],
    tech: ["slope_r2", "wslope_r2", "vol", "risk_adj", "rsrs", "c_vs_ma", "c_vs_ma_lag", "ma_vs_ma", "ma_vs_ma_lag", "ma", "ma_lag", "amplitude", "position", "rsi", "r2", "vol_ratio"],
    custom: ["custom"]
  };
  function fillMfKind(cat) {
    var sel = $("mfAddKind"); if (!sel) return;
    var list = (cat && cat !== "all") ? KIND_CAT[cat] : Object.keys(KIND_INFO);
    sel.innerHTML = "";
    if (cat === "custom") {
      var oc = document.createElement("option");
      oc.value = "custom"; oc.textContent = "自定义公式因子";
      sel.appendChild(oc);
      return;
    }
    list.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = KIND_INFO[k].label;
      sel.appendChild(o);
    });
  }

  // ---------- 因子说明（全部因子类型：名称/含义/公式，公式按 factorValue 引擎实现口径书写） ----------
  var FACTOR_HELP = [
    { k: "roc", label: "涨幅", mean: "N日价格动量：后复权收盘价相对 N 日前的变化幅度", formula: "close[t] / close[t-N] - 1" },
    { k: "r2", label: "R²阈值", mean: "对数收盘价对时间线性回归的拟合优度（0~1），衡量趋势平滑度", formula: "R² = 1 - SS_res/SS_tot（log(close) 对 t 的 OLS）" },
    { k: "slope_r2", label: "斜率动量", mean: "对数收盘价线性回归斜率（年化）×R²：趋势强度与平滑度", formula: "annSlope = OLS斜率 × 252；取值 = annSlope × R²" },
    { k: "wslope_r2", label: "加权斜率动量", mean: "对数收盘价加权线性回归斜率（权重线性递增、近期更大，年化）×R²", formula: "WLS(log(close) ~ t，权重 w = i+1)；取值 = annSlope × R²" },
    { k: "vol", label: "收益波动率", mean: "N日日收益序列的标准差（年化）", formula: "σ(close[t]/close[t-1] - 1) × √252" },
    { k: "risk_adj", label: "风险调整动量", mean: "N日涨幅 ÷ 年化收益波动率（单位风险收益）；年化波动率 ≤ 0.5% 记 0（现金等价类防虚高）", formula: "(close[t]/close[t-N] - 1) ÷ vol；vol ≤ 0.005 时 = 0" },
    { k: "amount", label: "成交额", mean: "N日平均成交额（流动性）", formula: "Σ amount[t-N+1..t] ÷ N（万元）" },
    { k: "volume", label: "成交量", mean: "N日平均成交量", formula: "Σ volume[t-N+1..t] ÷ N（万手）" },
    { k: "rsrs", label: "RSRS", mean: "N日最高价对最低价 OLS 回归斜率（阻力支撑相对强弱）", formula: "OLS(highs ~ lows)：斜率 = Cov(h,l)/Var(h)" },
    { k: "c_vs_ma", label: "收盘vs均线", mean: "后复权收盘价相对近N日均线的偏离", formula: "close[t] ÷ MA_N[t] - 1" },
    { k: "c_vs_ma_lag", label: "收盘vs前均线", mean: "后复权收盘价相对 N 日前 M 日均线的偏离", formula: "close[t] ÷ MA_M[t-N] - 1" },
    { k: "ma_vs_ma", label: "均线vs均线", mean: "近N日均线相对近M日均线", formula: "MA_N[t] ÷ MA_M[t] - 1" },
    { k: "ma_vs_ma_lag", label: "均线vs前均线", mean: "近N日均线相对 M 日前 O 日均线", formula: "MA_N[t] ÷ MA_O[t-M] - 1" },
    { k: "close", label: "后复权收盘价", mean: "当日后复权收盘价（截面原值排序）", formula: "close[t]" },
    { k: "open", label: "后复权开盘价", mean: "当日后复权开盘价（截面原值排序）", formula: "open[t]" },
    { k: "high", label: "后复权最高价", mean: "当日后复权最高价（截面原值排序）", formula: "high[t]" },
    { k: "low", label: "后复权最低价", mean: "当日后复权最低价（截面原值排序）", formula: "low[t]" },
    { k: "ma", label: "N日均线", mean: "近N日后复权收盘均值", formula: "MA_N[t] = Σ close[t-N+1..t] ÷ N" },
    { k: "ma_lag", label: "N日前均线", mean: "在 t-N 日处取 M 日均线", formula: "MA_M[t-N]" },
    { k: "amplitude", label: "日内振幅", mean: "当日振幅", formula: "(high[t] - low[t]) ÷ low[t]" },
    { k: "position", label: "日内位置", mean: "收盘价在当日高低区间内的位置", formula: "(close[t] - low[t]) ÷ (high[t] - low[t])" },
    { k: "rsi", label: "RSI", mean: "相对强弱指标（Wilder 平滑：首值取前 N 日涨跌幅简单均值，其后 alpha=1/N 递推）", formula: "RSI = 100 × 均涨 ÷ (均涨 + 均跌)" },
    { k: "turnover", label: "换手率", mean: "N日平均换手率（%）", formula: "Σ turnover[t-N+1..t] ÷ N（%）" },
    { k: "vol_ratio", label: "放量比", mean: "近N日均量 ÷ M日前M日均量（量能放大程度）", formula: "(Σ vol[t-N+1..t] ÷ N) ÷ (Σ vol[t-N-M+1..t-N] ÷ M)" },
    { k: "custom", label: "自定义公式因子", mean: "用现有基础因子按公式四则组合（最少2个成分，先乘除后加减）", formula: "Σ (coefᵢ × factorᵢ)，运算符 + - × ÷" }
  ];
  function renderFactorHelp() {
    var body = document.getElementById("factorHelpBody"); if (!body) return;
    body.innerHTML = "";
    FACTOR_HELP.forEach(function (it, idx) {
      var tr = document.createElement("tr");
      if (idx % 2 === 1) tr.style.background = "rgba(255,255,255,.02)";
      var td1 = document.createElement("td"); td1.style.cssText = "padding:7px 8px;border-bottom:1px solid #1E293B;font-weight:600;color:#60A5FA"; td1.textContent = it.label;
      var td2 = document.createElement("td"); td2.style.cssText = "padding:7px 8px;border-bottom:1px solid #1E293B;color:#CBD5E1"; td2.textContent = it.mean;
      var td3 = document.createElement("td"); td3.style.cssText = "padding:7px 8px;border-bottom:1px solid #1E293B;color:#94A3B8;font-family:ui-monospace,Consolas,monospace"; td3.textContent = it.formula;
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      body.appendChild(tr);
    });
  }
  function openFactorHelp() {
    // 关闭/遮罩绑定延迟到打开时（modal DOM 位于 body 尾部，脚本执行时尚未解析）
    var c = document.getElementById("factorHelpClose");
    if (c && !c._fhBound) { c.addEventListener("click", closeFactorHelp); c._fhBound = true; }
    var m = document.getElementById("factorHelpModal");
    if (m && !m._fhBound) { m.addEventListener("click", function (ev) { if (ev.target === m) closeFactorHelp(); }); m._fhBound = true; }
    renderFactorHelp();
    if (m) { m.style.display = "block"; document.body.style.overflow = "hidden"; }
  }
  function closeFactorHelp() {
    var m = document.getElementById("factorHelpModal");
    if (m) { m.style.display = "none"; document.body.style.overflow = ""; }
  }
  function bindFactorHelp() {
    var b = document.getElementById("factorHelpBtn");
    if (b) b.addEventListener("click", openFactorHelp);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindFactorHelp);
  else bindFactorHelp();

  var factors = [];   // 统一因子列表：{kind, window, window2, window3, weight, direction, usage(rank/filter), op, threshold, name, formula_parts[{kind,window,coef,op}]}

function factorLabel(f) {
  if (f.kind === "custom") return f.name || "自定义";
  var ki = KIND_INFO[f.kind] || KIND_INFO.roc;
  return ki.label;
}
function factorFormulaText(f) {
  if (f.kind !== "custom") return null;
  var parts = f.formula_parts || [];
  var t = [];
  parts.forEach(function (p, pi) {
    var ki2 = KIND_INFO[p.kind] || KIND_INFO.roc;
    var nm = ki2.label + (p.window || 20);
    if (p.window2) nm += ":" + p.window2;
    if (p.window3) nm += ":" + p.window3;
    var c = +p.coef || 0;
    var op = (pi === 0) ? "" : ((p.op === "×" || p.op === "*") ? " × " : (p.op === "÷" || p.op === "/") ? " ÷ " : (p.op === "-" || p.op === "−") ? " − " : " + ");
    t.push(op + (c < 0 ? "-" : "") + Math.abs(c).toFixed(2) + "\u00d7" + nm);
  });
  return t.join(" ");
}
function removeFactor(f) {
  var i = factors.indexOf(f);
  if (i >= 0) factors.splice(i, 1);
  renderMfLib(); renderMfList(); renderFltList();
  scheduleRun();
}
function windowGroupHtml(ki, f) {
  var wg = document.createElement("div");
  wg.style.cssText = "flex:1;min-width:0;display:flex;align-items:center;gap:3px";
  var nw = ki.nwin || 1;
  for (var j = 0; j < nw; j++) {
    (function (jj) {
      var tag = document.createElement("span");
      tag.style.cssText = "flex:0 0 auto;font-size:10px;color:#64748B";
      tag.textContent = ["A", "B", "C"][jj];
      tag.title = (ki.winTitles && ki.winTitles[jj]) || ki.title || "";
      var mn = jj === 0 ? ki.wMin : ki["wMin" + (jj + 1)];
      var mx = jj === 0 ? ki.wMax : ki["wMax" + (jj + 1)];
      var st = jj === 0 ? ki.wStep : ki["wStep" + (jj + 1)];
      var wv = jj === 0 ? (f.window !== undefined ? f.window : ki.def)
               : jj === 1 ? (f.window2 !== undefined ? f.window2 : ki.def2)
               : (f.window3 !== undefined ? f.window3 : ki.def3);
      var inp = document.createElement("input");
      inp.type = "number"; inp.min = mn; inp.max = mx; inp.step = st; inp.value = wv;
      inp.style.cssText = "flex:1;min-width:0;width:34px;font-size:12px;padding:2px 2px;border:1px solid #334155;border-radius:4px";
      inp.title = tag.title;
      inp.addEventListener("input", function () {
        if (jj === 0) f.window = +this.value;
        else if (jj === 1) f.window2 = +this.value;
        else f.window3 = +this.value;
        renderMfLib(); scheduleRun();
      });
      wg.appendChild(tag); wg.appendChild(inp);
    })(j);
  }
  return wg;
}

// ---------- 因子管理面板（总览：名称/公式 + 用途 + 删除） ----------
function renderMfLib() {
  var box = $("mfLibList"); if (!box) return;
  box.innerHTML = "";
  if (!factors.length) {
    var hint = document.createElement("div");
    hint.style.cssText = "font-size:12px;color:#94A3B8;padding:6px 2px;line-height:1.5";
    hint.innerHTML = "当前无因子，策略保持空仓。<br>从下方选择因子类型与归属（排名/筛选）添加，或用公式组合自定义因子。";
    box.appendChild(hint);
  }
  factors.forEach(function (f, idx) {
    var row = document.createElement("div");
    row.className = "row";
    row.style.cssText = "display:flex;align-items:center;margin:3px 0;gap:4px";
    var lab = document.createElement("span");
    lab.style.cssText = "flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    lab.textContent = factorLabel(f);
    var ftxt = factorFormulaText(f);
    lab.title = (f.kind === "custom") ? (f.name + " = " + ftxt) : ((KIND_INFO[f.kind] || {}).title || "");
    if (f.kind === "custom" && ftxt) { lab.textContent = lab.textContent + "  " + ftxt; }
    var uSel = document.createElement("select");
    uSel.style.cssText = "flex:0 0 66px;font-size:11.5px;padding:2px 4px;border:1px solid #334155;border-radius:4px;color:#CBD5E1;background:#111827;appearance:none;-webkit-appearance:none;text-align:center";
    uSel.innerHTML = '<option value="filter">筛选</option><option value="rank">排名</option>';
    uSel.value = f.usage || "rank";
    uSel.title = "归属面板：排名=轮动打分；筛选=过滤条件";
    uSel.addEventListener("change", function () {
      f.usage = this.value;
      if (f.usage === "filter" && f.op === undefined) { f.op = "gte"; f.threshold = 0.0; }
      renderMfLib(); renderMfList(); renderFltList(); scheduleRun();
    });
    var edBtn = null;
    if (f.kind === "custom") {
      edBtn = document.createElement("button");
      edBtn.type = "button"; edBtn.textContent = "\u270e";
      edBtn.style.cssText = "flex:0 0 22px;margin-left:2px";
      edBtn.title = "编辑自定义公式";
      edBtn.addEventListener("click", function () { openCfEditor(f); });
    }
    var del = document.createElement("button");
    del.type = "button"; del.textContent = "\u00d7";
    del.style.cssText = "flex:0 0 22px;margin-left:2px";
    del.title = "删除该因子";
    del.addEventListener("click", function () { removeFactor(f); });
    row.appendChild(lab); row.appendChild(uSel);
    if (edBtn) row.appendChild(edBtn);
    row.appendChild(del);
    box.appendChild(row);
  });
}
$("mfAddBtn").addEventListener("click", function () {
  var kind = $("mfAddKind").value, usage = $("mfAddUsage").value;
  if (kind === "custom") { openCfEditor(null, usage); return; }
  var ki = KIND_INFO[kind] || KIND_INFO.roc;
  var f = { kind: kind, window: ki.def, window2: ki.def2, window3: ki.def3, weight: 0.10, usage: usage };
  if (usage === "filter") { f.op = "gte"; f.threshold = 0.0; }
  factors.push(f);
  renderMfLib(); renderMfList(); renderFltList(); scheduleRun();
});
if ($("mfCat")) {
  $("mfCat").addEventListener("change", function () {
    fillMfKind(this.value);
    var nr = $("cfNameRow");
    if (nr) nr.style.display = (this.value === "custom") ? "flex" : "none";
  });
  fillMfKind($("mfCat").value);
}

// ---------- 排名条件面板（rank 因子：窗口/权重/方向） ----------
function renderMfList() {
  var box = $("mfList"); if (!box) return;
  box.innerHTML = "";
  var sum = 0, rankF = factors.filter(function (f) { return (f.usage || "rank") === "rank"; });
  if (!rankF.length) {
    var hint = document.createElement("div");
    hint.style.cssText = "font-size:12px;color:#94A3B8;padding:6px 2px";
    hint.textContent = "暂无排名因子，请在「因子管理」添加并归属为排名。";
    box.appendChild(hint);
  }
  rankF.forEach(function (f) {
    var ki = KIND_INFO[f.kind] || KIND_INFO.roc;
    sum += f.weight;
    var row = document.createElement("div");
    row.className = "row";
    row.style.cssText = "display:flex;align-items:center;margin:3px 0;gap:4px";
    var lab = document.createElement("span");
    lab.style.cssText = "flex:0 0 78px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    lab.textContent = factorLabel(f);
    lab.title = (f.kind === "custom") ? (f.name + " = " + factorFormulaText(f)) : ((KIND_INFO[f.kind] || {}).title || "");
    var wg;
    if (f.kind === "custom") {
      wg = document.createElement("div");
      wg.style.cssText = "flex:1;min-width:0;display:flex;align-items:center";
      var ft2 = document.createElement("span");
      ft2.style.cssText = "font-size:11px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      ft2.textContent = factorFormulaText(f);
      ft2.title = f.name + " = " + factorFormulaText(f);
      wg.appendChild(ft2);
    } else wg = windowGroupHtml(ki, f);
    var wIn = document.createElement("input");
    wIn.type = "number"; wIn.min = 0; wIn.max = 1; wIn.step = 0.05; wIn.value = f.weight !== undefined ? f.weight : 0.1;
    wIn.style.cssText = "flex:0 0 46px;font-size:12px;padding:2px 2px;border:1px solid #334155;border-radius:4px";
    wIn.title = "排名权重";
    wIn.addEventListener("input", function () { f.weight = +this.value; renderMfList(); renderMfLib(); scheduleRun(); });
    var dSel = document.createElement("select");
    dSel.style.cssText = "flex:0 0 40px;font-size:11.5px;padding:2px 1px;border:1px solid #334155;border-radius:4px;color:#CBD5E1;background:#111827";
    dSel.innerHTML = '<option value="1">正向</option><option value="-1">反向</option>';
    dSel.value = String(f.direction !== undefined ? f.direction : (f.kind === "vol" ? -1 : 1));
    dSel.title = "该因子得分方向";
    dSel.addEventListener("change", function () { f.direction = +this.value; scheduleRun(); });
    var del = document.createElement("button");
    del.type = "button"; del.textContent = "\u00d7";
    del.style.cssText = "flex:0 0 22px;margin-left:2px";
    del.addEventListener("click", function () { removeFactor(f); });
    row.appendChild(lab); row.appendChild(wg); row.appendChild(wIn); row.appendChild(dSel); row.appendChild(del);
    box.appendChild(row);
  });
  $("mfSum").textContent = sum.toFixed(2);
  updateStdSel();
}

// 因子标准化方式：多因子（排名因子>1）时禁用「关闭（none）」，避免不同量纲原始值直接相加
function updateStdSel() {
  var sel = $("stdSel"); if (!sel) return;
  var rankF = factors.filter(function (f) { return (f.usage || "rank") === "rank"; });
  var multi = rankF.length > 1;
  var noneOpt = sel.querySelector('option[value="none"]');
  if (noneOpt) {
    noneOpt.disabled = multi;
    if (multi && sel.value === "none") sel.value = "robust";
  }
}

// ---------- 筛选条件面板（filter 因子：窗口/op/阈值） ----------
function renderFltList() {
  var box = $("fltList"); if (!box) return;
  box.innerHTML = "";
  var fltF = factors.filter(function (f) { return (f.usage || "rank") === "filter"; });
  if (!fltF.length) {
    var hint = document.createElement("div");
    hint.style.cssText = "font-size:12px;color:#94A3B8;padding:6px 2px";
    hint.textContent = "暂无筛选因子（全部标的可参与排名），请在「因子管理」添加并归属为筛选。";
    box.appendChild(hint);
  }
  fltF.forEach(function (f) {
    var ki = KIND_INFO[f.kind] || KIND_INFO.roc;
    var row = document.createElement("div");
    row.className = "row";
    row.style.cssText = "display:flex;align-items:center;margin:3px 0;gap:4px";
    var lab = document.createElement("span");
    lab.style.cssText = "flex:0 0 78px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    lab.textContent = factorLabel(f);
    lab.title = (f.kind === "custom") ? (f.name + " = " + factorFormulaText(f)) : ((KIND_INFO[f.kind] || {}).title || "");
    var wg;
    if (f.kind === "custom") {
      wg = document.createElement("div");
      wg.style.cssText = "flex:1;min-width:0;display:flex;align-items:center";
      var ft3 = document.createElement("span");
      ft3.style.cssText = "font-size:11px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      ft3.textContent = factorFormulaText(f);
      ft3.title = f.name + " = " + factorFormulaText(f);
      wg.appendChild(ft3);
    } else wg = windowGroupHtml(ki, f);
    var opSel = document.createElement("select");
    opSel.style.cssText = "flex:0 0 40px;font-size:11.5px;padding:2px 1px;border:1px solid #334155;border-radius:4px;color:#CBD5E1;background:#111827";
    opSel.innerHTML = '<option value="gte">\u2265</option><option value="lte">\u2264</option>';
    opSel.value = f.op || "gte";
    opSel.addEventListener("change", function () { f.op = this.value; scheduleRun(); });
    var thIn = document.createElement("input");
    thIn.type = "number"; thIn.min = 0; thIn.max = 1000; thIn.step = 1;
    thIn.value = Math.round((f.threshold !== undefined ? f.threshold : 0) * 100);
    thIn.style.cssText = "flex:0 0 46px;font-size:12px;padding:2px 2px;border:1px solid #334155;border-radius:4px";
    thIn.title = "筛选阈值（%）";
    thIn.addEventListener("input", function () { f.threshold = Math.max(0, Math.min(1000, +this.value || 0)) / 100; scheduleRun(); });
    var pct = document.createElement("span");
    pct.style.cssText = "flex:0 0 14px;font-size:12px;color:#64748B"; pct.textContent = "%";
    var del = document.createElement("button");
    del.type = "button"; del.textContent = "\u00d7";
    del.style.cssText = "flex:0 0 22px;margin-left:2px";
    del.addEventListener("click", function () { removeFactor(f); });
    row.appendChild(lab); row.appendChild(wg); row.appendChild(opSel); row.appendChild(thIn); row.appendChild(pct); row.appendChild(del);
    box.appendChild(row);
  });
}

// ---------- 自定义公式因子（formula_parts ≥2 个成分，四则运算 + − × ÷） ----------
var cfParts = [];   // {kind, window, window2, window3, coef, op}
var cfEditIdx = -1;  // >=0 表示编辑已有自定义因子（factors 索引）
var CF_OPS = [["+", " + "], ["-", " − "], ["\u00d7", " × "], ["\u00f7", " ÷ "]];
function cfRowHtml(idx, p) {
  var ki = KIND_INFO[p.kind] || KIND_INFO.roc;
  var opSel = '<select style="flex:0 0 34px;font-size:11.5px;padding:2px 1px;border:1px solid #334155;border-radius:4px;color:#CBD5E1;background:#111827" title="与上一项的运算">' +
    CF_OPS.map(function (o) { return '<option value="' + o[0] + '">' + o[0] + '</option>'; }).join('') + '</select>';
  var wg = '';
  var nw = ki.nwin || 1;
  for (var j = 0; j < nw; j++) {
    wg += '<input type="number" min="' + (j === 0 ? ki.wMin : ki["wMin" + (j + 1)]) + '" max="' + (j === 0 ? ki.wMax : ki["wMax" + (j + 1)]) + '" step="' + (j === 0 ? ki.wStep : ki["wStep" + (j + 1)]) + '" value="' +
      (j === 0 ? (p.window || ki.def) : j === 1 ? (p.window2 || ki.def2 || 0) : (p.window3 || ki.def3 || 0)) + '" style="flex:1;min-width:0;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px" title="' + ((ki.winTitles && ki.winTitles[j]) || "") + '">';
  }
  return '<div class="cfrow" style="display:flex;align-items:center;gap:3px;margin:3px 0">' +
    (idx === 0 ? '<span style="flex:0 0 34px;font-size:12px;color:#94A3B8;text-align:center">=</span>' : opSel) +
    '<select style="flex:1.2;min-width:0;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px">' +
    Object.keys(KIND_INFO).map(function (k) { return '<option value="' + k + '">' + KIND_INFO[k].label + '</option>'; }).join('') +
    '</select>' + wg +
    '<input type="number" step="0.1" value="' + (p.coef || 1) + '" style="flex:0 0 46px;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px" title="系数">' +
    '<button type="button" style="flex:0 0 22px" title="移除成分">\u00d7</button></div>';
}
function renderCf() {
  var box = $("cfParts"); if (!box) return;
  box.innerHTML = "";
  cfParts.forEach(function (p, i) {
    var d = document.createElement("div");
    d.innerHTML = cfRowHtml(i, p);
    var sels = d.querySelectorAll("select");
    var opSel = (i > 0) ? sels[0] : null;
    var kindSel = (i > 0) ? sels[1] : sels[0];
    var ins = d.querySelectorAll("input");
    var co = ins[ins.length - 1], del = d.querySelector("button");
    kindSel.value = p.kind;
    kindSel.addEventListener("change", function () { p.kind = this.value; renderCf(); renderCfFormula(); });
    for (var k = 0; k < ins.length - 1; k++) {
      (function (kk) { ins[kk].addEventListener("input", function () {
        if (kk === 0) p.window = +this.value;
        else if (kk === 1) p.window2 = +this.value;
        else p.window3 = +this.value;
        renderCfFormula();
      }); })(k);
    }
    if (i > 0) opSel.addEventListener("change", function () { p.op = this.value; renderCfFormula(); });
    co.addEventListener("input", function () { p.coef = +this.value; renderCfFormula(); });
    del.addEventListener("click", function () {
      if (cfParts.length > 2) { cfParts.splice(i, 1); renderCf(); renderCfFormula(); }
    });
    box.appendChild(d);
  });
  renderCfFormula();
}
function renderCfFormula() {
  var el = $("cfFormula"); if (!el) return;
  var t = [];
  cfParts.forEach(function (p, pi) {
    var ki2 = KIND_INFO[p.kind] || KIND_INFO.roc;
    var c = +p.coef || 0;
    var op = (pi === 0) ? "" : ((p.op === "\u00d7") ? " × " : (p.op === "\u00f7") ? " ÷ " : (p.op === "-") ? " − " : " + ");
    var nm = ki2.label + (p.window || 20);
    if (p.window2) nm += ":" + p.window2;
    if (p.window3) nm += ":" + p.window3;
    t.push(op + (c < 0 ? "-" : "") + Math.abs(c).toFixed(2) + "\u00d7" + nm);
  });
  el.textContent = "公式 = " + (t.join(" ") || "（至少2个成分）");
}
function openCfEditor(f, usage) {
  cfEditIdx = f ? factors.indexOf(f) : -1;
  $("cfName").value = f ? (f.name || "") : "";
  cfParts = (f && f.formula_parts || []).map(function (pp) {
    return { kind: pp.kind, window: pp.window, window2: pp.window2, window3: pp.window3, coef: pp.coef !== undefined ? pp.coef : 1, op: pp.op || "+" };
  });
  $("cfUsage").value = (f ? ((f.usage || "rank") === "filter" ? "filter" : "rank")
                          : (usage === "filter" ? "filter" : "rank"));
  var ed = $("cfEditor");
  ed.style.display = "block";
  if (!f && !cfParts.length) {
    cfParts = [
      { kind: "roc", window: 20, coef: 1.0, op: "+" },
      { kind: "vol", window: 60, coef: 0.5, op: "+" }
    ];
  }
  renderCf();
}
$("cfAddPart").addEventListener("click", function () {
  cfParts.push({ kind: "roc", window: 20, coef: 1.0, op: "+" });
  renderCf();
});
$("cfCancel").addEventListener("click", function () {
  $("cfEditor").style.display = "none";
  cfEditIdx = -1;
});
$("cfOk").addEventListener("click", function () {
  var nm = ($("cfName").value || "").trim();
  if (!nm) { alert("请输入自定义因子名"); return; }
  if (cfParts.length < 2) { alert("自定义因子至少组合2个成分"); return; }
  var parts = [];
  for (var i = 0; i < cfParts.length; i++) {
    var p = cfParts[i];
    var ki3 = KIND_INFO[p.kind] || KIND_INFO.roc;
    parts.push({ kind: p.kind, window: +(p.window) || ki3.def, window2: p.window2, window3: p.window3, coef: +(p.coef) || 0, op: (i === 0 ? "+" : (p.op || "+")) });
  }
  var usage = ($("cfUsage").value === "filter") ? "filter" : "rank";
  if (cfEditIdx >= 0 && cfEditIdx < factors.length) {
    var oldF = factors[cfEditIdx];
    oldF.name = nm;
    oldF.formula_parts = parts;
    oldF.usage = usage;
    if (usage === "filter" && oldF.op === undefined) { oldF.op = "gte"; oldF.threshold = 0.0; }
  } else {
    var f = { kind: "custom", name: nm, formula_parts: parts, weight: 0.10, usage: usage };
    if (usage === "filter") { f.op = "gte"; f.threshold = 0.0; }
    factors.push(f);
  }
  $("cfEditor").style.display = "none";
  $("cfName").value = "";
  cfEditIdx = -1;
  renderMfLib(); renderMfList(); renderFltList(); scheduleRun();
});

function buildChips() {
    var h2 = $("rebChips"); h2.innerHTML = "";
    REB.forEach(function (v) {
      var b = document.createElement("button"); b.type = "button";
      b.textContent = v.label;
      b.title = "每 " + v.def + " " + v.unit;
      b.className = (v === rebSel ? "on" : "");
      b.addEventListener("click", function () {
        rebSel = v;
        rebAnchor = v.anchorDef || rebAnchor;
        var ri = $("rebIn");
        if (ri && ri.value) {
          var nv = Math.max(v.min, Math.min(v.max, +ri.value || v.def));
          ri.value = nv; rebInterval = nv;
        }
        buildChips(); scheduleRun();
      });
      h2.appendChild(b);
    });
    // 锚点 chips（周=周一/周五；月=月初/月末；季=季初/季末；年=年初/年末；日无锚点）
    var h3 = $("rebAnchorChips"); if (h3) {
      h3.innerHTML = "";
      if (rebSel.anchors) {
        rebSel.anchors.forEach(function (a) {
          var b2 = document.createElement("button"); b2.type = "button";
          b2.textContent = a.label;
          b2.className = (a.value === rebAnchor ? "on" : "");
          b2.addEventListener("click", function () {
            rebAnchor = a.value;
            buildChips(); scheduleRun();
          });
          h3.appendChild(b2);
        });
      } else {
        h3.style.display = "none";
      }
      h3.style.display = rebSel.anchors ? "" : "none";
    }
    var ri = $("rebIn");
    if (ri) {
      ri.min = rebSel.min; ri.max = rebSel.max; ri.value = rebInterval;
      ri.title = "每 " + rebInterval + " " + rebSel.unit;
    }
    var rl = $("rebUnit");
    if (rl) {
      var apx = rebSel.anchors
        ? (rebSel.anchors.filter(function (a) { return a.value === rebAnchor; })[0] || {}).label || ""
        : "";
      rl.textContent = "每" + rebInterval + rebSel.unit + (apx ? "·" + apx : "");
    }
  }
  $("rebIn").addEventListener("input", function () {
    var nv = Math.max(rebSel.min, Math.min(rebSel.max, +this.value || rebSel.def));
    rebInterval = nv;
    $("rebUnit").textContent = "每" + nv + rebSel.unit +
      (rebSel.anchors ? "·" + (rebSel.anchors.filter(function (a) { return a.value === rebAnchor; })[0] || {}).label || "" : "");
    scheduleRun();
  });

  $("cmIn").addEventListener("input", function () { $("cmV").textContent = this.value; scheduleRun(); });
  function syncRankV(commit) {
    var nv = ($("rankNIn").value || "").trim();
    var mv = ($("rankMIn").value || "").trim();
    if (nv === "" || isNaN(+nv)) { if (!commit) return; nv = "1"; }
    if (mv === "" || isNaN(+mv)) { if (!commit) return; mv = nv; }
    var n = Math.max(1, Math.min(60, Math.round(+nv)));
    var m = Math.max(n, Math.min(60, Math.round(+mv)));
    $("rankNIn").value = n; $("rankMIn").value = m;
    $("topnV").textContent = n + "-" + m;
  }
  $("rankNIn").addEventListener("input", function () { syncRankV(false); });
  $("rankMIn").addEventListener("input", function () { syncRankV(false); });
  $("rankNIn").addEventListener("change", function () { syncRankV(true); scheduleRun(); });
  $("rankMIn").addEventListener("change", function () { syncRankV(true); scheduleRun(); });
  $("slIn").addEventListener("input", function () { $("slV").textContent = this.value; scheduleRun(); });
  var mci = $("minCmIn"); if (mci) mci.addEventListener("input", function () { scheduleRun(); });
  if ($("idleSel")) $("idleSel").addEventListener("change", scheduleRun);
  if ($("stdSel")) $("stdSel").addEventListener("change", function () { updateStdSel(); scheduleRun(); });
  // 市场状态风控（合并走弱期机制+大盘择时）控件事件
  $("mmOn").addEventListener("change", scheduleRun);
  $("mmModeSel").addEventListener("change", scheduleRun);
  $("mmWinIn").addEventListener("input", function () { $("mmWV").textContent = this.value; scheduleRun(); });
  $("mmNIn").addEventListener("input", function () { $("mmNV").textContent = this.value; scheduleRun(); });
  $("mmMIn").addEventListener("input", function () { $("mmMV").textContent = this.value; scheduleRun(); });
  $("mmActionSel").addEventListener("change", function () { applyMmActionUI(); scheduleRun(); });
  $("mmCutIn").addEventListener("input", function () { $("mmCV").textContent = this.value; scheduleRun(); });
  $("mmWeakMa").addEventListener("change", scheduleRun);
  // ---------- 市场状态风控：判定指数选择（分组折叠+搜索）与避险标的池（分组折叠+搜索） ----------
  var mmIdxSel = {}, mmCollapsed = {}, mmSearch = "", mmIdxTouched = false;
  // 默认只展开「宽基」组，其余组收起（已勾选组自动展开，不受此状态限制）
  ["风格", "行业主题", "海外", "商品债券", "其他"].forEach(function (g) { mmCollapsed[g] = true; });
  var mmHedgeSel = {}, mmHedgeCollapsed = {}, mmHedgeSearch = "", mmHedgeTouched = false;
  var stOn = false, stWin = 20, stSmallIdx = "000852.SH", stLargeIdx = "000300.SH";
  var RDIDX = null, RDIDXBusy = false;
  var STYLE_SMALL_CODES = ["512100.SH", "563300.SH", "8841431.WI"];
  var STYLE_LARGE_CODES = ["510050.SH", "510300.SH", "159901.SZ", "512550.SH", "563350.SH", "512050.SH"];
  function chipToggle(box, sel, code) {
    return function () {
      sel[code] = !sel[code];
      if (box && box.id === "mmHedgeChips") renderHedgeChips();
      else if (box && box.id === "mmIdxChips") renderMmChips();
      else renderIdxChips(box, sel, box.dataset.kind);
      scheduleRun();
    };
  }
  // 大盘择时可选指数列表：优先用内嵌指数块清单 RDIDX.pool（全部 94 条，含 group 分组），RDIDX 未就绪时回退主块展示指数；始终补沪深300全收益（默认）
  function mmIdxList() {
    var l = (RDIDX && RDIDX.pool && RDIDX.pool.length)
      ? RDIDX.pool.map(function (p) { return { code: p.code, name: p.name, group: p.group }; })
      : (D && D.indexNames ? D.indexNames.map(function (it) { return { code: it.code, name: it.name, group: "宽基" }; }) : []);
    var hasH = false;
    l.forEach(function (x) { if (x.code === "H00300.CSI") hasH = true; });
    if (!hasH) l.push({ code: "H00300.CSI", name: "沪深300全收益", group: "宽基" });
    return l;
  }
  // 状态判定指数分组折叠渲染：按 group 分组，组标题可点击折叠/展开；默认只展开宽基；已勾选组自动展开；搜索时命中组展开、未命中组隐藏
  function renderMmChips() {
    var box = $("mmIdxChips");
    if (!box) return;
    box.innerHTML = "";
    var list = mmIdxList();
    var groups = ["宽基", "风格", "行业主题", "海外", "商品债券", "其他"];
    // 项2：判定指数分组默认全部收起（未设置过的组默认折叠；已勾选组仍自动展开）
    groups.forEach(function (g) { if (mmCollapsed[g] === undefined) mmCollapsed[g] = true; });
    var byG = {};
    groups.forEach(function (g) { byG[g] = []; });
    list.forEach(function (it) { var g = byG[it.group] !== undefined ? it.group : "其他"; byG[g].push(it); });
    var q = mmSearch;
    groups.forEach(function (g) {
      if (!byG[g].length) return;
      var items = byG[g];
      var vis;
      if (q) { vis = items.filter(function (x) { return (x.name || "").toLowerCase().indexOf(q) >= 0 || (x.code || "").toLowerCase().indexOf(q) >= 0; }); if (!vis.length) return; }
      else vis = items;
      var anyOn = items.some(function (x) { return mmIdxSel[x.code]; });
      var collapsed = !q && !anyOn && mmCollapsed[g];
      var hd = document.createElement("div");
      hd.style.cssText = "font-size:12px;color:#94A3B8;cursor:pointer;padding:4px 2px 2px;border-bottom:1px dashed #334155;user-select:none;display:flex;gap:6px;align-items:center;margin-top:4px";
      var caret = document.createElement("span");
      caret.textContent = collapsed ? "▶" : "▼";
      caret.style.cssText = "font-size:9px;color:#64748B";
      var tt = document.createElement("span");
      tt.textContent = g + "（" + items.length + "）";
      hd.appendChild(caret); hd.appendChild(tt);
      (function (g2, anyOn2) { hd.addEventListener("click", function () { if (mmSearch) return; mmCollapsed[g2] = !mmCollapsed[g2]; renderMmChips(); }); })(g, anyOn);
      box.appendChild(hd);
      if (!collapsed) {
        var wr = document.createElement("div");
        wr.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;padding:2px 0 2px 10px";
        vis.forEach(function (it) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = it.name + " " + it.code;
          b.className = mmIdxSel[it.code] ? "chip on" : "chip";
          b.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #334155;border-radius:12px;background:" + (mmIdxSel[it.code] ? "#3B82F6" : "#1E293B") + ";color:#E2E8F0";
          b.addEventListener("click", chipToggle(box, mmIdxSel, it.code));
          wr.appendChild(b);
        });
        box.appendChild(wr);
      }
    });
  }
  // 避险标的池分组折叠渲染：按标的池大类分组（A股宽基/A股风格/行业主题/海外资产/商品债券），默认全展开；已勾选组自动展开；搜索时命中组展开
  function hedgePoolList() {
    return (D && D.pool) ? D.pool.map(function (p) { return { code: p.code, name: p.name, group: p.group }; }) : [];
  }
  function renderHedgeChips() {
    var box = $("mmHedgeChips");
    if (!box) return;
    box.innerHTML = "";
    var list = hedgePoolList();
    var groups = [];
    list.forEach(function (it) { if (groups.indexOf(it.group) < 0) groups.push(it.group); });
    var q = mmHedgeSearch;
    groups.forEach(function (g) {
      var items = list.filter(function (x) { return x.group === g; });
      var vis = q ? items.filter(function (x) { return (x.name || "").toLowerCase().indexOf(q) >= 0 || (x.code || "").toLowerCase().indexOf(q) >= 0; }) : items;
      if (!vis.length) return;
      var anyOn = items.some(function (x) { return mmHedgeSel[x.code]; });
      var collapsed = !q && !anyOn && mmHedgeCollapsed[g];
      var hd = document.createElement("div");
      hd.style.cssText = "font-size:12px;color:#94A3B8;cursor:pointer;padding:4px 2px 2px;border-bottom:1px dashed #334155;user-select:none;display:flex;gap:6px;align-items:center;margin-top:4px";
      var caret = document.createElement("span");
      caret.textContent = collapsed ? "▶" : "▼";
      caret.style.cssText = "font-size:9px;color:#64748B";
      var tt = document.createElement("span");
      tt.textContent = g + "（" + items.length + "）";
      hd.appendChild(caret); hd.appendChild(tt);
      (function (g2) { hd.addEventListener("click", function () { if (mmHedgeSearch) return; mmHedgeCollapsed[g2] = !mmHedgeCollapsed[g2]; renderHedgeChips(); }); })(g);
      box.appendChild(hd);
      if (!collapsed) {
        var wr = document.createElement("div");
        wr.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;padding:2px 0 2px 10px";
        vis.forEach(function (it) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = it.name + " " + it.code;
          b.className = mmHedgeSel[it.code] ? "chip on" : "chip";
          b.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #334155;border-radius:12px;background:" + (mmHedgeSel[it.code] ? "#10B981" : "#1E293B") + ";color:#E2E8F0";
          b.addEventListener("click", chipToggle(box, mmHedgeSel, it.code));
          wr.appendChild(b);
        });
        box.appendChild(wr);
      }
    });
  }
  // 避险动作 UI 联动：cut 显示比例输入、switch 显示避险池多选
  function applyMmActionUI() {
    var a = $("mmActionSel") ? $("mmActionSel").value : "cut";
    if ($("mmCutRow")) $("mmCutRow").style.display = a === "cut" ? "" : "none";
  }
  function renderIdxChips(box, sel, kind) {
    if (!box) return;
    if (kind === "timing" || box.id === "mmIdxChips") { renderMmChips(); return; }
    box.innerHTML = "";
    var list = D && D.indexNames ? D.indexNames : [];
    list.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = it.name;
      b.className = sel[it.code] ? "chip on" : "chip";
      b.style.padding = "2px 8px";
      b.addEventListener("click", chipToggle(box, sel, it.code));
      box.appendChild(b);
    });
  }
  function buildIdxChips() {
    mmIdxTouched = true; mmHedgeTouched = true;
    mmIdxList().forEach(function (it) { mmIdxSel[it.code] = false; });
    renderIdxChips($("mmIdxChips"), mmIdxSel, "timing");
    renderHedgeChips();
    applyMmActionUI();
  }
  $("startSel").addEventListener("change", function () {
    startDate = this.value;
    if (startDate > endDate) { endDate = startDate; if ($("endSel")) $("endSel").value = endDate; }
    updateSurvivorTip(); scheduleRun();
  });
  if ($("endSel")) $("endSel").addEventListener("change", function () {
    endDate = this.value;
    if (endDate < startDate) { showNotice("结束日期不能早于起始日期，已回退为起始日期"); endDate = startDate; this.value = endDate; }
    scheduleRun();
  });
  if ($("hwSel")) $("hwSel").addEventListener("change", scheduleRun);
  if ($("tierSw")) $("tierSw").addEventListener("change", scheduleRun);
  if ($("rebWeightMode")) $("rebWeightMode").addEventListener("change", function () { applyModeUI(); scheduleRun(); });

  var startOptions = ["2016-06-01", "2017-01-01", "2018-01-01", "2019-01-01", "2020-01-01", "2021-01-01", "2022-01-01", "2023-01-01", "2024-01-01"];
  var sdEl = $("startSel");
  if (sdEl && sdEl.tagName === "SELECT") {
    startOptions.forEach(function (d) {
      var o = document.createElement("option");
      o.value = d; o.textContent = d;
      sdEl.appendChild(o);
    });
  }
  if (sdEl) sdEl.value = startDate;
  var edEl = $("endSel");
  if (edEl) edEl.value = endDate;

  $("collapseBtn").addEventListener("click", function () {
    var p = $("panel");
    p.classList.toggle("closed");
    this.textContent = p.classList.contains("closed") ? "展开" : "收起";
    window.dispatchEvent(new Event("resize"));
  });

  // ---------- 三组附加交易条件（买入附加 / 卖出 / 不卖） ----------
  var buyAdds = [], sellConds = [], holdConds = [];
  var BA_LABEL = {
    rank: "排名名次 ≤ N", rank_gte: "排名名次 ≥ N", cooldown: "距上次卖出 ≥ N 天",
    factor: "因子判断", hold_days: "持有天数 ≥ N", buy_gain: "买入后涨幅 ≥ N%",
    buy_loss: "买入后跌幅 ≥ N%", high_dd: "买入后最高点回撤 ≥ N%"
  };
  function factorMiniHtml(f) {
    var ki = KIND_INFO[f.kind] || KIND_INFO.roc;
    var nm = ki.label + (f.window || ki.def);
    if (f.window2) nm += ":" + f.window2;
    return nm + " " + (f.op === "lte" ? "≤" : "≥") + " " + (f.threshold !== undefined ? Math.round(f.threshold * 100) : 0) + "%";
  }
  function condText(c, panel) {
    if (c.type === "factor") return "因子判断 · " + factorMiniHtml(c);
    if (c.type === "rank") {
      // 卖出面板的排名名次恒为 ≥；其余面板按 op 显示（rank=≤ 默认 / rank_gte=≥）
      var gte = (c.op === "gte") || panel === "sell";
      return (gte ? "排名名次 ≥ N" : "排名名次 ≤ N") + " = " + c.value;
    }
    return (BA_LABEL[c.type] || c.type) + " = " + c.value;
  }
  function renderCond(list, boxId, countId, panel) {
    var box = $(boxId); if (!box) return;
    box.innerHTML = "";
    list.forEach(function (c, i) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;margin:3px 0;gap:4px";
      var lab = document.createElement("span");
      lab.style.cssText = "flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      lab.textContent = (i + 1) + ". " + condText(c, panel);
      lab.title = condText(c, panel);
      var del = document.createElement("button");
      del.type = "button"; del.textContent = "\u00d7";
      del.style.cssText = "flex:0 0 22px";
      del.addEventListener("click", function () { list.splice(i, 1); renderAllCond(); scheduleRun(); });
      row.appendChild(lab); row.appendChild(del);
      box.appendChild(row);
    });
    var ct = $(countId); if (ct) ct.textContent = list.length + " 个";
  }
  function renderAllCond() {
    renderCond(buyAdds, "buyAddList", "buyAddCount", "buy");
    renderCond(sellConds, "sellList", "sellCount", "sell");
    renderCond(holdConds, "holdList", "holdCount", "hold");
  }
  function condFactorRow(selKind, valIn) {
    // factor 类型时显示因子配置行（kind/window/op/threshold）
    var old = document.getElementById(selKind.id + "_fac");
    if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = selKind.id + "_fac";
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px";
    var kSel = document.createElement("select");
    kSel.style.cssText = "flex:1;min-width:0;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px";
    Object.keys(KIND_INFO).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = KIND_INFO[k].label;
      kSel.appendChild(o);
    });
    var wIn = document.createElement("input");
    wIn.type = "number"; wIn.min = 1; wIn.max = 250; wIn.value = 20;
    wIn.style.cssText = "flex:0 0 52px;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px";
    wIn.title = "因子窗口";
    var opSel = document.createElement("select");
    opSel.style.cssText = "flex:0 0 46px;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px";
    opSel.innerHTML = '<option value="gte">\u2265</option><option value="lte">\u2264</option>';
    var thIn = document.createElement("input");
    thIn.type = "number"; thIn.step = 1; thIn.value = 0;
    thIn.style.cssText = "flex:0 0 56px;font-size:12px;padding:2px;border:1px solid #334155;border-radius:4px";
    thIn.title = "阈值（%）";
    wrap.appendChild(kSel); wrap.appendChild(wIn); wrap.appendChild(opSel); wrap.appendChild(thIn);
    var row = selKind.closest(".psec") || selKind.parentElement.parentElement;
    row.appendChild(wrap);
    return { kindSel: kSel, wIn: wIn, opSel: opSel, thIn: thIn, wrap: wrap };
  }
  function bindCondAdd(selKind, valIn, btn, arr) {
    btn.addEventListener("click", function () {
      var t = selKind.value;
      if (t === "factor") {
        // 读取现有因子配置行（无则先创建）；不重建，保留用户已填的 kind/窗口/符号/阈值
        var w = document.getElementById(selKind.id + "_fac");
        if (!w) { condFactorRow(selKind, valIn); w = document.getElementById(selKind.id + "_fac"); }
        var kSel = w.children[0], wIn = w.children[1], opSel = w.children[2], thIn = w.children[3];
        arr.push({ type: "factor", kind: kSel.value, window: +wIn.value || 20,
                   op: opSel.value, threshold: Math.max(-1000, Math.min(1000, +thIn.value || 0)) / 100 });
      } else {
        var realT = t === "rank_gte" ? "rank" : t;
        var o = { type: realT, value: Math.max(1, +valIn.value || 1) };
        if (t === "rank_gte") o.op = "gte";
        arr.push(o);
      }
      renderAllCond(); scheduleRun();
      // 配置行保留：便于连续调整后添加多个因子判断
    });
  }
  // 各面板：类型切换时 factor 显示因子配置行
  function wireFacRow(selKind, valIn) {
    selKind.addEventListener("change", function () {
      var old = document.getElementById(selKind.id + "_fac");
      if (old) old.remove();
      if (this.value === "factor") condFactorRow(selKind, valIn);
    });
  }
  if ($("buyAddBtn")) {
    wireFacRow($("buyAddKind"), $("buyAddVal"));
    bindCondAdd($("buyAddKind"), $("buyAddVal"), $("buyAddBtn"), buyAdds);
  }
  if ($("sellBtn")) {
    wireFacRow($("sellKind"), $("sellVal"));
    bindCondAdd($("sellKind"), $("sellVal"), $("sellBtn"), sellConds);
  }
  if ($("holdBtn")) {
    wireFacRow($("holdKind"), $("holdVal"));
    bindCondAdd($("holdKind"), $("holdVal"), $("holdBtn"), holdConds);
  }

  // ---------- 参数收集 ----------
  function getParams() {
    var codes = [], onlyRotCodes = [];
    var cmG = activeView === "rebalance" ? rebalanceChecked : poolChecked;
    (D ? D.pool : POOL).forEach(function (p) {   // D 未解析（第一步）时用全局池元信息
      if (cmG[p.code]) codes.push(p.code);
      if (onlyRot[p.code]) onlyRotCodes.push(p.code);
    });
    return {
      codes: codes,
      only_rotation_codes: onlyRotCodes,
      cooldown_days: 0,
      factors: factors.map(function (f) {
        var o = { kind: f.kind, window: f.window, window2: f.window2, window3: f.window3,
                  weight: f.weight !== undefined ? f.weight : 0.1,
                  direction: f.direction !== undefined ? f.direction : (f.kind === "vol" ? -1 : 1),
                  usage: f.usage || "rank" };
        if (f.kind === "custom") {
          o.name = f.name;
          o.formula_parts = (f.formula_parts || []).map(function (p) {
            return { kind: p.kind, window: p.window, window2: p.window2, window3: p.window3, coef: p.coef, op: p.op };
          });
        }
        if ((f.usage || "rank") === "filter") { o.op = f.op || "gte"; o.threshold = f.threshold !== undefined ? f.threshold : 0; }
        return o;
      }),
      top_n: 0,
      rank_n: Math.max(1, Math.min(60, +$("rankNIn").value || 1)),
      rank_m: Math.max(1, Math.min(60, +$("rankMIn").value || 1)),
      standardize: $("stdSel") ? $("stdSel").value : "robust",
      buy_add: buyAdds.map(function (c) {
        if (c.type === "factor") return { type: "factor", kind: c.kind, window: c.window, op: c.op, threshold: c.threshold };
        return { type: c.type, op: c.op || "lte", value: c.value };
      }),
      sell_conds: sellConds.map(function (c) {
        if (c.type === "factor") return { type: "factor", kind: c.kind, window: c.window, op: c.op, threshold: c.threshold };
        return { type: c.type, value: c.value };
      }),
      hold_conds: holdConds.map(function (c) {
        if (c.type === "factor") return { type: "factor", kind: c.kind, window: c.window, op: c.op, threshold: c.threshold };
        return { type: c.type, value: c.value };
      }),
      mode: activeView === "rebalance" ? "rebalance" : "rotation",
      reb_weights: (function () {
        var o = {}, n = checkedCodes().length;
        checkedCodes().forEach(function (p) { o[p.code] = Math.round(wFor(p.code, n) * 100) / 10000; });
        return o;
      })(),
      reb_codes: checkedCodes().map(function (p) { return p.code; }),
      reb_weight_mode: $("rebWeightMode") ? $("rebWeightMode").value : "fixed",
      rebalance_mode: rebSel.mode,
      rebalance_interval: rebInterval,
      rebalance_anchor: rebAnchor,
      annualize_factor: 252,
      score_floor: 0,
      r2_filter_mode: "normal_only",
      mm_on: $("mmOn").checked,
      mm_bench: (function () { var r = []; Object.keys(mmIdxSel).forEach(function (k) { if (mmIdxSel[k]) r.push(k); }); return r; })(),
      mm_mode: $("mmModeSel") ? $("mmModeSel").value : "any",
      mm_window: +($("mmWinIn") ? $("mmWinIn").value : 20) || 20,
      mm_enter_days: +($("mmNIn") ? $("mmNIn").value : 3) || 3,
      mm_exit_days: +($("mmMIn") ? $("mmMIn").value : 3) || 3,
      mm_action: "cut",
      mm_cut_pct: +($("mmCutIn") ? $("mmCutIn").value : 50) || 0,
      mm_hedge_pool: [],
      mm_weak_ma: $("mmWeakMa") ? $("mmWeakMa").checked : false,
      fallback_when_no_signal: $("idleSel") ? $("idleSel").value : "cash",
      commission_rate: (+$("cmIn").value) / 10000,
      slippage_rate: (+$("slIn").value) / 10000,
      tiered_slippage: $("tierSw") ? $("tierSw").checked : false,
      min_commission: (+$("minCmIn").value) || 0,
      use_real_pool: $("realPoolSw") ? $("realPoolSw").checked : false,
      holding_weight: $("hwSel") ? $("hwSel").value : "equal",
      start_date: startDate,
      end_date: endDate,
      initial_capital: Math.max(1000, +$("stInvIn").value || 1000000),
      risk_free_rate: 0.02,
      overseas_codes: D ? D.overseas : [],
      st_on: $("stOn") ? $("stOn").checked : false,
      st_small_idx: $("stSmallSel") ? $("stSmallSel").value : "000852.SH",
      st_large_idx: $("stLargeSel") ? $("stLargeSel").value : "000300.SH",
      st_window: +($("stWinIn") ? $("stWinIn").value : 20) || 20,
      st_small_codes: STYLE_SMALL_CODES,
      st_large_codes: STYLE_LARGE_CODES,
      // 功能2：指数数据源切换 / 功能3：自定义基准
      benchmark: benchSelVal()
    };
  }
  function benchSelVal() {
    var b = $("benchSel");
    return b && b.value ? b.value : "H00300.CSI";
  }
  function benchLabel() {
    var b = $("benchSel");
    if (b && b.options && b.selectedIndex >= 0) return b.options[b.selectedIndex].textContent || b.value;
    if (RDIDX && RDIDX.pool) {
      for (var bi2 = 0; bi2 < RDIDX.pool.length; bi2++) if (RDIDX.pool[bi2].code === benchSelVal()) return RDIDX.pool[bi2].name + " " + RDIDX.pool[bi2].code;
    }
    return benchSelVal();
  }
  function benchLabelShort() {
    var n = benchLabel();
    return n.length > 14 ? n.slice(0, 12) + "…" : n;
  }

  // ---------- 策略保存 / 加载（localStorage 策略库 + 导出/导入 JSON） ----------
  var ST_KEY = "wufu_strategies_v1";
  function loadStored() {
    try { return JSON.parse(localStorage.getItem(ST_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function storeAll(m) {
    try { localStorage.setItem(ST_KEY, JSON.stringify(m)); } catch (e) { showNotice("保存失败：" + e.message); }
  }
  function refreshStList() {
    var sel = $("stList"); if (!sel) return;
    var m = loadStored();
    sel.innerHTML = "";
    Object.keys(m).forEach(function (k) {
      var o = document.createElement("option"); o.value = k; o.textContent = k; sel.appendChild(o);
    });
    $("stCount").textContent = Object.keys(m).length + " 个";
  }
  function applyParams(p) {
    if (!p) return;
    // 标的池（只更新数据层，随后 renderPool() 重建界面，保证大类回显/子项勾选一致）
    var want = p.codes || [];
    var wantRot = p.only_rotation_codes || [];
    // 策略类型路由：先切视图（轮动/再平衡），再写各自独立勾选状态
    if (p.mode === "rebalance" || p.mode === "rotation") showView(p.mode === "rebalance" ? "rebalance" : "rotation");
    var cmA = activeView === "rebalance" ? rebalanceChecked : poolChecked;
    (D ? D.pool : POOL).forEach(function (it) {
      cmA[it.code] = want.indexOf(it.code) >= 0;
      onlyRot[it.code] = wantRot.indexOf(it.code) >= 0;
    });
    rebW = {};
    var rw = p.reb_weights || {};
    Object.keys(rw).forEach(function (c) { rebW[c] = Math.round(rw[c] * 10000) / 100; });
    renderPool();   // 重建标的池界面（大类回显/子项勾选/仅轮动同步）
    applyModeUI();
    updatePoolCount();
    renderSelSummary();   // 同步第二步顶部的已选标的摘要
    // 排名方向
    // 卖出冷却
    var cd = $("cdIn");
    if (cd) { cd.value = +(p.cooldown_days) || 0; $("cdV").textContent = cd.value; }
    // 统一因子（新结构 factors 含 usage；兼容旧策略：factors=排名、filters=筛选 合并）
    // 溢价率因子已下线（净值数据不全）：加载旧策略时自动剔除
    var droppedPremium = 0;
    factors = (p.factors || []).filter(function (f) { if (f.kind === "premium") { droppedPremium++; return false; } return true; }).map(function (f) {
      return { kind: f.kind, window: f.window, window2: f.window2, window3: f.window3,
               weight: f.weight !== undefined ? f.weight : 0.1,
               direction: f.direction !== undefined ? f.direction : (f.kind === "vol" ? -1 : 1),
               usage: f.usage || "rank", name: f.name, formula_parts: f.formula_parts,
               op: f.op, threshold: f.threshold };
    });
    (p.filters || []).forEach(function (ft) {
      factors.push({ kind: ft.kind, window: ft.window, window2: ft.window2, window3: ft.window3,
                     op: ft.op, threshold: ft.threshold, usage: "filter", weight: 0 });
    });
    if (droppedPremium) showNotice("旧策略中的溢价率因子已下线（净值数据不全），已自动剔除");
    if (activeView === "rotation") {
      renderMfLib();
      renderMfList();
      renderFltList();
    }
    if ($("stdSel")) { $("stdSel").value = p.standardize || "robust"; }
    updateStdSel();
    var rn = $("rankNIn"), rm = $("rankMIn");
    if (rn && rm) {
      var rNv = Math.max(1, +(p.rank_n) || 1);
      var rMv = Math.max(rNv, +(p.rank_m) || (p.top_n ? Math.max(rNv, +(p.top_n) || 1) : rNv));
      rn.value = rNv; rm.value = rMv;
      syncRankV();
    }
    // 三组附加交易条件回填
    buyAdds = (p.buy_add || []).map(function (c) { return JSON.parse(JSON.stringify(c)); });
    sellConds = (p.sell_conds || []).map(function (c) { return JSON.parse(JSON.stringify(c)); });
    holdConds = (p.hold_conds || []).map(function (c) { return JSON.parse(JSON.stringify(c)); });
    renderAllCond();
    // 调仓周期
    var mode = p.rebalance_mode || "weekly", rs = null;
    REB.forEach(function (v) { if (v.mode === mode) rs = v; });
    rebSel = rs || REB[1];
    rebInterval = +(p.rebalance_interval) || rebSel.def;
    rebAnchor = p.rebalance_anchor || rebSel.anchorDef || "";
    buildChips();
    // 交易成本
    var cm = $("cmIn"), sl = $("slIn");
    if (cm) { cm.value = +(p.commission_rate) * 10000 || 2.5; $("cmV").textContent = cm.value; }
    if (sl) { sl.value = +(p.slippage_rate) * 10000 || 5; $("slV").textContent = sl.value; }
    if ($("tierSw")) $("tierSw").checked = !!p.tiered_slippage;
    if ($("realPoolSw")) $("realPoolSw").checked = p.use_real_pool !== false;
    if ($("minCmIn")) $("minCmIn").value = +(p.min_commission) || 0;
    if ($("hwSel")) $("hwSel").value = p.holding_weight || "equal";
    if ($("rebWeightMode")) $("rebWeightMode").value = p.reb_weight_mode || "fixed";
    if ($("idleSel")) $("idleSel").value = p.fallback_when_no_signal || "cash";
    // 市场状态风控（合并走弱期机制+大盘择时）：参数恢复 + 老策略迁移
    if ($("mmOn") && $("mmWinIn")) {
      var oldRF = p.use_regime_filter, oldWP = p.weak_period_mode, oldMt = p.mt_on;
      var mmMigrated = false;
      var mmOnNew = p.mm_on !== undefined ? !!p.mm_on : (!!oldRF || !!oldMt);
      var mmActionNew = p.mm_action;
      if (mmActionNew === undefined) {
        mmMigrated = true;
        if (oldRF && (oldWP === "cash" || oldWP === "overseas_pool")) mmActionNew = "cut";   // 旧空仓/换池 → 降至0%（空仓，最保守）
        else if (oldRF) mmActionNew = "cut";   // full_pool：走弱期仍全池轮动 → 等价降至100%
        else if (oldMt) mmActionNew = "cut";
        else { mmActionNew = "cut"; mmOnNew = false; }
      }
      if (mmActionNew === "cut") {
        var mmCutNew = p.mm_cut_pct !== undefined ? p.mm_cut_pct : (oldRF && (oldWP === "cash" || oldWP === "overseas_pool")) ? 0 : (oldMt && !oldRF ? Math.round(+(p.mt_min_pos || 0) * 100) : 100);
        $("mmCutIn").value = Math.max(0, Math.min(100, +mmCutNew || 0)); $("mmCV").textContent = $("mmCutIn").value;
      }
      var mmNNew = p.mm_enter_days !== undefined ? p.mm_enter_days : (oldMt && !oldRF ? 1 : 3);
      var mmMNew = p.mm_exit_days !== undefined ? p.mm_exit_days : (oldMt && !oldRF ? 1 : 3);
      $("mmNIn").value = mmNNew; $("mmNV").textContent = mmNNew;
      $("mmMIn").value = mmMNew; $("mmMV").textContent = mmMNew;
      $("mmOn").checked = mmOnNew;
      $("mmModeSel").value = p.mm_mode || (oldMt && p.mt_mode ? p.mt_mode : "any");
      var mmWinNew = p.mm_window !== undefined ? p.mm_window : (oldRF ? (p.regime_ma_window || 10) : (oldMt ? (p.mt_window || 20) : 20));
      $("mmWinIn").value = mmWinNew; $("mmWV").textContent = mmWinNew;
      var mmWant = [];
      if (Object.prototype.toString.call(p.mm_bench) === "[object Array]") mmWant = p.mm_bench.slice();
      else if (typeof p.mm_bench === "string" && p.mm_bench) mmWant = [p.mm_bench];
      else if (oldMt && p.mt_bench) mmWant = Object.prototype.toString.call(p.mt_bench) === "[object Array]" ? p.mt_bench.slice() : [p.mt_bench];
      else if (oldRF && p.regime_indices && p.regime_indices.length) mmWant = p.regime_indices.map(function (ic) { return (ic || "").replace(/^index_/, ""); });
      if (!mmWant.length) mmWant = ["H00300.CSI"];
      // 指数数据精简：已保存策略勾选被移除指数（行业主题/风格非中证红利）时剔除并提示
      if (mmWant.length) {
        var mmValid = {};
        if (RDIDX && RDIDX.pool) RDIDX.pool.forEach(function (px) { mmValid[px.code] = 1; });
        var mmDropped = [];
        mmWant = mmWant.filter(function (cc) { if (mmValid[cc]) return true; mmDropped.push(cc); return false; });
        if (mmDropped.length) {
          var tipDrop = $("mmMigrateTip");
          if (tipDrop) {
            tipDrop.style.display = "";
            tipDrop.textContent = "所选指数 " + mmDropped.join("/") + " 已从指数池移除，本次加载已自动剔除；";
            setTimeout(function () { tipDrop.style.display = "none"; }, 6000);
          }
        }
      }
      mmIdxList().forEach(function (it) { mmIdxSel[it.code] = mmWant.indexOf(it.code) >= 0; });
      renderIdxChips($("mmIdxChips"), mmIdxSel, "timing");
      $("mmActionSel").value = "cut";
      $("mmWeakMa").checked = p.mm_weak_ma !== undefined ? !!p.mm_weak_ma : !!p.weak_period_use_ma_filter;
      mmIdxTouched = true; mmHedgeTouched = true;
      applyMmActionUI();
      if (mmMigrated) {
        var tip = $("mmMigrateTip");
        if (tip) {
          tip.style.display = "";
          tip.textContent = "策略已迁移至「市场状态风控」：走弱期机制与大盘择时已合并，动作/迟滞参数按新语义映射。";
          setTimeout(function () { tip.style.display = "none"; }, 6000);
        }
      }
    }
    if ($("stOn")) $("stOn").checked = !!p.st_on;
    if ($("stSmallSel") && p.st_small_idx) $("stSmallSel").value = p.st_small_idx;
    if ($("stLargeSel") && p.st_large_idx) $("stLargeSel").value = p.st_large_idx;
    if ($("stWinIn")) { $("stWinIn").value = +(p.st_window) || 20; $("stV").textContent = $("stWinIn").value; }
    if ($("benchSel") && p.benchmark) $("benchSel").value = p.benchmark;
    // 回测区间
    if (p.start_date && $("startSel").value !== p.start_date) {
      startDate = p.start_date; $("startSel").value = p.start_date;
      if (p.initial_capital) $("stInvIn").value = p.initial_capital;
    }
    if (p.end_date && $("endSel") && $("endSel").value !== p.end_date) {
      endDate = p.end_date; $("endSel").value = p.end_date;
    }
    scheduleRun();   // 参数恢复后自动重跑回测
  }
  $("saveSt").addEventListener("click", function () {
    var name = $("stName").value.trim();
    if (!name) { showNotice("请先填写策略名"); return; }
    try {
      var m = loadStored();
      var p = getParams();
      p._saved_at = new Date().toISOString();
      m[name] = p;
      storeAll(m); refreshStList(); renderStrategyList();
      showNotice("策略已保存：" + name + "（本地存储按链接CDN域隔离，换链接/换设备请用「导出全部/导入全部」迁移）");
    } catch (e) {
      showNotice("保存失败：" + e.message);
    }
  });
  $("loadSt").addEventListener("click", function () {
    var name = $("stList").value; if (!name) return;
    var m = loadStored();
    if (!m[name]) return;
    if (m[name].type === "grid") { applyGridStrategy(name); return; }
    applyParams(m[name]);
    $("stName").value = name;
    showNotice("已加载策略：" + name);
  });
  // 选中策略时把名字填入输入框（便于重命名/覆盖保存）
  $("stList").addEventListener("change", function () {
    var name = this.value;
    if (name) $("stName").value = name;
  });
  $("renSt").addEventListener("click", function () {
    var oldName = $("stList").value;
    var newName = $("stName").value.trim();
    if (!oldName) { showNotice("请先在列表中选择要重命名的策略"); return; }
    if (!newName) { showNotice("请先填写新的策略名"); return; }
    var m = loadStored();
    if (!m[oldName]) return;
    if (newName !== oldName && m[newName]) { showNotice("策略名已存在：" + newName); return; }
    if (newName !== oldName) {
      m[newName] = m[oldName];
      delete m[oldName];
      storeAll(m); refreshStList(); renderStrategyList();
      $("stList").value = newName;
      showNotice("已重命名：" + oldName + " → " + newName);
    } else {
      showNotice("新旧名称相同，无需重命名");
    }
  });
  $("delSt").addEventListener("click", function () {
    var name = $("stList").value; if (!name) return;
    var m = loadStored(); delete m[name]; storeAll(m); refreshStList(); renderStrategyList();
    showNotice("已删除策略：" + name);
  });
  function _saveFile(name, content) {
    // iOS Safari / 部分内嵌 webview 不支持 <a download> 自动下载，直接走复制通道
    if (/iPad|iPhone|iPod/.test(navigator.userAgent || "")) return false;
    try {
      var blob = new Blob([content], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) { return false; }
  }
  function _copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); return true; } } catch (e) {}
    try {
      var ta = document.createElement("textarea"); ta.value = t;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true;
    } catch (e2) {}
    return false;
  }
  // 导出：能自动下载则直接保存文件；浏览器不支持时复制到剪贴板（免手动另存）
  $("exportSt").addEventListener("click", function () {
    var p = getParams();
    var name = $("stName").value.trim() || ("策略_" + new Date().toISOString().slice(0, 10));
    var json = JSON.stringify({ name: name, saved_at: new Date().toISOString(), params: p }, null, 2);
    if (_saveFile(name + ".json", json)) showNotice("已导出策略 JSON 并直接保存：" + name);
    else if (_copyText(json)) showNotice("当前浏览器不能自动下载，JSON 已复制到剪贴板，粘贴即可保存为 " + name + ".json");
    else showNotice("导出失败，请手动复制代码保存");
  });
  $("exportAllSt").addEventListener("click", function () {
    var m = loadStored();
    var keys = Object.keys(m);
    if (!keys.length) { showNotice("暂无可导出的策略"); return; }
    var json = JSON.stringify({ version: 1, strategies: m }, null, 2);
    if (_saveFile("wufu_strategies_all.json", json)) showNotice("已导出全部 " + keys.length + " 个策略并直接保存（跨链接/设备迁移用）");
    else if (_copyText(json)) showNotice("当前浏览器不能自动下载，JSON 已复制到剪贴板，粘贴即可保存为 wufu_strategies_all.json");
    else showNotice("导出失败");
  });
  $("importAllSt").addEventListener("click", function () { $("impAllFile").click(); });
  $("impAllFile").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    var self = this;
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result);
        var src = (j && j.strategies && typeof j.strategies === "object") ? j.strategies : null;
        if (!src) { showNotice("文件格式不对：请使用「导出全部」生成的 JSON"); return; }
        var m = loadStored();
        var n = 0, names = Object.keys(src);
        names.forEach(function (k) {
          var v = src[k];
          if (v && typeof v === "object") { if (!v._saved_at) v._saved_at = new Date().toISOString(); m[k] = v; n++; }
        });
        storeAll(m); refreshStList();
        renderStrategyList();
        showNotice("已导入 " + n + " 个策略（同名已覆盖）");
      } catch (e) {
        showNotice("导入失败：" + e.message);
      }
      self.value = "";
    };
    rd.readAsText(f);
  });
  $("importSt").addEventListener("click", function () { $("impFile").click(); });
  $("impFile").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    var self = this;
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result);
        var p = j.params || j;                       // 兼容 {name, params} 或纯 params
        var name = (j.name || "").trim();
        applyParams(p);
        if (name) {
          var m = loadStored(); m[name] = p; storeAll(m); refreshStList(); renderStrategyList();
          $("stName").value = name;
        }
        showNotice("已导入并应用策略：" + (name || "未命名"));
      } catch (e) { showNotice("导入失败：" + e.message); }
      self.value = "";
    };
    rd.readAsText(f);
  });
  refreshStList();

  // ---------- 运行与渲染 ----------
  var timer = null;
  function scheduleRun() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 300);
  }

  function run() {
    var params = getParams();
    if (params.codes.length === 0) {
      showNotice("请至少勾选 1 只标的");
      return;
    }
    if (params.mode !== "rebalance" && !(params.sell_conds || []).length) {
      showNotice("卖出条件至少选择 1 个才能回测（轮动策略）");
      return;
    }
    if (params.rank_m < params.rank_n) {
      showNotice("持有排名区间需满足 M ≥ N");
      return;
    }
    if (params.mode !== "rebalance") {
      var rankFacs = (params.factors || []).filter(function (f) { return (f.usage || "rank") === "rank"; });
      if (!rankFacs.length) {
        showNotice("排名条件暂无因子：回测将全程空仓（收益为0）。请先在「因子管理」添加排名因子");
        return;
      }
    }
    var notices = [];
    var idleMap = { cash: null, gold: "518880.SH", bond: "511010.SH", money: "511990.SH" };
    var idleC = idleMap[params.fallback_when_no_signal];
    if (idleC) {
      notices.push("空仓时持有标的「" + (params.fallback_when_no_signal === "gold" ? "黄金ETF" : params.fallback_when_no_signal === "bond" ? "国债ETF" : "货币ETF") + "」未勾选也生效：候选不足或持仓为空时，剩余/全部仓位自动补持该标的");
    }
    showNotice(notices.join("；"));

    var t0 = Date.now();
    $("runState").textContent = "计算中…";
    ensureRDIDX(function () {
      var res;
      try {
        params.benchmark = benchSelVal();
        res = engine.backtest(D, params);
      } catch (e) {
        showNotice("回测失败：" + e.message);
        $("runState").textContent = "失败";
        return;
      }
      $("runState").textContent = "已更新 · " + (Date.now() - t0) + "ms · " + res.metrics.n_days + "个交易日";
      renderKpis(res);
      renderNav(res);
      renderDD(res);
      renderYear(res);
      renderMonth(res);
      renderTrades(res, getParams());
      renderCompositeIC(res, getParams(), D);
    });
  }

  function renderCompositeIC(res, params, D) {
    var card = $("cICCard");
    if (!card) return;
    var snaps = res.ic_snapshots;
    if (!snaps || !snaps.length) { card.style.display = "none"; return; }
    var snapsF = res.ic_snapshots_full || [];      // P1-3 全池 IC 截面（未过滤 scoreFloor/筛选/走弱）
    card.style.display = "block";
    var cal = D.calendar, series = D.series, n = cal.length;

    function miss(v) { return v === null || v === undefined || isNaN(v); }
    function rankArr(arr) {
      var idx = [], i;
      for (i = 0; i < arr.length; i++) idx.push(i);
      idx.sort(function (a, b) { return arr[a] - arr[b]; });
      var r = new Array(arr.length);
      i = 0;
      while (i < idx.length) {
        var j = i;
        while (j + 1 < idx.length && arr[idx[j + 1]] === arr[idx[i]]) j++;
        var avg = (i + j) / 2 + 1;
        for (var k = i; k <= j; k++) r[idx[k]] = avg;
        i = j + 1;
      }
      return r;
    }
    function spearmanIC(a, b) {
      var n2 = a.length;
      if (n2 < 3) return 0;
      var ra = rankArr(a), rb = rankArr(b), i;
      var ma = 0, mb = 0;
      for (i = 0; i < n2; i++) { ma += ra[i]; mb += rb[i]; }
      ma /= n2; mb /= n2;
      var cov = 0, va = 0, vb = 0;
      for (i = 0; i < n2; i++) { var da = ra[i] - ma, db = rb[i] - mb; cov += da * db; va += da * da; vb += db * db; }
      return (va > 0 && vb > 0) ? cov / Math.sqrt(va * vb) : 0;
    }
    function futReturn(c, i, fut) {
      // P1-2 IC 口径：决策日收盘 -> 次日开盘买入（open[i+1]）-> 第 fut 日收盘，剔除隔夜跳空（与回测执行口径一致）
      var a = series[c]; if (!a) return null;
      var cl = a.close, op = a.open; if (!cl || !op) return null;
      var p0 = op[i + 1], p1 = cl[i + fut];
      if (miss(p0) || miss(p1) || p0 <= 0) return null;
      return p1 / p0 - 1;
    }
    function compIC(fut, snapsSrc) {
      var snaps0 = snapsSrc || snaps;
      var ics = [], dates = [], k, j, c;
      for (k = 0; k < snaps0.length; k++) {
        var sn = snaps0[k];
        if (sn.i + fut >= n) continue;
        var sc = [], rc = [], codes = Object.keys(sn.scores);
        for (j = 0; j < codes.length; j++) {
          c = codes[j];
          var rr = futReturn(c, sn.i, fut);
          if (rr === null) continue;
          sc.push(sn.scores[c]); rc.push(rr);
        }
        if (sc.length >= 3) { ics.push(spearmanIC(sc, rc)); dates.push(cal[sn.i]); }
      }
      return { ics: ics, dates: dates };
    }
    function mean(arr) { if (!arr.length) return 0; var s = 0, i; for (i = 0; i < arr.length; i++) s += arr[i]; return s / arr.length; }
    function sd(arr) { if (arr.length < 2) return 0; var m = mean(arr), s = 0, i; for (i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m); return Math.sqrt(s / (arr.length - 1)); }
    function icolor(v) { return v > 0 ? "#34D399" : (v < 0 ? "#F87171" : "#E2E8F0"); }

    var baseFut = Math.max(1, +(params.rebalance_days) || 20);
    var main = compIC(baseFut);
    var warn = $("cICWarn");
    if (warn) {
      if (main.ics.length === 0) {
        warn.style.display = "block";
        warn.textContent = "有效截面不足：每个调仓截面可用的综合得分标的少于 3 只（当前标的池过小或数据缺失），无法计算组合 IC。建议增加勾选标的或检查走弱期/筛选配置。";
      } else if (main.ics.length < 6) {
        warn.style.display = "block";
        warn.textContent = "样本偏少：仅 " + main.ics.length + " 个有效截面（标的池较小），IC 波动较大，参考性有限。";
      } else {
        warn.style.display = "none";
      }
    }
    var mIC = mean(main.ics), sIC = sd(main.ics), icir = sIC > 0 ? mIC / sIC : 0;
    var full = compIC(baseFut, snapsF);             // P1-3 全池 IC 对照
    var fIC = full.ics.length ? mean(full.ics) : 0;
    var pos = 0, i2;
    for (i2 = 0; i2 < main.ics.length; i2++) if (main.ics[i2] > 0) pos++;
    var posRate = main.ics.length ? pos / main.ics.length : 0;

    function kpi(t, v, s, clr) {
      return '<div style="background:#111827;border:1px solid var(--line);border-radius:8px;padding:8px 10px">' +
        '<div style="font-size:11px;color:#94A3B8">' + t + '</div>' +
        '<div style="font-size:16px;font-weight:600;color:' + (clr || "#E2E8F0") + '">' + v + '</div>' +
        '<div style="font-size:10px;color:#64748B">' + s + '</div></div>';
    }
    $("cICSum").innerHTML =
      kpi("平均IC·筛选池", mIC.toFixed(3), "主窗口 " + baseFut + " 日", icolor(mIC)) +
      kpi("平均IC·全池", fIC.toFixed(3), "未过滤截面 " + full.ics.length + " 个", icolor(fIC)) +
      kpi("ICIR", icir.toFixed(2), "均值/标准差", icolor(icir)) +
      kpi("有效占比", (posRate * 100).toFixed(0) + "%", "IC>0 截面占比", icolor(mIC)) +
      kpi("截面数", String(main.ics.length), "筛选池有效截面", "");

    if (main.ics.length > 0) {
      initChart("cICChart").setOption({
        tooltip: baseChart().tooltip,
        legend: { show: false },
        grid: { left: 56, right: 16, top: 20, bottom: 34, containLabel: true },
        xAxis: { type: "category", data: main.dates, axisLabel: { fontSize: 10, hideOverlap: false, formatter: function (v) { return String(v).slice(0, 4); } } },
        yAxis: { type: "value", scale: true, axisLabel: { fontSize: 10 } },
        dataZoom: [{ type: "inside", start: 0, end: 100 }, { type: "slider", start: 0, end: 100, height: 14, bottom: 4 }],
        series: [{ name: "组合IC", type: "line", showSymbol: false, lineStyle: { width: 1.6, color: "#38BDF8" }, itemStyle: { color: "#38BDF8" }, data: main.ics.map(function (x) { return +x.toFixed(4); }) }]
      });
      if (charts["cICChart"]) charts["cICChart"].resize();
    } else if ($("cICChart")) { $("cICChart").style.display = "none"; }

    var futArr = [5, 10, 20, 40];
    if (futArr.indexOf(baseFut) < 0) futArr.push(baseFut);
    futArr.sort(function (a, b) { return a - b; });
    var decMean = futArr.map(function (f) { return +mean(compIC(f).ics).toFixed(4); });
    if (main.ics.length > 0) {
      initChart("cICDecay").setOption({
        tooltip: baseChart().tooltip,
        legend: { show: false },
        grid: { left: 56, right: 16, top: 20, bottom: 26, containLabel: true },
        xAxis: { type: "category", data: futArr.map(function (f) { return f + "日"; }), axisLabel: { fontSize: 11 } },
        yAxis: { type: "value", scale: true, axisLabel: { fontSize: 10 } },
        series: [{ name: "平均IC", type: "bar", barWidth: "45%", itemStyle: { color: function (p) { return p.value >= 0 ? "#34D399" : "#F87171"; }, borderRadius: [3, 3, 0, 0] }, data: decMean }]
      });
      if (charts["cICDecay"]) charts["cICDecay"].resize();
    } else if ($("cICDecay")) { $("cICDecay").style.display = "none"; }

    var facs = (params.factors || []).filter(function (f) { return (f.usage || "rank") === "rank"; });
    var rows = "", k3;
    facs.forEach(function (f) {
      var key = f.kind + ":" + (f.window || 20) + ":" + (f.window2 || 0) + ":" + (f.window3 || 0);
      var ics = [];
      for (k3 = 0; k3 < snaps.length; k3++) {
        var sn = snaps[k3];
        if (!sn.fv || !sn.fv[key]) continue;
        if (sn.i + baseFut >= n) continue;
        var sc = [], rc = [], codes = Object.keys(sn.fv[key]), j, c;
        for (j = 0; j < codes.length; j++) { c = codes[j]; var rr = futReturn(c, sn.i, baseFut); if (rr === null) continue; sc.push(sn.fv[key][c]); rc.push(rr); }
        if (sc.length >= 3) ics.push(spearmanIC(sc, rc));
      }
      var fm = mean(ics), fs = sd(ics), fpos = 0;
      for (var k4 = 0; k4 < ics.length; k4++) if (ics[k4] > 0) fpos++;
      var label = f.kind === "custom" ? (f.name || "自定义") : (KIND_INFO[f.kind] ? KIND_INFO[f.kind].label : f.kind);
      rows += '<tr><td>' + label + (f.kind === "custom" ? "" : ' <span style="color:#64748B;font-size:10px">(' + key + ')</span>') + '</td>' +
        '<td style="color:' + icolor(fm) + '">' + fm.toFixed(3) + '</td>' +
        '<td>' + (fs > 0 ? (fm / fs).toFixed(2) : "—") + '</td>' +
        '<td style="color:' + icolor(fm) + '">' + (ics.length ? (fpos / ics.length * 100).toFixed(0) : "—") + '%</td>' +
        '<td>' + ics.length + '</td></tr>';
    });
    $("cICFacBody").innerHTML = rows || '<tr><td colspan="5" style="color:#64748B">无排名因子</td></tr>';
  }

  function showNotice(msg) {
    var el = $("notice");
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  function renderKpis(r) {
    var m = r.metrics;
    var excess = m.total_return - m.benchmark.total;
    var cards = [
      { t: "累计收益", v: FMT.pct(m.total_return), s: "超额 " + (excess * 100 >= 0 ? "+" : "") + (excess * 100).toFixed(1) + "pp vs " + benchLabelShort(), cls: m.total_return >= 0 ? "up" : "down" },
      { t: "基准相关性", v: (m.bench_corr !== undefined && !isNaN(m.bench_corr)) ? m.bench_corr.toFixed(2) : "—", s: "与所选基准日收益", cls: "" },
      { t: "年化收益", v: FMT.pct(m.cagr), s: "CAGR", cls: m.cagr >= 0 ? "up" : "down" },
      { t: "最大回撤", v: FMT.pct(m.max_dd), s: "基准 " + FMT.pct(m.benchmark.max_dd), cls: "down" },
      { t: "最大回撤天数", v: maxDDDays(r.drawdown) + " 个交易日", s: "最长连续回撤", cls: "down" },
      { t: "夏普比率", v: m.sharpe.toFixed(2), s: "基准 " + m.benchmark.sharpe.toFixed(2), cls: m.sharpe >= 0 ? "up" : "down" },
      { t: "卡玛比率", v: isNaN(m.calmar) ? "—" : m.calmar.toFixed(2), s: "年化/回撤", cls: m.calmar >= 0 ? "up" : "down" },
      { t: "年化波动", v: FMT.pct(m.vol), s: "日收益标准差", cls: "" },
      { t: "日胜率", v: FMT.pct(m.win_rate, 1), s: "盈利交易日占比", cls: "" },
      { t: "盈亏比", v: isFinite(m.profit_factor) ? m.profit_factor.toFixed(2) : "∞", s: "总盈/总亏", cls: "" },
      { t: "调仓次数", v: String(m.n_trades), s: "含 " + (m.n_trades - r.trades.filter(function (t) { return t.to.length === 0; }).length) + " 次持仓", cls: "" },
      { t: "卖出条件触发", v: (m.sell_cond_times || 0) + " 次", s: "排名区间内因卖出条件卖出", cls: (m.sell_cond_times || 0) > 0 ? "up" : "" },
      { t: "累计成本", v: (m.cum_cost / 10000).toFixed(1) + "万", s: "100万本金口径", cls: "" }
    ];
    var html = "";
    cards.forEach(function (c) {
      html += '<div class="kpi"><div class="t">' + c.t + '</div><div class="v ' + c.cls + '">' + c.v +
        '</div><div class="s">' + c.s + "</div></div>";
    });
    $("kpis").innerHTML = html;
    // 样本内外分割（研究段 vs 验证段）
    var seg = m.segments;
    var segBox = $("segBox");
    if (seg && seg.study && seg.validation) {
      segBox.style.display = "block";
      $("segTip").textContent = "验证段自 " + seg.v_start + " 起（最近3年冻结作样本外；此前为研究段）";
      var rows = [
        ["累计收益", FMT.pct(seg.study.total), FMT.pct(seg.validation.total)],
        ["年化收益", FMT.pct(seg.study.cagr), FMT.pct(seg.validation.cagr)],
        ["最大回撤", FMT.pct(seg.study.max_dd), FMT.pct(seg.validation.max_dd)],
        ["夏普比率", seg.study.sharpe.toFixed(2), seg.validation.sharpe.toFixed(2)],
        ["交易日数", String(seg.study.n_days), String(seg.validation.n_days)]
      ];
      var cells = '<div style="color:#64748B">指标</div><div style="text-align:right;color:#64748B">研究段</div><div style="text-align:right;color:#64748B;font-weight:600">验证段（样本外）</div>';
      for (var ri = 0; ri < rows.length; ri++) {
        cells += '<div style="color:#64748B">' + rows[ri][0] + '</div><div style="text-align:right">' + rows[ri][1] + '</div><div style="text-align:right;font-weight:600">' + rows[ri][2] + "</div>";
      }
      $("segGrid").innerHTML = cells;
    } else {
      segBox.style.display = "none";
    }
  }

  function ts(d) { return new Date(d + "T00:00:00+08:00").getTime(); }

  function baseChart() {
    return {
      tooltip: { trigger: "axis", triggerOn: "click", renderMode: "richText", confine: true },
      grid: { left: 56, right: 20, top: 34, bottom: 26, containLabel: true },
      legend: { top: 4, textStyle: { fontSize: 12, color: "#CBD5E1" } }
    };
  }

  function initChart(id) {
    if (!window.echarts) {
      var el = $(id);
      if (el && !el.getAttribute("data-noecharts")) {
        el.setAttribute("data-noecharts", "1");
        el.innerHTML = '<div style="padding:20px;color:#F87171;font-size:13px">图表库(ECharts)加载失败——请检查网络后刷新页面；策略列表与指标不受影响</div>';
      }
      return null;
    }
    if (!charts[id]) { charts[id] = echarts.init($(id), "dark"); charts[id].setOption({ backgroundColor: "transparent" }); }
    return charts[id];
  }

  function renderNav(r) {
    var dates = r.calendar.map(ts);
    initChart("cNav").setOption({
      tooltip: baseChart().tooltip,
      legend: { data: ["策略", "沪深300", "等权池"], top: 4, textStyle: { fontSize: 12 } },
      grid: { left: 56, right: 20, top: 36, bottom: 40, containLabel: true },
      xAxis: { type: "time", minInterval: 365 * 24 * 3600 * 1000, axisLabel: { fontSize: 11, hideOverlap: false, formatter: function (v) { return "" + new Date(v).getFullYear(); } } },
      yAxis: { type: "value", scale: true, axisLabel: { fontSize: 11, formatter: function (v) { return v.toFixed(1); } } },
      dataZoom: [{ type: "inside", start: 0, end: 100 }, { type: "slider", start: 0, end: 100, height: 16, bottom: 6 }],
      series: [
        { name: "策略", type: "line", showSymbol: false, lineStyle: { width: 2.5, color: COLOR.str }, itemStyle: { color: COLOR.str }, data: dates.map(function (t, i) { return [t, +r.nav[i].toFixed(5)]; }) },
        { name: "沪深300", type: "line", showSymbol: false, lineStyle: { width: 1.8, color: COLOR.bench }, itemStyle: { color: COLOR.bench }, data: dates.map(function (t, i) { return [t, +r.bench_nav[i].toFixed(5)]; }) },
        { name: "等权池", type: "line", showSymbol: false, lineStyle: { width: 1.8, color: COLOR.ew, type: "dashed" }, itemStyle: { color: COLOR.ew }, data: dates.map(function (t, i) { return [t, +r.ew_nav[i].toFixed(5)]; }) }
      ]
    });
  }

  function renderDD(r) {
    var dates = r.calendar.map(ts);
    initChart("cDD").setOption({
      tooltip: baseChart().tooltip,
      legend: { data: ["策略回撤", "沪深300回撤"], top: 4, textStyle: { fontSize: 12 } },
      grid: { left: 56, right: 20, top: 34, bottom: 24, containLabel: true },
      xAxis: { type: "time", minInterval: 365 * 24 * 3600 * 1000, axisLabel: { fontSize: 11, hideOverlap: false, formatter: function (v) { return "" + new Date(v).getFullYear(); } } },
      yAxis: { type: "value", max: 0, axisLabel: { fontSize: 11, formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } },
      series: [
        { name: "策略回撤", type: "line", showSymbol: false, lineStyle: { width: 2, color: COLOR.dd }, itemStyle: { color: COLOR.dd }, areaStyle: { color: "rgba(239,68,68,0.10)" }, data: dates.map(function (t, i) { return [t, +r.drawdown[i].toFixed(5)]; }) },
        { name: "沪深300回撤", type: "line", showSymbol: false, lineStyle: { width: 1.5, color: "#334155" }, itemStyle: { color: "#334155" }, data: dates.map(function (t, i) { return [t, +r.bench_drawdown[i].toFixed(5)]; }) }
      ]
    });
  }

  function renderYear(r) {
    var m = r.metrics;
    var labels = [];
    Object.keys(m.annual).forEach(function (y) { if (labels.indexOf(y) < 0) labels.push(y); });
    Object.keys(m.bench_annual).forEach(function (y) { if (labels.indexOf(y) < 0) labels.push(y); });
    labels.sort();
    var s = labels.map(function (y) { return +(m.annual[y] * 100).toFixed(1); });
    var b = labels.map(function (y) { return +(m.bench_annual[y] * 100).toFixed(1); });
    initChart("cYear").setOption({
      tooltip: baseChart().tooltip,
      legend: { data: ["策略", "沪深300"], top: 4, textStyle: { fontSize: 12 } },
      grid: { left: 56, right: 20, top: 34, bottom: 44, containLabel: true },
      xAxis: { type: "category", data: labels, axisLabel: { fontSize: 10, interval: 0, rotate: 30, margin: 8 } },
      yAxis: { type: "value", axisLabel: { fontSize: 11, formatter: function (v) { return v + "%"; } } },
      series: [
        { name: "策略", type: "bar", barWidth: 16, itemStyle: { color: COLOR.str, borderRadius: [3, 3, 0, 0] }, label: { show: true, position: "top", fontSize: 10, formatter: function (p) { return p.value + "%"; } }, data: s },
        { name: "沪深300", type: "bar", barWidth: 16, itemStyle: { color: COLOR.bench, borderRadius: [3, 3, 0, 0] }, label: { show: true, position: "top", fontSize: 10, formatter: function (p) { return p.value + "%"; } }, data: b }
      ]
    });
  }

  function renderMonth(r) {
    var m = r.metrics;
    var years = [], cells = [], absMax = 5;
    Object.keys(m.monthly).forEach(function (k) {
      var y = k.slice(0, 4);
      if (years.indexOf(y) < 0) years.push(y);
    });
    years.sort();
    var monthIdx = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    Object.keys(m.monthly).forEach(function (k) {
      var v = +(m.monthly[k] * 100).toFixed(1);
      cells.push([years.indexOf(k.slice(0, 4)), monthIdx.indexOf(k.slice(5, 7)), v]);
      absMax = Math.max(absMax, Math.abs(v));
    });
    absMax = Math.max(absMax * 1.05, 5);
    initChart("cMonth").setOption({
      tooltip: { trigger: "item", triggerOn: "click", renderMode: "richText", confine: true,
        formatter: function (p) { return p.value[0] >= 0 ? years[p.value[0]] + "-" + monthIdx[p.value[1]] + "：" + p.value[2] + "%" : ""; } },
      grid: { left: 10, right: 10, top: 8, bottom: 44, containLabel: true },
      xAxis: { type: "category", data: years, splitArea: { show: true }, axisLabel: { fontSize: 10, interval: 0, rotate: 30, margin: 8 } },
      yAxis: { type: "category", data: monthIdx, splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      visualMap: { min: -absMax, max: absMax, calculable: true, orient: "horizontal", left: "center", bottom: 0,
        textStyle: { fontSize: 10 }, inRange: { color: ["#FCA5A5", "#FEF2F2", "#CCFBF1", "#14B8A6"] } },
      series: [{ type: "heatmap", data: cells, label: { show: false }, emphasis: { itemStyle: { borderColor: "#334155", borderWidth: 1 } } }]
    });
  }

  function renderTrades(r, params) {
    var names = {};
    POOL.forEach(function (p) { names[p.code] = p.name; });
    var isReb = params.mode === "rebalance";
    var th = $("tradeTable").querySelector("thead");
    var tb = $("tradeTable").querySelector("tbody");
    // 表头按模式生成：再平衡只保留核心列（卖出/买入/换手/成本/Top1/R² 等空数据列不渲染）
    // 列宽用 th 内联百分比（table-layout:fixed 下按比例分配，保证不横向溢出）
    if (isReb) {
      th.innerHTML = "<tr><th style='width:20%'>决策日</th><th style='width:20%'>执行日</th><th style='width:15%'>状态</th><th class='fc' style='width:22.5%'>从</th><th class='fc' style='width:22.5%'>到</th></tr>";
    } else {
      th.innerHTML = "<tr><th style='width:10%'>决策日</th><th style='width:10%'>执行日</th><th style='width:7%'>状态</th><th class='fc' style='width:15%'>从</th><th class='fc' style='width:15%'>到</th><th style='width:10%'>卖出金额</th><th style='width:10%'>买入金额</th><th style='width:10%'>买入份额</th><th style='width:7%'>换手</th><th style='width:6%'>成本%</th></tr>";
    }
    tb.innerHTML = "";
    var cashCount = 0;
    r.trades.slice().reverse().forEach(function (t) {
      var tr = document.createElement("tr");
      var reg = t.regime === "weak" ? '<td class="wk">走弱</td>' : (t.hold_unchanged ? '<td>持有不变</td>' : "<td>正常</td>");
      // "从"列：卖出标的附原因标注（区间=跌出排名区间 / 条件=卖出条件触发）
      var soldMap = {};
      (t.sold || []).forEach(function (s) { soldMap[s.code] = s.reasons || ["rank_out"]; });
      var from = t.from.map(function (c) {
        var nm = names[c] || c;
        var rs = soldMap[c];
        if (rs && rs.length) {
          var tag = rs.indexOf("sell_cond") >= 0 ? (rs.indexOf("rank_out") >= 0 ? "区间+条件" : "卖出条件") : "区间";
          return nm + '<span style="font-size:10px;opacity:.6" title="卖出原因：' + tag + '">·' + tag + "</span>";
        }
        return nm;
      }).join("、") || "—";
      var to = t.to.map(function (c) { return names[c] || c; }).join("、") || '<span class="wk">空仓</span>';
      if (isReb) {
        tr.innerHTML = "<td>" + t.decision_date + "</td><td>" + t.exec_date + "</td>" + reg +
          "<td class='fc'>" + from + "</td><td class='fc'>" + to + "</td>";
      } else {
        var sa = t.sell_amount > 1e-6 ? (t.sell_amount / 1e4).toFixed(1) + "万" : "—";
        var ba = t.buy_amount > 1e-6 ? (t.buy_amount / 1e4).toFixed(1) + "万" : "—";
        var bs = t.buy_shares != null && t.buy_shares > 0 ? (t.buy_shares / 1e4).toFixed(2) + "万份" : "—";
        tr.innerHTML = "<td>" + t.decision_date + "</td><td>" + t.exec_date + "</td>" + reg +
          "<td class='fc'>" + from + "</td><td class='fc'>" + to + "</td><td>" + sa + "</td><td>" + ba + "</td><td>" + bs + "</td><td>" +
          (t.turnover * 100).toFixed(0) + "%</td><td>" +
          (t.cost_pct * 100).toFixed(3) + "</td>";
      }
      tb.appendChild(tr);
      if (t.to.length === 0) cashCount++;
    });
    $("tradeCount").textContent = "共 " + r.trades.length + " 笔（空仓 " + cashCount + " 笔）" + (isReb ? "；再平衡模式仅显示核心列" : "");
  }

  // ---------- resize ----------
  var rsTimer = null;
  window.addEventListener("resize", function () {
    if (rsTimer) clearTimeout(rsTimer);
    rsTimer = setTimeout(function () {
      Object.keys(charts).forEach(function (k) { charts[k].resize(); });
    }, 150);
  });

  // ---------- 已保存策略（单页内列表 + 详情） ----------
  var og = $("stOrigin");
  if (og) og.textContent = location.origin;
  $("stBack").addEventListener("click", function () { $("stDetail").style.display = "none"; });
  $("stApply").addEventListener("click", function () {
    if (!stCurName) return;
    var m = loadStored();
    if (!m[stCurName]) return;
    ensureData(function () {
      applyParams(m[stCurName]);
      stepTo(2);
      moveRotOnly(activeView);
      renderSelSummary();
      scheduleRun();
      $("stDetail").style.display = "none";
      showNotice("已应用策略参数并回测：" + stCurName);
      try { history.replaceState(null, "", "#/" + (activeView === "rebalance" ? "rebalance" : "rotation")); } catch (e) { }
    });
  });
  $("stRefresh").addEventListener("click", function () { renderStrategyList(); showNotice("列表已刷新：" + Object.keys(loadStored()).length + " 个策略"); });
  $("stImportAll").addEventListener("click", function () { $("stImpAllFile").click(); });
  $("stImpAllFile").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    var self = this;
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result);
        var src = (j && j.strategies && typeof j.strategies === "object") ? j.strategies : null;
        if (!src) { showNotice("文件格式不对：请使用「导出全部」生成的 JSON"); return; }
        var m = loadStored();
        var n = 0;
        Object.keys(src).forEach(function (k) {
          var v = src[k];
          if (v && typeof v === "object") { if (!v._saved_at) v._saved_at = new Date().toISOString(); m[k] = v; n++; }
        });
        storeAll(m); refreshStList(); renderStrategyList();
        showNotice("已导入 " + n + " 个策略（同名已覆盖）");
      } catch (e) { showNotice("导入失败：" + e.message); }
      self.value = "";
    };
    rd.readAsText(f);
  });

  // ---------- 已保存策略页（列表 + 详情，实时回测） ----------
  var stRes = {};   // name -> backtest 结果缓存
  function fmtDate(iso) {
    if (!iso) return "历史策略";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "历史策略";
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " +
           ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function codeName(code) {
    var names = {};
    POOL.forEach(function (p) { names[p.code] = p.name; });
    return names[code] || code;
  }
  function maxDDDays(dd) {
    var longest = 0, cur = 0, i;
    for (i = 0; i < dd.length; i++) {
      if (dd[i] < -1e-12) cur++;
      else { if (cur > longest) longest = cur; cur = 0; }
    }
    if (cur > longest) longest = cur;
    return longest;
  }
  function lastTradeLine(res) {
    var t = res.trades[res.trades.length - 1];
    if (!t) return { sell: [], buy: [], decision: "—", regime: "", hold: false };
    if (t.hold_unchanged) return { sell: [], buy: t.to || [], decision: t.decision_date, regime: t.regime || "", hold: true };
    return { sell: t.from || [], buy: t.to || [], decision: t.decision_date, regime: t.regime || "", hold: false };
  }
  function renderStrategyList() {
    var box = $("stListV"); if (!box) return;
    var m = loadStored();
    var keys = Object.keys(m);
    keys.sort(function (a, b) {
      var ta = (m[a]._saved_at || ""), tb = (m[b]._saved_at || "");
      if (ta && tb) return ta < tb ? -1 : 1;
      return ta ? -1 : (tb ? 1 : 0);
    });
    $("stTotal").textContent = keys.length + " 个策略";
    box.innerHTML = "";
    if (!keys.length) {
      box.innerHTML = '<div style="font-size:12px;color:#94A3B8;padding:10px 2px">暂无已保存策略。<br>请在「回测」页调好参数后保存；若在其他链接/设备保存过，请用「导出全部/导入全部」迁移。</div>';
      return;
    }
    // 先立即渲染全部列表结构（名称/创建时间），持仓与收益逐个异步回测填充，避免阻塞
    var rows = {};
    keys.forEach(function (k) {
      var row = document.createElement("div");
      row.className = "srow";
      var tag = m[k].type === "grid" ? '<span class="tag" style="color:#FBBF24;border:1px solid #FBBF24;border-radius:3px;font-size:10px;padding:0 3px;margin-left:4px">网格</span>' : "";
      row.innerHTML = '<div class="nm">' + k.replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }) + tag +
        '</div><div class="meta"><span>创建：' + fmtDate(m[k]._saved_at) + '</span><span class="ld">计算中…</span></div>' +
        '<div class="pos">回测中…</div>';
      row.addEventListener("click", function () { if (m[k].type === "grid") applyGridStrategy(k); else showStrategyDetail(k); });
      rows[k] = row;
      box.appendChild(row);
    });
    var queue = keys.slice();
    (function next() {
      if (!queue.length) return;
      var k2 = queue.shift();
      setTimeout(function () {
        var res = null;
        try {
          if (m[k2] && m[k2].type === "grid") {
            var g = m[k2].grid || {}, gs = g.settings || {};
            res = stRes[k2] || WufuEngine.backtestGrid(D, { codes: (g.codes || []).slice(), initial_capital: gs.capital || 1000000, mgmt: gs.mgmt || "B", period_n: gs.period_n || 12, period_unit: gs.period_unit || "周", commission_rate: gs.comm || 0.00025, slippage_rate: gs.slip || 0.0005, min_commission: gs.min_comm || 0, vol_win: g.vol_win || 60, gridOverrides: g.overrides || {} });
            stRes[k2] = res;
          } else { res = stRes[k2] || engine.backtest(D, m[k2]); stRes[k2] = res; }
        } catch (e) { res = null; }
        var row = rows[k2];
        if (!row) { next(); return; }
        if (res) {
          var line;
          if (m[k2] && m[k2].type === "grid") {
            var gm = res.metrics || {};
            line = '<span class="buy">网格策略 · 共 ' + (res.trades ? res.trades.length : (gm.n_trades || 0)) + ' 笔成交</span>（周期 ' + (m[k2].grid ? m[k2].grid.settings.period_n : 12) + (m[k2].grid ? m[k2].grid.settings.period_unit : "周") + ' · 管理' + (m[k2].grid ? (m[k2].grid.settings.mgmt === "A" ? "长持" : "体检轮动") : "B") + '）';
          } else {
            var lt = lastTradeLine(res);
          if (!lt.buy.length) {
            var why = lt.regime === "weak" ? "走弱期" : "无信号";
            line = '<span class="sell">空仓（现金 · ' + why + '）</span>，最近决策 <b>' + lt.decision + '</b>';
          } else if (lt.hold) {
            var hTxt = lt.buy.map(codeName).join("、");
            line = '继续持有 <b class="buy">' + hTxt + '</b>（决策 ' + lt.decision + '）';
          } else {
            var sellTxt = lt.sell.length ? lt.sell.map(codeName).join("、") : "（无）";
            var buyTxt = lt.buy.map(codeName).join("、");
            line = '卖出 <b class="sell">' + sellTxt + '</b>，买入 <b class="buy">' + buyTxt + '</b>（决策 ' + lt.decision + '）';
          }
          }
          row.querySelector(".ld").textContent = "总收益 " + (isFinite(res.metrics.total_return) ? (res.metrics.total_return * 100).toFixed(2) + "%" : "—") +
            " · 夏普 " + (isFinite(res.metrics.sharpe) ? res.metrics.sharpe.toFixed(2) : "—");
          row.querySelector(".pos").innerHTML = line;
        } else {
          row.querySelector(".ld").textContent = "回测失败";
          row.querySelector(".pos").textContent = "参数无法回测，请重新保存该策略";
        }
        next();
      }, 20);
    })();
  }
  function applyGridStrategy(name) {
    var m = loadStored();
    if (!m[name] || !m[name].grid) return;
    showView("grid");
    location.hash = "#/grid";
    if (window.GridView) GridView.applySaved(m[name].grid);
    showNotice("已应用网格策略：" + name + "（已恢复标的/TopN/参数/设置，可直接运行回测）");
  }
  var stCurName = "";
  // 当前持仓 · 买入份额（全部持仓标的含继续持有；按最新投资额 ÷ TopN 等权；份额向下取整 100 份/手；现金部分买入货币ETF 511990.SH；价格=最新未复权收盘）
  function fmtN(v) { return Math.round(v).toLocaleString("zh-CN"); }
  function latestCap(name, res) {
    var m = loadStored();
    var cap = +(m[name].initial_capital) || 1000000;
    if (!res || !res.nav.length || res.nav[0] <= 0) return cap;
    return cap * res.nav[res.nav.length - 1] / res.nav[0];
  }
  function lastRawClose(code) {
    var s = D.series[code], px = null;
    if (s && s.raw_close) { for (var i = s.raw_close.length - 1; i >= 0; i--) { if (s.raw_close[i]) { px = s.raw_close[i]; break; } } }
    return px;
  }
  function lotShares(amt, px) { return (px && px > 0) ? Math.floor(amt / px / 100) * 100 : null; }
  function renderPosBuy(name) {
    var box = $("stPosBuy"); if (!box) return;
    var m = loadStored(), res = stRes[name];
    if (!res) { box.innerHTML = ""; return; }
    var base = latestCap(name, res);          // 按最新投资额分配
    var isReb = m[name].mode === "rebalance";
    var rwM = isReb ? (m[name].reb_weights || {}) : null;
    var t = res.trades[res.trades.length - 1];
    var holds = (t && t.to) || [];
    var html = '<table class="trades" style="margin-top:4px;table-layout:fixed;width:100%"><colgroup><col style="width:36%"><col style="width:21%"><col style="width:21%"><col style="width:22%"></colgroup><thead><tr><th class="fc">买入标的</th><th>买入金额</th><th>最新未复权价</th><th>买入份额</th></tr></thead><tbody>';
    if (!holds.length) {
      var cashAll = base;
      // 修复口径：空仓（未持任何标的）时仅当兜底为货币ETF 才按 511990 份额展示；否则显示「现金（不持有）」，与引擎空仓收益=0 一致
      var fb3 = (m[name] && m[name].fallback_when_no_signal) || "cash";
      var cpx0 = lastRawClose("511990.SH");
      var cs0 = lotShares(cashAll, cpx0);
      if (fb3 === "money") {
        html += "<tr><td class='fc'>货币ETF</td><td>" + fmtN(cashAll) + "</td><td>" + (cpx0 ? cpx0.toFixed(4) : "—") + "</td><td>" + (cs0 ? fmtN(cs0) : "—") + "</td></tr>";
      } else {
        html += "<tr><td class='fc'>现金（不持有）</td><td>" + fmtN(cashAll) + "</td><td>—</td><td>—</td></tr>";
      }
    } else if (isReb) {
      var sw = 0;
      holds.forEach(function (c) { sw += (rwM[c] || 0); });
      holds.forEach(function (c) {
        var px = lastRawClose(c);
        var amt = base * (rwM[c] || 0);
        var sh = lotShares(amt, px);
        html += "<tr><td class='fc'>" + codeName(c) + "</td><td>" + fmtN(amt) + "</td><td>" + (px ? px.toFixed(4) : "—") + "</td><td>" + (sh ? fmtN(sh) : "—") + "</td></tr>";
      });
      if (sw < 1 - 1e-6) {
        var cashAmt2 = base * (1 - sw);
        var cpx2 = lastRawClose("511990.SH");
        var cs2 = lotShares(cashAmt2, cpx2);
        html += "<tr><td class='fc'>货币ETF</td><td>" + fmtN(cashAmt2) + "</td><td>" + (cpx2 ? cpx2.toFixed(4) : "—") + "</td><td>" + (cs2 ? fmtN(cs2) : "—") + "</td></tr>";
      }
    } else {
      var rNv = Math.max(1, +(m[name].rank_n) || 1);
      var rMv = Math.max(rNv, +(m[name].rank_m) || (m[name].top_n ? Math.max(rNv, +(m[name].top_n) || 1) : rNv));
      var nHold = Math.max(1, rMv - rNv + 1);
      var per = base / nHold;
      holds.forEach(function (c) {
        var px = lastRawClose(c);
        var sh = lotShares(per, px);
        html += "<tr><td class='fc'>" + codeName(c) + "</td><td>" + fmtN(per) + "</td><td>" + (px ? px.toFixed(4) : "—") + "</td><td>" + (sh ? fmtN(sh) : "—") + "</td></tr>";
      });
      if (holds.length < nHold) {
        var cashAmt = (nHold - holds.length) * per;
        var fb4 = (m[name] && m[name].fallback_when_no_signal) || "cash";
        if (fb4 === "money") {
          var cpx = lastRawClose("511990.SH");
          var cs = lotShares(cashAmt, cpx);
          html += "<tr><td class='fc'>货币ETF</td><td>" + fmtN(cashAmt) + "</td><td>" + (cpx ? cpx.toFixed(4) : "—") + "</td><td>" + (cs ? fmtN(cs) : "—") + "</td></tr>";
        } else {
          html += "<tr><td class='fc'>现金（未持有）</td><td>" + fmtN(cashAmt) + "</td><td>—</td><td>—</td></tr>";
        }
      }
    }
    html += "</tbody></table>";
    if (!isReb && holds.length && holds.length < nHold) {
      html += '<div style="font-size:11.5px;color:#94A3B8;margin-top:4px">持有 ' + holds.length + ' 只 &lt; 排名区间 ' + rNv + '-' + rMv + '，其余 ' + (nHold - holds.length) + ' 份资金买入货币ETF（511990）</div>';
    }
    if (isReb && holds.length) {
      var sw2 = 0;
      holds.forEach(function (c) { sw2 += (rwM[c] || 0); });
      if (sw2 < 1 - 1e-6) html += '<div style="font-size:11.5px;color:#94A3B8;margin-top:4px">再平衡权重合计 ' + (Math.round(sw2 * 10000) / 100) + '%，剩余 ' + (Math.round((1 - sw2) * 10000) / 100) + '% 资金买入货币ETF</div>';
    }
    box.innerHTML = html;
  }
  function showStrategyDetail(name) {
    var m = loadStored();
    if (!m[name]) return;
    if (!D) { $("stDetail").style.display = "block"; $("stName2").textContent = name; $("stKpis").innerHTML = '<div style="font-size:12px;color:#94A3B8;padding:8px">正在加载行情数据并计算策略详情…</div>'; }
    ensureData(function () {
    stCurName = name;
    $("stDetail").style.display = "block";
    $("stDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    var res = stRes[name] || engine.backtest(D, m[name]);
    stRes[name] = res;
    $("stName2").textContent = name;
    var mt = res.metrics;
    var L = res.calendar.length;
    function winRet(N) {
      var i0 = L - 1 - N;
      if (i0 < 0 || res.nav[L - 1] <= 0 || res.nav[i0] <= 0) return null;
      return res.nav[L - 1] / res.nav[i0] - 1;
    }
    var w1 = winRet(21), w3 = winRet(63), w6 = winRet(126), wy = winRet(252);
    var curDD = res.drawdown[res.drawdown.length - 1] * 100;
    var maxDDD = maxDDDays(res.drawdown);
    var years = Math.max(mt.n_days / 252, 1e-9);
    var pct = function (v, d) { return v == null ? "—" : (v * 100).toFixed(2) + "%"; };
    var kpis = [
      ["创建时间", fmtDate(m[name]._saved_at), ""],
      ["投资时长", ((res.metrics && res.metrics.n_days ? res.metrics.n_days : res.n_days || 0) / 252).toFixed(1) + " 年", "回测区间"],
      ["近1月收益", pct(w1, 0), ""],
      ["近1季收益", pct(w3, 0), ""],
      ["近半年收益", pct(w6, 0), ""],
      ["近1年收益", pct(wy, 0), ""],
      ["总收益", pct(mt.total_return, 0), "基准 " + pct(mt.benchmark.total, 0)],
      ["年化收益", pct(mt.cagr, 0), ""],
      ["夏普比率", mt.sharpe.toFixed(2), "（无风险 2%）"],
      ["年均交易次数", (mt.n_trades / years).toFixed(0) + " 次/年", "共 " + mt.n_trades + " 笔"],
      ["卖出条件触发", (res.metrics && res.metrics.sell_cond_times ? res.metrics.sell_cond_times : 0) + " 次", "排名区间内因条件卖出"],
      ["当前回撤", curDD.toFixed(2) + "%", ""],
      ["最大回撤", (mt.max_dd * 100).toFixed(2) + "%", ""],
      ["最长回撤天数", maxDDD + " 个交易日", ""],
      ["年化波动率", (mt.vol * 100).toFixed(2) + "%", ""],
      ["胜率", (mt.win_rate * 100).toFixed(1) + "%", ""],
      ["盈亏比", mt.profit_factor.toFixed(2), ""],
      ["超额收益", pct(mt.total_return - mt.benchmark.total, 0), "vs 沪深300"]
    ];
    var kb = $("stKpis"); kb.innerHTML = "";
    kpis.forEach(function (k) {
      var d = document.createElement("div");
      d.className = "kpi";
      var vCls = (k[1].indexOf("-") === 0 && (k[0].indexOf("收益") >= 0 || k[0].indexOf("回撤") >= 0)) ? "down" : "";
      d.innerHTML = '<div class="t">' + k[0] + '</div><div class="v ' + vCls + '">' + k[1] + '</div><div class="s">' + k[2] + '</div>';
      kb.appendChild(d);
    });
    // 详情投资额区：起始投资额 + 投资起始日期 + 最新投资额（按策略净值自起始日起变化）
    var stI2 = $("stInvIn2"), stStart = $("stStartIn"), stLC = $("stLatestCap");
    function updateLatestCap() {
      if (!stLC || !res) return;
      stLC.textContent = fmtN(latestCap(name, res));
    }
    if (stI2) {
      stI2.value = (m[name].initial_capital) || 1000000;
      stI2.onchange = function () {
        var v = Math.max(1000, +stI2.value || 1000000);
        m[name].initial_capital = v;
        storeAll(m); refreshStList(); renderStrategyList();
        renderPosBuy(name);
        updateLatestCap();
      };
    }
    if (stStart) {
      stStart.value = (m[name].start_date) || "2016-06-01";
      stStart.onchange = function () {
        var v = stStart.value || "2016-06-01";
        m[name].start_date = v;
        storeAll(m);
        delete stRes[name];
        showStrategyDetail(name);   // 按新起始日期重跑回测，最新投资额随之重算
        return;
      };
    }
    renderPosBuy(name);
    updateLatestCap();
    // 收益曲线（策略 vs 基准）
    var dats = res.calendar.map(function (t, i) { return t; });
    initChart("stChart").setOption({
      tooltip: { trigger: "axis", triggerOn: "mousemove|click", renderMode: "richText", confine: true },
      legend: { data: ["策略", "沪深300"], top: 4, textStyle: { fontSize: 12 } },
      grid: { left: 60, right: 20, top: 36, bottom: 26, containLabel: true },
      xAxis: { type: "time", axisLabel: { fontSize: 11 } },
      yAxis: { type: "value", axisLabel: { fontSize: 11, formatter: function (v) { return v.toFixed(2); } }, scale: true },
      series: [
        { name: "策略", type: "line", showSymbol: false, lineStyle: { width: 2, color: COLOR.str }, itemStyle: { color: COLOR.str }, data: dats.map(function (t, i) { return [t, +(res.nav[i]).toFixed(4)]; }) },
        { name: "沪深300", type: "line", showSymbol: false, lineStyle: { width: 1.5, color: "#94A3B8" }, itemStyle: { color: "#94A3B8" }, data: dats.map(function (t, i) { return [t, +(res.bench_nav[i]).toFixed(4)]; }) }
      ]
    });
    // 按年度收益表
    var yrs = Object.keys(mt.annual).sort();
    var yb = $("stYearly"); yb.innerHTML = '<tr><th>年份</th><th>策略</th><th>沪深300</th><th>超额</th></tr>';
    yrs.forEach(function (y) {
      var a = mt.annual[y], b = (mt.bench_annual || {})[y] || 0;
      var e = a - b;
      var td = function (v) { return '<td class="' + (v < 0 ? "down" : "up") + '">' + (v * 100).toFixed(2) + "%</td>"; };
      yb.innerHTML += '<tr><td>' + y + '</td>' + td(a) + td(b) + td(e) + '</tr>';
    });
    // 月度热力图（HTML 网格）
    var mb = $("stMonthly"); mb.innerHTML = "";
    var mon = mt.monthly || {};
    var monYrs = {};
    Object.keys(mon).forEach(function (k) {
      var y = k.slice(0, 4), mIdx = +k.slice(5, 7);
      if (!monYrs[y]) monYrs[y] = {};
      monYrs[y][mIdx] = mon[k];
    });
    Object.keys(monYrs).sort().forEach(function (y) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "margin:6px 0";
      wrap.innerHTML = '<div style="font-size:11px;color:#64748B;margin-bottom:3px">' + y + '</div>';
      var grid = document.createElement("div");
      grid.className = "mgrid";
      for (var mi = 1; mi <= 12; mi++) {
        var c = document.createElement("div");
        c.className = "mcell";
        var v = monYrs[y][mi];
        var bg = "#1E293B", fg = "#CBD5E1";
        if (v !== undefined) {
          var p = Math.min(Math.abs(v) * 400, 1);
          if (v >= 0) { bg = "rgba(16,185,129," + (0.12 + p * 0.6).toFixed(2) + ")"; }
          else { bg = "rgba(248,113,113," + (0.14 + p * 0.55).toFixed(2) + ")"; fg = "#FEE2E2"; }
        }
        c.style.background = bg; c.style.color = fg;
        c.innerHTML = '<div class="y">' + mi + '月</div>' + (v === undefined ? "—" : (v * 100).toFixed(1) + "%");
        grid.appendChild(c);
      }
      wrap.appendChild(grid);
      mb.appendChild(wrap);
    });
    $("stDetail").style.display = "block";
    });
  }

  // ---------- 视图路由与共享步骤切换 ----------
  function curChecked() { return activeView === "rebalance" ? rebalanceChecked : poolChecked; }
  function moveRotOnly(v) {
    var ro = $("rotOnlyStep2"); if (!ro) return;
    if (v === "rotation") {
      var panel = $("panel"), core = $("sfg-core");
      if (panel && ro.parentNode !== panel) {
        // 目标锚点必须在 panel 内（拆分/重渲染时序下可能不在）：含判断 + appendChild 兜底
        if (core && core.parentNode === panel) panel.insertBefore(ro, core);
        else panel.appendChild(ro);
      }
      ro.style.display = "";
    } else { ro.style.display = "none"; }
  }
  function switchView(v) {
    var target = (v === "rebalance") ? "rebalance" : "rotation";
    var changed = activeView !== target;
    activeView = target;
    var sh1 = $("sh1"), sh2 = $("sh2");
    var s1 = activeView === "rebalance" ? $("rebSh1Slot") : $("rotSh1Slot");
    var s2 = activeView === "rebalance" ? $("rebSh2Slot") : $("rotSh2Slot");
    if (sh1 && s1 && sh1.parentNode !== s1) s1.appendChild(sh1);
    if (sh2 && s2 && sh2.parentNode !== s2) s2.appendChild(sh2);
    // 仅视图真正切换时重置到第一步；同视图内（boot/goNext 流程）保持当前步骤
    if (changed) {
      stepTo(1);
      moveRotOnly(activeView);
    }
    applyModeUI();
    setFoldByMode();
    renderPool();
    updatePoolCount();
    renderSelSummary();
  }
  function stepTo(n) {
    // 当前视图 step1/step2 双层容器切换（slot 的父级=step，外加 sharedCfg 的 sh1/sh2）
    var s1 = activeView === "rebalance" ? $("rebSh1Slot") : $("rotSh1Slot");
    var s2 = activeView === "rebalance" ? $("rebSh2Slot") : $("rotSh2Slot");
    var p1 = s1 ? s1.parentElement : null, p2 = s2 ? s2.parentElement : null;
    var sh1 = $("sh1"), sh2 = $("sh2");
    if (n === 2) {
      if (p1) p1.style.display = "none";
      if (p2) p2.style.display = "";
      if (sh1) sh1.style.display = "none";
      if (sh2) sh2.style.display = "";
    } else {
      if (p1) p1.style.display = "";
      if (p2) p2.style.display = "none";
      if (sh1) sh1.style.display = "";
      if (sh2) sh2.style.display = "none";
    }
  }
  function goNext() {
    var nb = $("nextBtn");
    nb.disabled = true; nb.textContent = "正在加载行情数据并回测…";
    setTimeout(function () {
      ensureData(function () {
        stepTo(2);
        moveRotOnly(activeView);
        renderSelSummary();
        window.scrollTo(0, 0);
        boot();
      });
      nb.disabled = false; nb.textContent = "下一步 · 开始回测";
    }, 30);
  }
  function goBack() {
    var nb2 = $("nextBtn");
    nb2.disabled = false; nb2.textContent = "下一步 · 开始回测";
    stepTo(1);
    renderPool();
    applyModeUI();
    updatePoolCount();
  }

  // 折叠标题按视图显隐：再平衡视图参数少无需折叠（隐藏标题、全部展开）；轮动视图恢复折叠状态
  window.setFoldByMode = function () {
    var reb = activeView === "rebalance";
    var hsEls = document.querySelectorAll(".sfold-h");
    for (var a = 0; a < hsEls.length; a++) hsEls[a].style.display = reb ? "none" : "";
    var togEl = document.getElementById("sfToggle");
    if (togEl) togEl.style.display = reb ? "none" : "";
    var bs = document.querySelectorAll(".sfold-b");
    for (var c = 0; c < bs.length; c++) bs[c].classList.remove("hide");
    if (!reb) {
      var hh = localStorage.getItem("sf_grp");
      var openGrps = (hh === null) ? "fac" : hh.split(",").filter(function (x) { return x !== "exe"; }).join(",");
      ["fac", "core", "exe", "mgmt"].forEach(function (g) {
        var b = document.getElementById("sfg-" + g);
        if (!b) return;
        var open = openGrps.indexOf(g) >= 0;
        if (open) b.classList.remove("hide"); else b.classList.add("hide");
        var a2 = document.querySelector('.sfold-h[data-g="' + g + '"] .sf-a');
        if (a2) a2.textContent = open ? "收起" : "点击展开";
      });
    }
  };

  // ---------- 启动：默认轮动视图（仅标的池元信息，秒开） ----------
  var vrInit = $("viewRotation"); if (vrInit) vrInit.style.display = "";
  var trInit = $("tabRotation"); if (trInit) trInit.className = "on";
  switchView("rotation");
  var sh1Init = $("sh1"); if (sh1Init) sh1Init.style.display = "";
  $("nextBtn").addEventListener("click", goNext);
  $("backBtn").addEventListener("click", goBack);

  function renderSelSummary() {
    var el = $("selSummary");
    if (!el) return;
    var list = checkedCodes();
    if (!list.length) { el.style.display = "none"; el.innerHTML = ""; return; }
    el.style.display = "block";
    var parts = list.map(function (p) { return "<span class='seltag'>" + p.name + " <i>" + p.code + "</i></span>"; });
    el.innerHTML = "<span class='sellab'>已选标的（" + list.length + "）：</span>" + parts.join("");
  }

  // ---------- 第二步：解析行情数据后初始化完整界面并回测 ----------
  // ---------- 四视图导航（回测 / 已保存策略 / 相关性 / 策略组合） ----------
  function showView(v) {
    $("viewRotation").style.display = v === "rotation" ? "" : "none";
    $("viewRebalance").style.display = v === "rebalance" ? "" : "none";
    $("viewGrid").style.display = v === "grid" ? "" : "none";
    $("viewStrategies").style.display = v === "strategies" ? "" : "none";
    $("viewCorr").style.display = v === "correlation" ? "" : "none";
    $("viewCombo").style.display = v === "combo" ? "" : "none";
    $("viewIc").style.display = v === "ic" ? "" : "none";
    $("tabRotation").className = v === "rotation" ? "on" : "";
    $("tabRebalance").className = v === "rebalance" ? "on" : "";
    $("tabGrid").className = v === "grid" ? "on" : "";
    $("tabStrategies").className = v === "strategies" ? "on" : "";
    $("tabCorr").className = v === "correlation" ? "on" : "";
    $("tabCombo").className = v === "combo" ? "on" : "";
    $("tabIc").className = v === "ic" ? "on" : "";
    var svMap = { rotation: "tabRotation", rebalance: "tabRebalance", grid: "tabGrid", strategies: "tabStrategies", correlation: "tabCorr", combo: "tabCombo", ic: "tabIc" };
    var svTab = svMap[v] ? $(svMap[v]) : null;
    if (svTab && svTab.scrollIntoView) { try { svTab.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { svTab.scrollIntoView(); } }
    if (v === "rotation" || v === "rebalance") switchView(v);
    if (v === "strategies") renderStrategyList();
    if (v === "grid" && window.GridView) GridView.render();
    if (v === "correlation" && window.CorrView) CorrView.render();
    if (v === "combo") renderComboSetup();
    if (v === "ic" && window.ICView) ICView.render();
  }
  function hashView() {
    var h = location.hash || "";
    if (h.indexOf("rotation") >= 0) return "rotation";
    if (h.indexOf("rebalance") >= 0 || h.indexOf("backtest") >= 0) return "rebalance";
    if (h.indexOf("grid") >= 0 || h.indexOf("wangge") >= 0) return "grid";
    if (h.indexOf("strategies") >= 0) return "strategies";
    if (h.indexOf("correlation") >= 0 || h.indexOf("corr") >= 0) return "correlation";
    if (h.indexOf("combo") >= 0) return "combo";
    if (h.indexOf("ic") >= 0 || h.indexOf("factor") >= 0) return "ic";
    return "rotation";
  }
  $("tabRotation").addEventListener("click", function () { location.hash = "#/rotation"; });
  $("tabRebalance").addEventListener("click", function () { location.hash = "#/rebalance"; });
  $("tabGrid").addEventListener("click", function () { location.hash = "#/grid"; });
   var gsBtn = $("gridSaveBtn");
   if (gsBtn) gsBtn.addEventListener("click", function () { if (window.GridView) GridView.gridSave(); });
  $("tabStrategies").addEventListener("click", function () { location.hash = "#/strategies"; });
  $("tabCorr").addEventListener("click", function () { location.hash = "#/correlation"; });
  $("tabCombo").addEventListener("click", function () { location.hash = "#/combo"; });
  $("tabIc").addEventListener("click", function () { location.hash = "#/ic"; });
  window.addEventListener("hashchange", function () { showView(hashView()); });

  // ==================== 网格回测视图（GridView） ====================
  function gName(code) {
    var i2, arr = (typeof POOL !== "undefined" ? POOL : (D && D.pool) || []);
    for (i2 = 0; i2 < arr.length; i2++) { if (arr[i2].code === code) return arr[i2].name; }
    return code;
  }
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
      var gsh = $("gridScoreHelpBtn");
      if (gsh) gsh.addEventListener("click", function () {
        var m = $("gridScoreHelpModal");
        if (m) { m.style.display = "block"; document.body.style.overflow = "hidden"; }
      });
      var gsc = $("gridScoreHelpClose");
      if (gsc) gsc.addEventListener("click", function () {
        var m = $("gridScoreHelpModal");
        if (m) { m.style.display = "none"; document.body.style.overflow = ""; }
      });
      $("gridRunBtn").addEventListener("click", function () { self.run(); });
      var nB = $("gridNextBtn"); if (nB) nB.addEventListener("click", function () { self.nextStep(); });
      var pB = $("gridPrevBtn"); if (pB) pB.addEventListener("click", function () { self.prevStep(); });
      var sB = $("gridStressBtn"); if (sB) sB.addEventListener("click", function () { self.runStress(); });
      var n2B = $("gridNext2Btn"); if (n2B) n2B.addEventListener("click", function () { self.nextStep2(); });
      var p2B = $("gridPrev2Btn"); if (p2B) p2B.addEventListener("click", function () { self.prevStep2(); });
      var fOn = $("gridFilterOn"); if (fOn) fOn.addEventListener("change", function () { self.filterOn = this.checked; self.renderPoolBox(); });
      var vW = $("gridVolWin"); if (vW) {
        var vT = null;
        vW.addEventListener("input", function () { clearTimeout(vT); vT = setTimeout(function () { self.applyVolWin(); }, 500); });
        vW.addEventListener("change", function () { clearTimeout(vT); self.applyVolWin(); });
      }
      Array.prototype.forEach.call(document.querySelectorAll('input[name=gridLiqMode]'), function (r) {
        r.addEventListener("change", function () {
          var fixed = document.querySelector('input[name=gridLiqMode]:checked').value === "fixed";
          var fEl = $("gridLiqFixed");
          if (fEl) fEl.style.display = fixed ? "" : "none";
          var hEl = $("gridLiqHint");
          if (hEl) hEl.textContent = fixed ? "固定值（万元）：60日成交额P10 >= 门槛" : "自动 = 单格金额×200（总金额÷标的数×40）折算，60日成交额P10>=门槛";
        });
      });
      var tN2 = $("gridTopN"); if (tN2) tN2.addEventListener("change", function () {
        if (D && self.allScores) { self.computeScores(); showNotice("组合标的数已改为 " + this.value + "：底仓均分与剩余资金已重算"); }
        else showNotice("组合标的数已改为 " + this.value + "（请先计算适配度评分后生效）");
      });
      var gIv = $("gridInvest"); if (gIv) {
        var gT = null;
        gIv.addEventListener("input", function () { clearTimeout(gT); gT = setTimeout(function () { self.applyInvest(); }, 500); });
        gIv.addEventListener("change", function () { clearTimeout(gT); self.applyInvest(); });
      }
      var gCap2 = $("gridCapital"); if (gCap2 && $("gridInvest")) {
        gCap2.addEventListener("change", function () { $("gridInvest").value = this.value; self.applyInvest(); });
      }
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
          var sc = self.allScores ? self.allScores[p.code] : null;
          var bad = sc && (sc.gate && sc.gate.length);
          var low = sc && !bad && sc.score < self.thr;
          var dis = self.filterOn && (bad || low);
          var l = document.createElement("label");
          l.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#CBD5E1;background:#111827;border:1px solid #1E293B;border-radius:4px;padding:1px 6px;cursor:pointer;white-space:nowrap" + (dis ? ";opacity:.45" : "");
          var tag = "";
          if (sc) {
            if (bad) tag = ' <span style="color:#F87171;font-size:10px">✗' + sc.gate[0] + '</span>';
            else if (low) tag = ' <span style="color:#FBBF24;font-size:10px">' + sc.score.toFixed(0) + '分·低</span>';
            else tag = ' <span style="color:#34D399;font-size:10px">' + sc.score.toFixed(0) + '分</span>';
          }
          l.innerHTML = '<input type="checkbox" style="margin:0;accent-color:#F59E0B;cursor:pointer"' + (dis ? " disabled" : "") + '>' + p.name + ' <span style="color:#64748B">' + p.code + "</span>" + tag;
          if (self.checked[p.code]) l.querySelector("input").checked = true;
          l.querySelector("input").addEventListener("change", function () { self.checked[p.code] = this.checked; self.refreshStat(); });
          box.appendChild(l);
        });
      });
    },
    _ensureD: function (op) {
      var self = this;
      if (self._loadingD) { self._needOp = op; return; }
      self._loadingD = true;
      self._needOp = op;
      var gN = $("gridNotice");
      if (gN) { gN.textContent = "行情数据加载中，加载完成后自动继续…"; gN.style.display = "block"; }
      var btns = [$("gridScoreBtn"), $("gridRunBtn")];
      btns.forEach(function (b) { if (b) { b.disabled = true; b.dataset.orig = b.textContent; b.textContent = "加载中…"; } });
      ensureData(function () {
        self._loadingD = false;
        if (gN) { gN.textContent = ""; gN.style.display = "none"; }
        btns.forEach(function (b) { if (b) { b.disabled = false; b.textContent = b.dataset.orig; } });
        var op2 = self._needOp; self._needOp = null;
        if (op2 === "scores") self.computeScores();
        else if (op2 === "run") self.run();
        else if (op2 === "next") self.nextStep();         else if (op2 === "stress") self.runStress();
      });
    },
    computeScores: function () {
      var self = this;
      if (!D) { self._ensureD("scores"); return; }
      window.__GRID_D = D;
      var i = D.calendar.length - 1;
      var n = Math.max(1, +($("gridTopN").value) || 10);
      var thr = Math.max(0, Math.min(100, +($("gridThr").value) || 60));
      self.thr = thr;
      var sel = POOL.filter(function (p) { return self.checked[p.code]; });
      if (!sel.length) { showNotice("请先勾选至少 1 只标的"); return; }
      var costRt = (+($("gridComm").value) || 0.00025) + (+($("gridSlip").value) || 0.0005);
      var volWin = Math.max(20, +($("gridVolWin").value) || 60);
      var invest = Math.max(1, +($("gridCapital").value) || 1000000);
      // 全池评分（供列表标注/过滤），Top N 只取勾选中合格的
      var lmEl = document.querySelector('input[name=gridLiqMode]:checked');
      var liqMode = lmEl ? lmEl.value : "auto";
      var liqFixed = $("gridLiqFixed") ? Math.max(0, +($("gridLiqFixed").value) || 5000) : 5000;
      var all = {};
      POOL.forEach(function (p) { all[p.code] = WufuEngine.gridScore(p.code, i, { invest: invest, topN: n, liqMode: liqMode, liqFixed: liqFixed }); });
      self.allScores = all;
      self.allParams = {};
      var scores = sel.map(function (p) { return all[p.code]; })
        .filter(function (s) { return s && !s.gate.length && s.score >= thr; })
        .sort(function (a, b) { return b.score - a.score; });
      var top = scores.slice(0, n);
      this.lastScores = top;
      // 均分分母 = 组合标的数（Top N 值）；实际参与数 K=top.length ≤ N 时，剩余资金由「剩余资金买入」兜底
      var perCode = invest / Math.max(1, n);
      this.lastParams = {};
      var html = '<table class="trades" style="width:100%"><thead><tr>' +
        "<th>代码</th><th>名称</th><th>综合分</th><th>震荡度</th><th>波动空间</th><th>区间覆盖</th><th>触发频率</th><th>60日P10</th><th>年化波动</th><th>ADX</th><th>ER</th><th>年触发</th></tr></thead><tbody>";
      top.forEach(function (s) {
        var p0 = WufuEngine.gridParams(s.code, i, perCode, costRt, volWin);
        self.lastParams[s.code] = p0;
        self.allParams[s.code] = p0;
        var warns = p0 && p0.warns ? p0.warns.map(function (w) { return '<span style="color:#FBBF24">⚠ ' + w + "</span>"; }).join("") : "";
        html += "<tr><td data-label='代码'>" + s.code + "</td><td data-label='名称'>" + gName(s.code) + "</td><td data-label='综合分' style='color:#60A5FA;font-weight:600'>" + s.score.toFixed(1) +
          "</td><td data-label='震荡度'>" + s.parts.osc.toFixed(0) + "</td><td data-label='波动空间'>" + s.parts.vol.toFixed(0) + "</td><td data-label='区间覆盖'>" + s.parts.cov.toFixed(0) +
          "</td><td data-label='触发频率'>" + s.parts.trig.toFixed(0) + "</td><td data-label='流动性'>" + (s.parts.liqP10 !== undefined ? (s.parts.liqP10 >= 10000 ? (s.parts.liqP10 / 10000).toFixed(1) + "亿" : s.parts.liqP10.toFixed(0) + "万") : "-") + "</td><td data-label='年化波动'>" + (s.vol * 100).toFixed(1) +
          "%</td><td data-label='ADX'>" + (s.adx ? s.adx.toFixed(1) : "-") + "</td><td data-label='ER'>" + (s.er ? s.er.toFixed(2) : "-") + "</td><td data-label='年触发'>" +
          (s.parts.perY ? s.parts.perY.toFixed(0) : "-") + "</td></tr><tr><td colspan='12' data-label='' style='color:#94A3B8;font-size:11px'>" +
          "区间 [" + (p0.lower).toFixed(3) + ", " + (p0.upper).toFixed(3) + "] · 格距 " + p0.step.toFixed(3) + " · " + p0.nLevels +
          " 格 · 每格 " + p0.perLevelAmt.toFixed(0) + " 元 · 底仓 " + p0.baseAmt.toFixed(0) + " 元 " + warns + "</td></tr>";
      });
      html += "</tbody></table>";
      var el = $("gridScoreTable");
      el.innerHTML = '<div style="overflow-x:auto"><div style="font-size:12px;color:#CBD5E1;margin:4px 0">适配度评分 · Top ' + top.length + "（勾选 " + sel.length + " 只，达标≥" + thr + " 分 " + scores.length + " 只）</div>" + html + "</div>";
      self.renderPoolBox();
      self.refreshStat();
    },
    renderScoreTable: function () {
      var self = this;
      var el = $("gridScoreTable"); if (!el || !self.lastScores || !self.lastScores.length) return;
      var top = self.lastScores, thr = self.thr || 60;
      var html = '<table class="trades" style="width:100%"><thead><tr>' +
        "<th>代码</th><th>名称</th><th>综合分</th><th>震荡度</th><th>波动空间</th><th>区间覆盖</th><th>触发频率</th><th>60日P10</th><th>年化波动</th><th>ADX</th><th>ER</th><th>年触发</th></tr></thead><tbody>";
      top.forEach(function (s) {
        var p0 = self.lastParams[s.code];
        var warns = p0 && p0.warns ? p0.warns.map(function (w) { return '<span style="color:#FBBF24">⚠ ' + w + "</span>"; }).join("") : "";
        html += "<tr><td data-label='代码'>" + s.code + "</td><td data-label='名称'>" + gName(s.code) + "</td><td data-label='综合分' style='color:#60A5FA;font-weight:600'>" + s.score.toFixed(1) +
          "</td><td data-label='震荡度'>" + s.parts.osc.toFixed(0) + "</td><td data-label='波动空间'>" + s.parts.vol.toFixed(0) + "</td><td data-label='区间覆盖'>" + s.parts.cov.toFixed(0) +
          "</td><td data-label='触发频率'>" + s.parts.trig.toFixed(0) + "</td><td data-label='流动性'>" + (s.parts.liqP10 !== undefined ? (s.parts.liqP10 >= 10000 ? (s.parts.liqP10 / 10000).toFixed(1) + "亿" : s.parts.liqP10.toFixed(0) + "万") : "-") + "</td><td data-label='年化波动'>" + (s.vol * 100).toFixed(1) +
          "%</td><td data-label='ADX'>" + (s.adx ? s.adx.toFixed(1) : "-") + "</td><td data-label='ER'>" + (s.er ? s.er.toFixed(2) : "-") + "</td><td data-label='年触发'>" +
          (s.parts.perY ? s.parts.perY.toFixed(0) : "-") + "</td></tr><tr><td colspan='12' data-label='' style='color:#94A3B8;font-size:11px'>" +
          (p0 ? "区间 [" + (p0.lower).toFixed(3) + ", " + (p0.upper).toFixed(3) + "] · 格距 " + p0.step.toFixed(3) + " · " + p0.nLevels +
          " 格 · 每格 " + p0.perLevelAmt.toFixed(0) + " 元 · 底仓 " + p0.baseAmt.toFixed(0) + " 元 · σ" + ((p0.sig || 0) * 100).toFixed(2) + "%·振" + ((p0.amp || 0) * 100).toFixed(2) + "% " + warns : "") + "</td></tr>";
      });
      html += "</tbody></table>";
      el.innerHTML = '<div style="overflow-x:auto"><div style="font-size:12px;color:#CBD5E1;margin:4px 0">适配度评分 · Top ' + top.length + "（达标≥" + thr + " 分）</div>" + html + "</div>";
    },
    refreshStat: function () {
      var self = this;
      var el = $("gridStat"); if (!el) return;
      if (!self.allScores) { el.textContent = ""; return; }
      var thr = self.thr;
      var ok = 0;
      POOL.forEach(function (p) { var s = self.allScores[p.code]; if (s && !s.gate.length && s.score >= thr) ok++; });
      var selN = POOL.filter(function (p) { return self.checked[p.code]; }).length;
      el.textContent = "达标 " + ok + " 只 / 已选 " + selN + " 只";
    },
    nextStep: function () {
      var self = this;
      if (!D) { self._ensureD("next"); return; }
      if (!self.lastScores || !self.lastScores.length) { showNotice("请先计算适配度评分（勾选标的后点「计算适配度评分」）"); return; }
      $("gridStep1").style.display = "none";
      $("gridStep2").style.display = "";
      self.renderParamsTable();
    },
    prevStep: function () {
      $("gridStep3").style.display = "none";
      $("gridStep2").style.display = "";
    },
    nextStep2: function () {
      $("gridStep2").style.display = "none";
      $("gridStep3").style.display = "";
      this.renderParamsTable();
    },
    prevStep2: function () {
      $("gridStep2").style.display = "none";
      $("gridStep1").style.display = "";
    },
    runStress: function () {
      var self = this;
      if (!D) { self._ensureD("stress"); return; }
      if (!this.lastScores || !this.lastScores.length) { showNotice("请先计算适配度评分（勾选标的后点「计算适配度评分」）"); return; }
      var stEl = $("gridStressState"); if (stEl) stEl.textContent = "压力测试计算中…（极端段回放+破网模拟+参数扰动）";
      var cfg = self.collectCfg();
      var params = {
        codes: cfg.codes, initial_capital: cfg.settings.capital,
        mgmt: cfg.settings.mgmt, period_n: cfg.settings.period_n, period_unit: cfg.settings.period_unit,
        commission_rate: cfg.settings.comm, slippage_rate: cfg.settings.slip, min_commission: cfg.settings.min_comm,
        vol_win: cfg.vol_win, top_n: cfg.top_n, idle_buy: cfg.idle_buy, gridOverrides: cfg.overrides,
        liq_mode: cfg.liq_mode, liq_fixed: cfg.liq_fixed
      };
      setTimeout(function () {
        try {
          var segs = WufuEngine.STRESS_SEGS.slice();
          var mdd = WufuEngine.gridMaxDDSeg(D, params);
          if (mdd) segs.push(mdd);
          var segR = WufuEngine.gridStressSegs(D, params, segs);
          var depth = Math.max(5, Math.min(50, +($("gridStressDepth").value) || 20));
          var breach = WufuEngine.gridBreachSim(D, params, depth);
          var perturb = WufuEngine.gridStressPerturb(D, params);
          self._stressRes = { segs: segR, breach: breach, perturb: perturb, mdd: mdd };
          if (stEl) stEl.textContent = "完成";
          self.renderStress();
        } catch (e) { if (stEl) stEl.textContent = "失败：" + ((e && e.message) || e); }
      }, 40);
    },
    renderStress: function () {
      var self = this;
      var el = $("gridStressResult"); if (!el) return;
      var gW = function (v) { return (v / 10000).toFixed(1) + "万"; };
      var res = this._stressRes; if (!res) return;
      var h = '';
      h += '<div style="font-size:13px;color:#E2E8F0;font-weight:600;margin:8px 0 4px">① 历史极端段回放（网格策略段内表现）</div>';
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
      res.segs.forEach(function (r) {
        var d = r.status ? '<div style="font-size:12px;color:#64748B">' + r.status + '</div>' :
          '<div style="font-size:12px;color:#CBD5E1">' + r.start + ' ~ ' + r.end + ' · ' + r.n_days + ' 个交易日</div>' +
          '<div style="font-size:12px;color:#CBD5E1;margin-top:2px">段收益 <span style="color:' + (r.total_return >= 0 ? '#34D399' : '#F87171') + ';font-weight:600">' + gPct(r.total_return) + '</span></div>' +
          '<div style="font-size:12px;color:#CBD5E1">最大浮亏 <span style="color:#F87171">' + gPct(r.max_dd) + '</span></div>' +
          '<div style="font-size:12px;color:#CBD5E1">补仓 ' + r.buy_trades + ' 次 · 破网 ' + r.broke + ' 次</div>';
        h += '<div style="flex:1;min-width:220px;background:#111827;border:1px solid #334155;border-radius:8px;padding:8px 10px">' +
          '<div style="font-size:12px;color:#93C5FD;font-weight:600;margin-bottom:2px">' + r.label + '</div>' + d + '</div>';
      });
      h += '</div>';
      var b = res.breach;
      h += '<div style="font-size:13px;color:#E2E8F0;font-weight:600;margin:12px 0 4px">② 破网情景模拟（深度 ' + b.depthPct.toFixed(0) + '%，从当前价逐格单边下跌至 区间下限×(1-' + b.depthPct.toFixed(0) + '%)）</div>';
      h += '<div style="font-size:12px;color:#FBBF24;margin-bottom:4px">累计买入 <b>' + gW(b.totalBuy) + '</b>（投资总额 ' + gW(b.invest) + '）· 剩余可用资金 <b>' + (b.totalRemain >= 0 ? gW(b.totalRemain) : '0（资金耗尽，需追加 ' + gW(-b.totalRemain) + '）') + '</b></div>';
      h += '<div style="overflow-x:auto"><table class="trades" style="width:100%"><thead><tr><th>代码</th><th>当前价</th><th>区间下限</th><th>破网价</th><th>格数</th><th>买入格数</th><th>累计买入</th><th>期末市值</th><th>最大浮亏</th><th>浮亏%</th><th>剩余资金</th></tr></thead><tbody>';
      b.rows.forEach(function (r) {
        if (r.status) { h += '<tr><td colspan="11" style="color:#64748B;font-size:12px">' + r.code + ' ' + r.status + '</td></tr>'; return; }
        h += '<tr><td>' + r.code + '</td><td>' + r.cur + '</td><td>' + r.lower + '</td><td>' + r.breakPx + '</td><td>' + r.nLevels + '</td><td>' + r.buyLevels + '</td><td>' + gW(r.cumBuy) + '</td><td>' + gW(r.val) + '</td><td style="color:#F87171">' + gW(r.loss) + '</td><td style="color:#F87171">' + gPct(r.lossPct) + '</td><td>' + (r.remain > 0 ? gW(r.remain) : '耗尽') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      h += '<div style="font-size:11px;color:#64748B;margin-top:2px">极端情景假设：底仓已按当前价买入，每穿越一格买入一格，直至跌破破网价停止；仅供风险评估，不代表真实收益。</div>';
      h += '<div style="font-size:13px;color:#E2E8F0;font-weight:600;margin:12px 0 4px">③ 参数扰动对比（固定网格参数、不重锚定，聚焦参数敏感性）</div>';
      h += '<div style="overflow-x:auto"><table class="trades" style="width:100%"><thead><tr><th>扰动组</th><th>年化</th><th>最大回撤</th><th>破网次数</th><th>成交笔数</th></tr></thead><tbody>';
      res.perturb.forEach(function (r) {
        if (r.status) { h += '<tr><td colspan="5" style="color:#64748B;font-size:12px">' + r.label + ' ' + r.status + '</td></tr>'; return; }
        h += '<tr' + (r.key === "base" ? ' style="background:#1E293B"' : '') + '><td>' + r.label + '</td><td>' + gPct(r.cagr) + '</td><td>' + gPct(r.max_dd) + '</td><td>' + r.broke + '</td><td>' + r.n_trades + '</td></tr>';
      });
      h += '</tbody></table></div>';
      h += '<div style="font-size:11px;color:#64748B;margin-top:2px">格距按格数换算（引擎格距=区间宽÷格数）：格距×0.7≈格数×1.43、格距×1.3≈格数×0.77；区间×0.9/×1.1 为上下界整体缩放。主回测含体检重锚定，扰动对比固定参数仅供敏感性参考。</div>';
      el.innerHTML = h;
    },
    nameOf: function (code) {
      var p = (window.WUFU_POOL || []).filter(function (x) { return x.code === code; })[0];
      return p ? p.name : code;
    },
    renderParamsTable: function () {
      var self = this;
      var el = $("gridParamTable"); if (!el) return;
      if (!this.lastScores || !this.lastScores.length) { el.innerHTML = '<div style="font-size:12px;color:#64748B">先执行适配度评分，自动生成每标的网格参数</div>'; return; }
      var html = '<table class="trades" style="width:100%"><thead><tr>' +
        "<th>代码</th><th>名称</th><th>区间下限</th><th>区间上限</th><th>格距</th><th>格数</th><th>底仓资金</th><th>每格资金</th><th>触发基准价</th><th>波动统计</th><th>档位预览</th></tr></thead><tbody>";
      this.lastScores.forEach(function (s) {
        var p = self.lastParams[s.code];
        if (!p) return;
        var nL = Math.max(1, Math.round(p.nLevels || 5));
        var perL = p.baseAmt / nL;
        var tb = p.triggerBase !== undefined && +p.triggerBase > 0 ? +p.triggerBase : p.cur;
        var nD = Math.floor((nL - 1) / 2);
        var loL = tb + (0 - nD) * p.step, hiL = tb + (nL - 1 - nD) * p.step;
        var warns = p.warns ? p.warns.map(function (w) { return '<span style="color:#FBBF24">⚠ ' + w + "</span>"; }).join("") : "";
        var unchg = p._changed === false;
        var volCell = '<span data-k="volStat" data-c="' + s.code + '" style="color:#94A3B8;font-size:11px">σ' + ((p.sig || 0) * 100).toFixed(2) + '%·振' + ((p.amp || 0) * 100).toFixed(2) + '%</span>' + (unchg ? ' <span style="color:#64748B;font-size:10px">·未变</span>' : '');
        html += "<tr><td data-label='代码'>" + s.code + "</td><td data-label='名称'>" + gName(s.code) + "</td>" +
          "<td data-label='区间下限'><input type='number' step='0.001' data-k='lower' data-c='" + s.code + "' value='" + p.lower.toFixed(3) + "' style='width:70px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827;color:#E2E8F0'></td>" +
          "<td data-label='区间上限'><input type='number' step='0.001' data-k='upper' data-c='" + s.code + "' value='" + p.upper.toFixed(3) + "' style='width:70px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827;color:#E2E8F0'></td>" +
          "<td data-label='格距'><input type='number' step='0.0005' data-k='step' data-c='" + s.code + "' value='" + p.step.toFixed(3) + "' style='width:62px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827;color:#E2E8F0'></td>" +
          "<td data-label='格数'><input type='number' step='1' min='1' data-k='nLevels' data-c='" + s.code + "' value='" + p.nLevels + "' style='width:48px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827;color:#E2E8F0'></td>" +
          "<td data-label='底仓资金'><input type='number' step='100' data-k='baseAmt' data-c='" + s.code + "' value='" + p.baseAmt.toFixed(0) + "' style='width:76px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827;color:#E2E8F0'></td>" +
          "<td data-label='每格资金'><span data-k='perL' data-c='" + s.code + "' style='color:#CBD5E1;font-size:12px'>" + perL.toFixed(0) + " 元</span></td>" +
          "<td data-label='触发基准价'><input type='number' step='0.001' data-k='triggerBase' data-c='" + s.code + "' value='" + tb.toFixed(3) + "' style='width:70px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;background:#111827;color:#E2E8F0'></td>" +
          "<td data-label='波动统计'>" + volCell + "</td>" +
          "<td data-label='档位预览'><span data-k='lvlPrev' data-c='" + s.code + "' style='color:#64748B;font-size:11px'>" + loL.toFixed(3) + " ~ " + hiL.toFixed(3) + "</span></td></tr>" +
          (warns ? "<tr><td colspan='10' data-label='' style='color:#FBBF24;font-size:11px'>" + warns + "</td></tr>" : "");
      });
      html += "</tbody></table>";
      el.innerHTML = '<div style="overflow-x:auto">' + html + "</div>";
      function refreshRow(c) {
        var p = self.lastParams[c]; if (!p) return;
        var nL = Math.max(1, Math.round(p.nLevels || 5));
        p.perLevelAmt = p.baseAmt / nL;
        var per = el.querySelector("span[data-k='perL'][data-c='" + c + "']");
        if (per) per.textContent = p.perLevelAmt.toFixed(0) + " 元";
        var tb = p.triggerBase !== undefined && +p.triggerBase > 0 ? +p.triggerBase : p.cur;
        var nD = Math.floor((nL - 1) / 2);
        var lv = el.querySelector("span[data-k='lvlPrev'][data-c='" + c + "']");
        if (lv) lv.textContent = (tb + (0 - nD) * p.step).toFixed(3) + " ~ " + (tb + (nL - 1 - nD) * p.step).toFixed(3);
        self.lastParams[c] = p;
      }
      function onParamEdit() {
        var c = this.getAttribute("data-c"), k = this.getAttribute("data-k");
        var p = self.lastParams[c]; if (!p) return;
        if (k === "lower" || k === "upper" || k === "nLevels") {
          var nL = Math.max(1, Math.round(p.nLevels || 5));
          p.step = (p.upper - p.lower) / nL;
        } else {
          p[k] = +this.value || p[k];
          if (k === "baseAmt") p._manualAmt = true;
        }
        if (p._changed !== undefined) delete p._changed;
        refreshRow(c);
        self.renderScoreTable();
      }
      el.querySelectorAll("input[data-k]").forEach(function (inp) {
        inp.addEventListener("input", onParamEdit);
        inp.addEventListener("change", onParamEdit);
      });
    },
    run: function () {
      var self = this;
      if (!D) { self._ensureD("run"); return; }
      window.__GRID_D = D;
      if (!this.lastScores || !this.lastScores.length) { showNotice("请先计算适配度评分"); return; }
      var self = this;
      var codes = this.lastScores.map(function (s) { return s.code; });
      var overrides = {};
      this.lastScores.forEach(function (s) {
        var p = self.lastParams[s.code];
        if (!p) return;
        overrides[s.code] = { lower: p.lower, upper: p.upper, step: p.step, nLevels: p.nLevels, perLevelAmt: p.perLevelAmt, baseAmt: p.baseAmt, triggerBase: p.triggerBase !== undefined && +p.triggerBase > 0 ? +p.triggerBase : p.cur };
      });
      this.lastCapital = Math.max(1, +($("gridCapital").value) || 1000000);
      var params = {
        codes: codes, initial_capital: this.lastCapital,
        mgmt: $("gridMgmt").value || "B",
        period_n: Math.max(1, +($("gridPeriodN").value) || 12),
        period_unit: $("gridPeriodUnit").value || "周",
        commission_rate: +($("gridComm").value) || 0.00025,
        slippage_rate: +($("gridSlip").value) || 0.0005,
        min_commission: +($("gridMinComm").value) || 0,
        vol_win: Math.max(20, +($("gridVolWin").value) || 60),
        top_n: Math.max(1, +($("gridTopN").value) || codes.length),
        idle_buy: $("gridIdleSel") ? $("gridIdleSel").value : "cash",
        liq_mode: (document.querySelector('input[name=gridLiqMode]:checked') || {}).value || "auto",
        liq_fixed: $("gridLiqFixed") ? Math.max(0, +($("gridLiqFixed").value) || 5000) : 5000,
        gridOverrides: overrides
      };
      var stEl = $("gridRunState"); stEl.textContent = "计算中…";
      try {
        var res = WufuEngine.backtestGrid(D, params);
        this._lastRes = res;
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
      var nav = res.nav.map(function (v, idx) { var d0 = String(res.dates[idx]).replace(/-/g, ""); return [+d0.slice(0, 4) + "-" + d0.slice(4, 6) + "-" + d0.slice(6, 8), +(v > 0 ? v : this.lastCapital)]; });
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
    },
    applyInvest: function () {
      var self = this;
      var invest = Math.max(1000, +($("gridInvest").value) || 1000000);
      if ($("gridCapital")) $("gridCapital").value = invest;
      if (!self.lastScores || !self.lastScores.length) {
        self.lastCapital = invest;
        showNotice("投资总金额已设为 " + invest.toLocaleString() + " 元；请先计算适配度评分，评分后按标的数均分底仓");
        return;
      }
      var perCode = invest / Math.max(1, self.lastScores.length);
      var kept = 0;
      self.lastScores.forEach(function (s) {
        var p = self.lastParams[s.code];
        if (!p) return;
        if (p._manualAmt) { kept++; return; }
        p.baseAmt = perCode;
        p.perLevelAmt = perCode / Math.max(1, p.nLevels);
        if (p._changed !== undefined) delete p._changed;
      });
      self.lastCapital = invest;
      self.renderParamsTable();
      self.renderScoreTable();
      showNotice(kept ? "投资总金额已改为 " + invest.toLocaleString() + " 元：每标的底仓 " + perCode.toFixed(0) + " 元（均分，" + kept + " 只手动覆盖值保留）" : "投资总金额已改为 " + invest.toLocaleString() + " 元：每标的底仓 " + perCode.toFixed(0) + " 元（" + self.lastScores.length + " 只均分）");
    },
    applyVolWin: function () {
      var self = this;
      if (!D) { showNotice("行情数据尚未加载，请先点「计算适配度评分」"); return; }
      if (!self.lastScores || !self.lastScores.length) { showNotice("请先计算适配度评分（勾选标的后点「计算适配度评分」），再调整波动统计区间"); return; }
      var i = D.calendar.length - 1;
      var volWin = Math.max(20, +($("gridVolWin").value) || 60);
      var invest = Math.max(1, +($("gridCapital").value) || 1000000);
      var perCode = invest / Math.max(1, self.lastScores.length);
      var costRt = (+($("gridComm").value) || 0.00025) + (+($("gridSlip").value) || 0.0005);
      var changed = false, snap = {}, anyMsg = null;
      self.lastScores.forEach(function (s) {
        snap[s.code] = self.lastParams[s.code];
        var p = WufuEngine.gridParams(s.code, i, perCode, costRt, volWin);
        if (p) { var old = self.lastParams[s.code]; if (old) { p.triggerBase = old.triggerBase; p.baseAmt = old.baseAmt; p.perLevelAmt = old.baseAmt / Math.max(1, p.nLevels); p._changed = !(Math.abs((p.step || 0) - (old.step || 0)) > 1e-9 || p.nLevels !== old.nLevels) === false ? true : (Math.abs((p.step || 0) - (old.step || 0)) > 1e-9 || p.nLevels !== old.nLevels); if (p._changed) changed = true; if (!anyMsg) anyMsg = { code: s.code, oldSig: old.sig, newSig: p.sig, oldAmp: old.amp, newAmp: p.amp, oldStep: old.step, newStep: p.step, oldN: old.nLevels, newN: p.nLevels }; } self.lastParams[s.code] = p; self.allParams[s.code] = p; }
      });
      var oldV = $("gridVolWin") && $("gridVolWin").dataset ? +$("gridVolWin").dataset.lastV || 60 : 60;
      var msg;
      if (anyMsg) {
        msg = "波动统计区间 " + oldV + "→" + volWin + " 日：σ " + (anyMsg.oldSig * 100).toFixed(2) + "%→" + (anyMsg.newSig * 100).toFixed(2) + "%、振幅 " + (anyMsg.oldAmp * 100).toFixed(2) + "%→" + (anyMsg.newAmp * 100).toFixed(2) + "%；格距 " + anyMsg.oldStep.toFixed(4) + "→" + anyMsg.newStep.toFixed(4) + "（" + anyMsg.oldN + "→" + anyMsg.newN + " 格" + (anyMsg.newN === anyMsg.oldN ? "，取整后相同，可手动改格距）" : "）") + "；已重算 " + self.lastScores.length + " 只（底仓/触发基准价保留手动值）";
      } else {
        msg = "波动统计区间已改为 " + volWin + " 日；格距/格数未变化（窗口内波动率相近，格数离散化后相同），可手动修改格距";
      }
      if ($("gridVolWin")) $("gridVolWin").dataset.lastV = volWin;
      self.renderParamsTable();
      self.renderScoreTable();
      showNotice(msg);
    },
    collectCfg: function () {
      var self = this;
      var codes = POOL.filter(function (p) { return self.checked[p.code]; }).map(function (p) { return p.code; });
      return {
        codes: codes,
        top_n: Math.max(1, +($("gridTopN").value) || 10),
        idle_buy: $("gridIdleSel") ? $("gridIdleSel").value : "cash",
        overrides: self.lastParams || {},
        vol_win: Math.max(20, +($("gridVolWin").value) || 60),
        liq_mode: (document.querySelector('input[name=gridLiqMode]:checked') || {}).value || "auto",
        liq_fixed: $("gridLiqFixed") ? Math.max(0, +($("gridLiqFixed").value) || 5000) : 5000,
        settings: {
          period_n: Math.max(1, +($("gridPeriodN").value) || 12),
          period_unit: $("gridPeriodUnit") ? $("gridPeriodUnit").value : "周",
          mgmt: $("gridMgmt") ? $("gridMgmt").value : "B",
          capital: Math.max(1000, +($("gridCapital").value) || 1000000),
          comm: +($("gridComm").value) || 0.00025,
          slip: +($("gridSlip").value) || 0.0005,
          min_comm: +($("gridMinComm").value) || 0
        }
      };
    },
    gridSave: function () {
      var self = this;
      var cfg = self.collectCfg();
      if (!cfg.codes.length) { showNotice("请先勾选至少 1 只标的"); return; }
      if (!self.lastScores || !self.lastScores.length) { showNotice("请先计算适配度评分（保存参数覆盖需评分后的网格参数）"); return; }
      var name = ($("gridStName").value || "").trim() || ("网格·" + cfg.codes.length + "标的·Top" + cfg.top_n + "·" + new Date().toLocaleDateString());
      var m = loadStored();
      m[name] = { type: "grid", _saved_at: new Date().toISOString(), grid: cfg };
      storeAll(m); refreshStList(); renderStrategyList();
      showNotice("网格策略已保存：" + name);
    },
    applySaved: function (cfg) {
      var self = this;
      if (!cfg) return;
      self.checked = {};
      (cfg.codes || []).forEach(function (c) { self.checked[c] = true; });
      if ($("gridTopN")) $("gridTopN").value = cfg.top_n || 10;
      if ($("gridIdleSel") && cfg.idle_buy) $("gridIdleSel").value = cfg.idle_buy;
      var s = cfg.settings || {};
      if ($("gridPeriodN")) $("gridPeriodN").value = s.period_n || 12;
      if ($("gridPeriodUnit") && s.period_unit) $("gridPeriodUnit").value = s.period_unit;
      if ($("gridMgmt") && s.mgmt) $("gridMgmt").value = s.mgmt;
      if ($("gridCapital")) $("gridCapital").value = s.capital || 1000000;
      if ($("gridInvest")) $("gridInvest").value = $("gridCapital").value;
      if ($("gridComm") && s.comm !== undefined) $("gridComm").value = s.comm;
      if ($("gridSlip") && s.slip !== undefined) $("gridSlip").value = s.slip;
      if ($("gridMinComm") && s.min_comm !== undefined) $("gridMinComm").value = s.min_comm;
      self.lastParams = {};
      var ov = cfg.overrides || {};
      Object.keys(ov).forEach(function (c) { self.lastParams[c] = ov[c]; });
      if ($("gridVolWin") && cfg.vol_win) $("gridVolWin").value = cfg.vol_win;
      if ($("gridPoolSearch")) $("gridPoolSearch").value = "";
      self.renderPoolBox();
      var i = D ? D.calendar.length - 1 : -1;
      if (D && Object.keys(self.checked).length) self.computeScores();
    }
  };
  function gPct(v) { return (v * 100).toFixed(2) + "%"; }

  // ---------- 因子 IC 视图交互绑定 ----------
  (function () {
    var ss = document.getElementById("icPoolSearch");
    if (ss) ss.addEventListener("input", function () { if (window.ICView) ICView.render(); });
    var all = document.getElementById("icPoolAll"), none = document.getElementById("icPoolNone");
    if (all) all.addEventListener("click", function () { var c = document.querySelectorAll("#icPool input"); for (var i = 0; i < c.length; i++) c[i].checked = true; });
    if (none) none.addEventListener("click", function () { var c = document.querySelectorAll("#icPool input"); for (var i = 0; i < c.length; i++) c[i].checked = false; });
    var facAll = document.getElementById("icFacAll"), facNone = document.getElementById("icFacNone");
    if (facAll) facAll.addEventListener("click", function () { var c = document.querySelectorAll("#icFactors input"); for (var i = 0; i < c.length; i++) c[i].checked = true; });
    if (facNone) facNone.addEventListener("click", function () { var c = document.querySelectorAll("#icFactors input"); for (var i = 0; i < c.length; i++) c[i].checked = false; });
    var run = document.getElementById("icRun");
    if (run) run.addEventListener("click", function () { if (window.ICView) ICView.run(); });
  })();

  // ---------- 多策略组合视图 ----------
  var _comboCharts = {};
  function _disposeCombo(id) { if (_comboCharts[id]) { try { _comboCharts[id].dispose(); } catch (e) {} delete _comboCharts[id]; } }
  function renderComboSetup() {
    var box = $("comboStratList"); if (!box) return;
    var m = loadStored();
    var keys = Object.keys(m);
    box.innerHTML = "";
    if (!keys.length) {
      box.innerHTML = '<div style="font-size:12px;color:#94A3B8;padding:10px 2px">暂无已保存策略。<br>请先在「回测」页调好参数并保存，再到此页组合多个策略。</div>';
      return;
    }
    var ds = $("comboStart"), de = $("comboEnd");
    if (D && D.calendar && D.calendar.length) { ds.value = D.calendar[0]; de.value = D.calendar[D.calendar.length - 1]; }
    keys.forEach(function (nm) {
      var row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;color:#E2E8F0;padding:4px 6px;cursor:pointer;background:#111827;border:1px solid #1E293B;border-radius:5px";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "comboCk"; cb.checked = true;
      cb.style.cssText = "flex:0 0 auto";
      var nmEl = document.createElement("span");
      nmEl.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      nmEl.textContent = nm;
      nmEl.title = nm + ((m[nm].mode === "rebalance") ? "（再平衡策略）" : "（动量策略）");
      var wt = document.createElement("input");
      wt.type = "number"; wt.min = 0; wt.max = 100; wt.step = 1; wt.className = "comboWt";
      wt.style.cssText = "flex:0 0 52px;text-align:right;font-size:12px;padding:2px 4px;border:1px solid #334155;border-radius:4px;background:#0F172A;color:#E2E8F0";
      var wlab = document.createElement("span"); wlab.textContent = "%"; wlab.style.cssText = "color:#64748B;font-size:11px";
      cb.addEventListener("change", function () { balanceComboWeights(); });
      row.appendChild(cb); row.appendChild(nmEl); row.appendChild(wt); row.appendChild(wlab);
      box.appendChild(row);
    });
    balanceComboWeights();
    $("comboResult").style.display = "none";
  }
  function balanceComboWeights() {
    var cks = document.querySelectorAll(".comboCk"), wts = document.querySelectorAll(".comboWt");
    var n = 0, i; for (i = 0; i < cks.length; i++) if (cks[i].checked) n++;
    var each = n ? Math.round(100 / n * 10) / 10 : 0;
    for (var j = 0; j < wts.length; j++) wts[j].value = (cks[j].checked ? each : 0);
  }
  function runCombo() {
    var m = loadStored();
    var names = [], weights = [];
    var cks = document.querySelectorAll(".comboCk"), wts = document.querySelectorAll(".comboWt");
    for (var i = 0; i < cks.length; i++) {
      if (cks[i].checked) {
        names.push(cks[i].nextElementSibling.textContent);
        weights.push(parseFloat(wts[i].value) || 0);
      }
    }
    var warn = $("comboWarn");
    if (!names.length) { warn.style.display = ""; warn.textContent = "请至少勾选一个策略"; return; }
    var wsum = 0; weights.forEach(function (x) { wsum += x; });
    if (wsum <= 0) { warn.style.display = ""; warn.textContent = "权重之和需大于 0（请输入各策略权重百分比）"; return; }
    warn.style.display = "none";
    var w = weights.map(function (x) { return x / wsum; });
    var start = $("comboStart").value, end = $("comboEnd").value;
    var rebKey = $("comboReb").value, rebInt = parseInt($("comboRebInt").value || "1", 10) || 1;
    var base = { none: 0, daily: 1, weekly: 5, monthly: 21, quarterly: 63, yearly: 252 }[rebKey] || 0;
    var intervalDays = base * rebInt;
    if (names.length < 2) showNotice("相关性需至少 2 个策略；组合净值仍可显示");
    showNotice("正在回测 " + names.length + " 个策略并合成组合，请稍候…");
    ensureData(function () {
      var paramsList = [], resList = [];
      names.forEach(function (nm) {
        var p = JSON.parse(JSON.stringify(m[nm]));
        if (start) p.start_date = start;
        if (end) p.end_date = end;
        paramsList.push(p);
        resList.push(engine.backtest(D, p));
      });
      // P1-6 组合再平衡扣成本：取各策略中较高的单边成本作为组合换仓成本
      var comboCost = 0;
      paramsList.forEach(function (pp) { var cc = (+pp.commission_rate || 0) + (+pp.slippage_rate || 0); if (cc > comboCost) comboCost = cc; });
      var comboRes = buildCombo(resList, w, intervalDays, comboCost);
      renderComboResult(names, resList, comboRes, w);
    });
  }
  function buildCombo(resList, w, intervalDays, costPerSide) {
    var L = resList[0].nav.length;
    var navs = resList.map(function (r) { return r.nav; });
    var ww = w.slice();
    var combo = new Array(L); combo[0] = 1;
    var cps = costPerSide || 0;
    for (var t = 1; t < L; t++) {
      var ri = navs.map(function (nav) { var p0 = nav[t - 1]; return (p0 > 0) ? (nav[t] / p0 - 1) : 0; });
      var cr = 0; for (var k = 0; k < navs.length; k++) cr += ww[k] * ri[k];
      var crNet = cr;
      if (intervalDays > 0 && (t % intervalDays === 0) && cps > 0) {
        var turn = 0; for (var kk = 0; kk < navs.length; kk++) turn += Math.abs(ww[kk] - w[kk]);
        crNet = (1 + cr) * (1 - turn * cps) - 1;   // P1-6：再平衡当日按换手扣减交易成本
      }
      combo[t] = combo[t - 1] * (1 + crNet);
      var denom = 1 + cr;
      if (denom > 0) { ww = ww.map(function (x, k) { return x * (1 + ri[k]) / denom; }); }
      if (intervalDays > 0 && (t % intervalDays === 0)) ww = w.slice();
    }
    return { combo: combo };
  }
  function calcMetricsFromNav(nav) {
    var L = nav.length;
    var total = nav[L - 1] / nav[0] - 1;
    var years = (L - 1) / 252;
    var cagr = (years > 0) ? (Math.pow(nav[L - 1] / nav[0], 1 / years) - 1) : 0;
    var peak = nav[0], mdd = 0;
    for (var i = 1; i < L; i++) { if (nav[i] > peak) peak = nav[i]; var dd = nav[i] / peak - 1; if (dd < mdd) mdd = dd; }
    var s = 0, i2; for (i2 = 1; i2 < L; i2++) s += (nav[i2] / nav[i2 - 1] - 1);
    var mean = s / (L - 1), vr = 0;
    for (var j = 1; j < L; j++) { var d = nav[j] / nav[j - 1] - 1 - mean; vr += d * d; }
    var sd = Math.sqrt(vr / (L - 1)) * Math.sqrt(252);
    var sharpe = (sd > 0) ? (mean * 252 - 0.02) / sd : 0;
    return { total: total, cagr: cagr, mdd: mdd, sharpe: sharpe };
  }
  function pearsonArr(a, b) {
    var n = a.length; if (n < 2) return 0;
    var ma = 0, mb = 0, i; for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    for (var j = 0; j < n; j++) { var x = a[j] - ma, y = b[j] - mb; num += x * y; da += x * x; db += y * y; }
    var den = Math.sqrt(da * db); return den > 0 ? num / den : 0;
  }
  function _pct(x) { return (x * 100).toFixed(2) + "%"; }
  function renderComboResult(names, resList, comboRes, w) {
    $("comboResult").style.display = "";
    var cal = resList[0].calendar;
    var combo = comboRes.combo;
    var met = calcMetricsFromNav(combo);
    var kpi = $("comboKpis"); kpi.innerHTML = "";
    var kpiData = [["组合累计收益", _pct(met.total)], ["组合年化", _pct(met.cagr)], ["最大回撤", _pct(met.mdd)], ["组合夏普", met.sharpe.toFixed(2)]];
    kpiData.forEach(function (kv) {
      var c = document.createElement("div");
      c.style.cssText = "background:#111827;border:1px solid #1E293B;border-radius:8px;padding:10px 12px;text-align:center";
      c.innerHTML = '<div style="font-size:11px;color:#64748B">' + kv[0] + '</div><div style="font-size:17px;color:#38BDF8;font-weight:600;margin-top:2px">' + kv[1] + '</div>';
      kpi.appendChild(c);
    });
    // 净值曲线
    _disposeCombo("comboChart");
    var palette = ["#38BDF8", "#F59E0B", "#34D399", "#A78BFA", "#F472B6", "#FBBF24", "#60A5FA", "#4ADE80"];
    var series = [{ name: "组合", type: "line", showSymbol: false, lineStyle: { width: 3, color: "#38BDF8" }, itemStyle: { color: "#38BDF8" }, data: cal.map(function (t, i) { return [t, +(combo[i]).toFixed(5)]; }) }];
    resList.forEach(function (r, idx) {
      var col = palette[(idx + 1) % palette.length];
      series.push({ name: names[idx], type: "line", showSymbol: false, lineStyle: { width: 1.5, color: col }, itemStyle: { color: col }, data: r.nav.map(function (v, i) { return [cal[i], +v.toFixed(5)]; }) });
    });
    var ch = echarts.init($("comboChart"));
    _comboCharts["comboChart"] = ch;
    ch.setOption({
      backgroundColor: "transparent", tooltip: { trigger: "axis" },
      legend: { textStyle: { color: "#CBD5E1" }, top: 0 },
      grid: { left: 45, right: 20, top: 34, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: cal, axisLabel: { color: "#94A3B8", hideOverlap: true } },
      yAxis: { type: "value", scale: true, axisLabel: { color: "#94A3B8", formatter: function (v) { return v.toFixed(2); } }, splitLine: { lineStyle: { color: "#1E293B" } } },
      series: series
    });
    // 相关矩阵（日收益率相关）
    var rets = resList.map(function (r) {
      var nav = r.nav, out = [];
      for (var q = 1; q < nav.length; q++) if (nav[q - 1] > 0) out.push(nav[q] / nav[q - 1] - 1);
      return out;
    });
    var cells = [];
    for (var a = 0; a < names.length; a++) for (var b = 0; b < names.length; b++) cells.push([b, a, +pearsonArr(rets[a], rets[b]).toFixed(3)]);
    _disposeCombo("comboHeatmap");
    var hm = echarts.init($("comboHeatmap"));
    _comboCharts["comboHeatmap"] = hm;
    hm.setOption({
      backgroundColor: "transparent", tooltip: { position: "top", formatter: function (p) { return names[p.value[0]] + " ↔ " + names[p.value[1]] + "<br>相关系数 " + p.value[2]; } },
      grid: { left: 120, right: 30, top: 30, bottom: 80 },
      xAxis: { type: "category", data: names, axisLabel: { color: "#CBD5E1", rotate: 40 } },
      yAxis: { type: "category", data: names, axisLabel: { color: "#CBD5E1" } },
      visualMap: { min: -1, max: 1, calculable: true, orient: "horizontal", left: "center", bottom: 6, textStyle: { color: "#94A3B8" }, inRange: { color: ["#7F1D1D", "#1E293B", "#14532D"] } },
      series: [{ type: "heatmap", data: cells, label: { show: true, color: "#E2E8F0", fontSize: 11 }, itemStyle: { borderColor: "#0F172A", borderWidth: 1 } }]
    });
    // 目标权重
    _disposeCombo("comboWeight");
    var pie = echarts.init($("comboWeight"));
    // 目标权重：策略名列表放上方，饼图放下方，错开展示
    var lg = $("comboWeightLegend"); lg.innerHTML = "";
    names.forEach(function (nm, i) {
      var it = document.createElement("span");
      it.style.cssText = "display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#E2E8F0";
      it.innerHTML = '<span style="width:10px;height:10px;border-radius:2px;background:' + palette[i % palette.length] + ';flex:0 0 auto"></span>' + nm + ' <span style="color:#94A3B8">' + (w[i] * 100).toFixed(2) + '%</span>';
      lg.appendChild(it);
    });
    _disposeCombo("comboWeight");
    var pie = echarts.init($("comboWeight"));
    _comboCharts["comboWeight"] = pie;
    pie.setOption({
      backgroundColor: "transparent", tooltip: { trigger: "item", formatter: function (p) { return p.name + "<br>权重 " + p.percent + "%"; } },
      series: [{ type: "pie", radius: ["42%", "64%"], center: ["50%", "50%"], avoidLabelOverlap: true, label: { color: "#E2E8F0", formatter: "{d}%", fontSize: 11 }, data: names.map(function (nm, i) { return { name: nm, value: +(w[i] * 100).toFixed(2), itemStyle: { color: palette[i % palette.length] } }; }) }]
    });
  }
  $("comboRun").addEventListener("click", function () { runCombo(); });

  // ---------- 回测参数面板分区折叠（核心默认展开，其余折叠，状态记忆） ----------
  (function () {
    var grps = ["fac", "core", "exe", "mgmt"];
    var H = localStorage.getItem("sf_grp");
    if (H === null) H = "fac"; // 默认只展开因子与选股
    else { var arrH = H.split(",").filter(function (x) { return x !== "exe"; }); H = arrH.join(",") || "fac"; } // ③择时管理默认收起（不记忆展开态）
    var tog = document.getElementById("sfToggle");
    function setTogText() {
      if (!tog) return;
      var allOpen = grps.every(function (g) { return H.indexOf(g) >= 0; });
      tog.textContent = allOpen ? "收起全部" : "展开全部";
    }
    function apply() {
      grps.forEach(function (g) {
        var b = document.getElementById("sfg-" + g);
        if (!b) return;
        var open = H.indexOf(g) >= 0;
        if (open) b.classList.remove("hide"); else b.classList.add("hide");
        var a = document.querySelector('.sfold-h[data-g="' + g + '"] .sf-a');
        if (a) a.textContent = open ? "收起" : "点击展开";
      });
      setTogText();
    }
    apply();
    var hs = document.querySelectorAll(".sfold-h");
    for (var i = 0; i < hs.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var g = btn.getAttribute("data-g");
          var arr = H ? H.split(",") : [];
          var open = arr.indexOf(g) >= 0;
          if (open) arr = arr.filter(function (x) { return x !== g; }); else arr.push(g);
          H = arr.join(",");
          localStorage.setItem("sf_grp", H);
          apply();
        });
      })(hs[i]);
    }
    if (tog) tog.addEventListener("click", function () {
      var allOpen = grps.every(function (g) { return H.indexOf(g) >= 0; });
      H = allOpen ? "" : grps.join(",");
      localStorage.setItem("sf_grp", H);
      apply();
    });
    // setFoldByMode 已提升到 js_ui 顶层（window.setFoldByMode），此处仅初始化调用
    setFoldByMode();
  })();
  // 行情数据懒加载：未进入第二步时（D=null）也可按需解析（策略详情/应用等）
  // 数据块为 gzip(base64) 内联（体积约减 63%），首屏不解析、不执行，进入第二步才解压
  var _dataWait = [], _dataLoading = false;
  function ensureData(cb) {
    if (D) { cb(); return; }
    if (_dataLoading) { _dataWait.push(cb); return; }
    _dataLoading = true;
    var rawEl = document.getElementById("wufuDataGz");
    if (!rawEl) { _dataLoading = false; showPageErr("缺少行情数据块"); return; }
    try {
      var b64 = (rawEl.textContent || "").replace(/\s+/g, "");
      var bin = atob(b64);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      if (typeof DecompressionStream === "undefined") {
        _dataLoading = false;
        showPageErr("当前浏览器不支持 gzip 解压，请使用新版 Chrome / Edge / Safari / Firefox");
        return;
      }
      var ds = new DecompressionStream("gzip");
      var stream = new Blob([u8]).stream().pipeThrough(ds);
      new Response(stream).text().then(function (t) {
        try {
          D = JSON.parse(t);
          try { globalThis.D = D; } catch (e) { }
          if (D && D.pool) POOL = D.pool;   // 统一标的池：权威源=数据块，解析后全局池同步
          _dataLoading = false;          // 复位解析锁：后续 ensureData 直接走 D 就绪分支（原实现漏复位导致二次调用排队卡死）
          var q = _dataWait; _dataWait = [];
          cb();
          q.forEach(function (f) { f(); });
        } catch (e) { showPageErr("行情数据解析失败：" + ((e && e.message) || e)); }
      }).catch(function (e) { _dataLoading = false; showPageErr("行情数据解压失败：" + ((e && e.message) || e)); });
    } catch (e) { _dataLoading = false; showPageErr(String((e && e.message) || e)); }
  }

  // ---------- 幸存者偏差披露：回测起点年份实际可交易标的数 ----------
  function updateSurvivorTip() {
    var el = $("survivorTip");
    if (!el || !D || !D.calendar) return;
    var y = (startDate || "").slice(0, 4);
    if (!y) return;
    var di = -1;
    for (var i = 0; i < D.calendar.length; i++) { if (D.calendar[i] >= startDate) { di = i; break; } }
    if (di < 0) { el.style.display = "none"; return; }
    var base = D.calendar[di];
    var total = POOL.length || (D.pool ? D.pool.length : 0);
    // P1-4：与引擎真实可得池同口径——按 series close>0 首日判定（WUFU_FIRSTDATE 为旧披露口径，偏保守且与数据不一致）
    var n = 0;
    POOL.forEach(function (p) {
      var sv = D.series[p.code];
      if (!sv || !sv.close) return;
      var fdi = -1;
      for (var fk = 0; fk < sv.close.length; fk++) { if (sv.close[fk] > 0) { fdi = fk; break; } }
      if (fdi >= 0 && D.calendar[fdi] <= base) n++;
    });
    var pct = Math.round(n / total * 100);
    if (n < total) {
      el.innerHTML = "⚠️ 幸存者偏差提示：" + y + " 年回测起点时，当前池实际可交易 <b>" + n + "/" + total +
        "</b> 只（" + pct + "%）——早期候选池远小于今日（且已清盘标的不在池内），早期收益存在\u201c事后幸存池\u201d高估，请谨慎外推。";
      el.style.display = "";
    } else {
      el.innerHTML = "✅ 回测起点时全池 " + total + " 只标的均可交易，无幸存者偏差。";
      el.style.display = "";
    }
  }

  // ---------- 参数稳健性检查：排名因子窗口±5日扰动回测（异步分步，避免手机端冻结） ----------
  function robustnessCheck() {
    var box = $("robBox"), state = $("robState");
    if (!D || !engine) { if (state) state.textContent = "请先进入回测"; return; }
    var params = getParams();
    var facs = params.factors || [];
    var rankFacs = facs.filter(function (f) { return (f.usage || "rank") !== "filter"; });
    if (!rankFacs.length) rankFacs = facs;
    if (!rankFacs.length) { if (box) { box.style.display = ""; box.innerHTML = "当前没有排名因子，无法进行稳健性检查。"; } return; }
    // 先构造扰动任务清单
    var tasks = [];
    rankFacs.forEach(function (f, i) {
      [5, -5].forEach(function (d) {
        var w = f.window + d;
        if (w < 3 || w > 250) return;
        var pf = JSON.parse(JSON.stringify(params));
        pf.factors = facs.map(function (x, j) {
          var o = JSON.parse(JSON.stringify(x));
          if (j === i) o.window = w;
          return o;
        });
        tasks.push({ label: f.kind + " 窗口 " + f.window + "→" + w, pf: pf });
      });
    });
    if (!tasks.length) { if (box) { box.style.display = ""; box.innerHTML = "无可用扰动变体（窗口边界）。"; } if (state) state.textContent = ""; return; }
    var base = null, variants = [], idx = 0;
    function finish() {
      var mn = Infinity, mx = -Infinity;
      variants.forEach(function (v) { if (v.total < mn) mn = v.total; if (v.total > mx) mx = v.total; });
      var span = mx - mn;
      var levelCls = span > 0.5 ? "#F87171" : (span > 0.2 ? "#F59E0B" : "#34D399");
      var levelMsg = span > 0.5
        ? "⚠️ 参数高度敏感：窗口±5日，收益在 <b>" + FMT.pct(mn, 1) + " ~ " + FMT.pct(mx, 1) + "</b> 之间剧烈波动。当前回测结果对参数选择非常敏感，大概率包含对历史噪声的拟合，不宜直接外推实盘。"
        : (span > 0.2
          ? "⚠️ 参数较敏感：窗口±5日收益区间 <b>" + FMT.pct(mn, 1) + " ~ " + FMT.pct(mx, 1) + "</b>。建议在多个窗口/分段上复核后再使用。"
          : "✅ 参数相对稳健：窗口±5日收益区间 <b>" + FMT.pct(mn, 1) + " ~ " + FMT.pct(mx, 1) + "</b>，结果对窗口微调不敏感。");
      var rows = variants.map(function (v) {
        return "<div style=\"display:flex;justify-content:space-between;gap:12px;padding:1px 0\"><span>" + v.label + "</span><b style=\"color:" +
          (v.total < mn + span * 0.25 ? "#F87171" : (v.total > mx - span * 0.25 ? "#34D399" : "#CBD5E1")) + "\">" + FMT.pct(v.total, 1) + "</b></div>";
      }).join("");
      box.style.display = "";
      box.innerHTML = "<div style=\"font-weight:700;margin-bottom:4px\">参数稳健性检查（原收益 " + FMT.pct(base, 1) + "，扰动 " + variants.length + " 组）</div>" +
        "<div style=\"color:" + levelCls + ";font-weight:700;margin-bottom:6px\">" + levelMsg + "</div>" + rows;
      if (state) state.textContent = "";
    }
    function step() {
      try {
        if (!base) { base = engine.backtest(D, JSON.parse(JSON.stringify(params))).metrics.total_return; }
      } catch (e) { if (state) state.textContent = ""; showNotice("稳健性检查失败：" + String((e && e.message) || e)); return; }
      if (idx >= tasks.length) { finish(); return; }
      if (state) state.textContent = "检查中（" + (idx + 1) + "/" + tasks.length + "）…";
      var t = tasks[idx++];
      var r;
      try { r = engine.backtest(D, t.pf); }
      catch (e) { if (state) state.textContent = ""; showNotice("稳健性检查失败：" + String((e && e.message) || e)); return; }
      variants.push({ label: t.label, total: r.metrics.total_return });
      setTimeout(step, 0);   // 让出主线程，保持界面响应
    }
    if (state) state.textContent = "检查中（0/" + tasks.length + "）…";
    setTimeout(step, 0);
  }

  function boot() {
    renderStrategyList();
    renderMfLib();
    renderMfList();
    renderFltList();
    buildChips();
    buildIdxChips();
    updatePoolCount();
    updateSurvivorTip();
    showView(hashView());
    setTimeout(run, 60);          // 显示后执行默认回测
  }

  // 静态按钮事件绑定：页面加载即完成，不依赖 boot()
  //（修复「应用已保存策略」等入口跳过 boot() 导致 robBtn/runBtn 无反应）
  (function bindStaticButtons() {
    var rb = $("robBtn");
    if (rb) rb.onclick = robustnessCheck;
    var rn = $("runBtn");
    if (rn) rn.addEventListener("click", run);
  })();

  // ===== 功能1/2/3：大盘择时·独立开关 / 指数数据源切换 / 自定义基准 =====
  function ensureRDIDX(cb) {
    if (RDIDX) { if (cb) cb(); return; }
    if (RDIDXBusy) { setTimeout(function () { ensureRDIDX(cb); }, 200); return; }
    RDIDXBusy = true;
    var blk = document.getElementById("wufuIdxGz");
    if (!blk || !window.DecompressionStream) { RDIDXBusy = false; if (cb) cb(); return; }
    var b64 = blk.textContent.replace(/\s+/g, "");
    try {
      var bin = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      var rs = new Response(new Blob([bin])).body.pipeThrough(new DecompressionStream("gzip"));
      new Response(rs).arrayBuffer().then(function (ab) {
        RDIDX = JSON.parse(new TextDecoder("utf-8").decode(ab));
        try { window.RDIDX = RDIDX; } catch (e) { }
        RDIDXBusy = false;
        fillIdxSelects();
        if (cb) cb();
      }).catch(function () { RDIDXBusy = false; if (cb) cb(); });
    } catch (e) { RDIDXBusy = false; if (cb) cb(); }
  }
  function fillIdxSelects() {
    if (!RDIDX || !RDIDX.pool) return;
    [["benchSel", benchSelVal()], ["stSmallSel", stSmallIdx], ["stLargeSel", stLargeIdx]].forEach(function (pair) {
      var sel = $(pair[0]); if (!sel) return;
      var cur = pair[1];
      sel.innerHTML = "";
      RDIDX.pool.forEach(function (p) {
        var op = document.createElement("option");
        op.value = p.code; op.textContent = p.name + " " + p.code;
        sel.appendChild(op);
      });
      if (cur) sel.value = cur;
      if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
    });
  }
  // 事件绑定（新控件）
  (function bindRound4() {
    var mms = $("mmModeSel"); if (mms) mms.addEventListener("change", scheduleRun);
    var msr = $("mmSearchIn"); if (msr) msr.addEventListener("input", function () { mmSearch = this.value.trim().toLowerCase(); renderMmChips(); });
    var hs = $("mmHedgeSearchIn"); if (hs) hs.addEventListener("input", function () { mmHedgeSearch = this.value.trim().toLowerCase(); renderHedgeChips(); });
    var sts = $("stOn"); if (sts) sts.addEventListener("change", function () { stOn = this.checked; scheduleRun(); });
    var sss = $("stSmallSel"); if (sss) sss.addEventListener("change", function () { stSmallIdx = this.value; scheduleRun(); });
    var sls = $("stLargeSel"); if (sls) sls.addEventListener("change", function () { stLargeIdx = this.value; scheduleRun(); });
    var swi = $("stWinIn"); if (swi) swi.addEventListener("input", function () { stWin = +this.value || 20; $("stV").textContent = stWin; scheduleRun(); });
    var bsel = $("benchSel"); if (bsel) bsel.addEventListener("change", function () { scheduleRun(); });
    // wufuIdxGz 数据块位于本脚本块之后，需等 DOM 完整后再解析；重试直至成功（成功后自动填充基准/择时指数下拉）
    (function tryIdxLoad() {
      ensureRDIDX(function () {
        if (!RDIDX) setTimeout(tryIdxLoad, 1500);
        else { fillIdxSelects(); if (D) { renderPool(); renderIdxChips($("mmIdxChips"), mmIdxSel, "timing"); if (checkedCodes().length) scheduleRun(); } }
      });
    })();
  })();

  // 暴露给参数调优模块（js_tune.js）的只读/复用接口
  window.KIND_INFO = KIND_INFO;
  window.WufuUI = {
    getParams: getParams,
    applyParams: applyParams,
    run: run,
    scheduleRun: scheduleRun,
    getData: function () { return D; },
    ensureData: ensureData,
    renderKpis: renderKpis
  };
})();
