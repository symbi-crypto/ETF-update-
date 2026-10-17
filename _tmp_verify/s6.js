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

  var COLOR = { str: "#4FC3F7", bench: "#9FB0C3", ew: "#A78BFA", dd: "#F87171", weak: "#F59E0B" };
  var FMT = { pct: function (v, d) { return (v * 100).toFixed(d === undefined ? 2 : d) + "%"; } };

  var charts = {};

  // ---------- 标的池渲染（第一步：仅用 POOL 元信息，无需行情数据） ----------
  var poolChecked = {}, onlyRot = {}, rebalanceChecked = {}, dcaChecked = {};   // 轮动/再平衡/定投视图各自独立勾选状态
  POOL.forEach(function (p) { poolChecked[p.code] = false; rebalanceChecked[p.code] = false; dcaChecked[p.code] = false; onlyRot[p.code] = false; });
  var activeView = "rotation";             // rotation | rebalance | dca（视图路由）
  var rebW = {};                           // 再平衡模式：code -> 用户手填比例（%），未手填用等权
  function checkedCodes() { var cm = activeView === "rebalance" ? rebalanceChecked : (activeView === "dca" ? dcaChecked : poolChecked); return POOL.filter(function (p) { return cm[p.code]; }); }
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
    // 两行结构：第一行「 | 权重合计 X%」（nowrap），余量/超限提示放第二行（整行 nowrap，不折词；权重合计=100% 时无第二行）
    el.innerHTML = "<span style='white-space:nowrap'> | 权重合计 " + (Math.round(s * 100) / 100) + "%</span>" +
      (Math.abs(s - 100) > 0.01 ? "<br><span style='white-space:nowrap;color:#9FB0C3'>" + (s < 100 ? "（余 " + (100 - s).toFixed(1) + "% 现金→货币ETF）" : "（超 100%，请调整）") + "</span>" : "");
  }
  function applyModeUI() {
    // 视图拆分后：轮动/再平衡/定投面板已物理分离，此处仅处理共享块内按视图切换的显隐
    var isReb = activeView === "rebalance";
    var isDca = activeView === "dca";
    var noRot = isReb || isDca;   // 轮动专属（稳健性/IC/择时）在再平衡与定投下均隐藏
    var robw = $("robwrap"); if (robw) robw.style.display = noRot ? "none" : "";
    if (noRot) { var rb = $("robBox"); if (rb) rb.style.display = "none"; }
    var cic = $("cICCard"); if (cic) cic.style.display = noRot ? "none" : "";
    // ③择时管理（市场状态风控）不适用再平衡/定投模式：整块隐藏，切回轮动恢复
    var exeB = $("sfg-exe"); if (exeB) exeB.style.display = noRot ? "none" : "";
    var rwm = $("rebWeightMode") ? $("rebWeightMode").value : "fixed";
    var rst = $("rebStyleSel") ? $("rebStyleSel").value : "equal";
    var dyn = isReb && rwm === "fixed" && rst === "custom";
    // 二级「比例方式」仅「比例」模式显示；轮动视图隐藏调仓周期模块（轮动引擎无周期概念）
    var rsb = $("rebStyleBox"); if (rsb) rsb.style.display = (isReb && rwm === "fixed") ? "" : "none";
    var rsp = $("rebSetPsec"); if (rsp) rsp.style.display = isReb ? "" : "none";
    // 比例输入框仅「比例-自定义」模式显示；等比例/逆波动率/风险平价均隐藏（等比例等权、动态模式不读手填）
    if (poolBox) Array.prototype.forEach.call(poolBox.querySelectorAll(".wlab"), function (el) { el.style.display = (dyn && !isDca) ? "flex" : "none"; });
    if (poolBox) Array.prototype.forEach.call(poolBox.querySelectorAll(".rot"), function (el) { el.style.display = noRot ? "none" : ""; });
    // 权重合计/余量提示仅非等比例显示（等比例等权，显示"权重合计 0%"易误导）；inv_vol/risk_parity 权重合计按比例输入框和（隐藏时为 0%，引擎按动态权重计算）
    var lbr = $("rebLookbackRow"); if (lbr) lbr.style.display = (isReb && rwm !== "fixed") ? "" : "none";
    // 权重合计/余量提示仅「比例-自定义」显示（等比例等权、动态模式权重为计算所得，显示手填合计无意义）
    var ws = $("wSum"); if (ws) ws.style.display = (isReb && rwm === "fixed" && rst === "custom") ? "" : "none";
    if (isReb && !dyn) { syncWIn(); updateWSum(); }
    // 定投模式：隐藏 回撤/年度/月度 图表卡（整卡，含标题）与基准选择（定投用专属曲线与对照），显示止盈阈值行
    ["cDD", "cYear", "cMonth"].forEach(function (cid) { var ce = $(cid); if (ce && ce.closest(".card")) ce.closest(".card").style.display = isDca ? "none" : ""; });
    var bsel = $("benchSel"); if (bsel) bsel.parentElement.style.display = isDca ? "none" : "";
    var dtr = $("dcaTpRow"); if (dtr) dtr.style.display = (isDca && $("dcaTpOn") && $("dcaTpOn").checked) ? "flex" : "none";
  }

  var poolBox = $("poolBox");
  function renderPool() {
  var cm = activeView === "rebalance" ? rebalanceChecked : (activeView === "dca" ? dcaChecked : poolChecked);
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
      return (p.name + " " + (typeof idxNameOf === "function" ? idxNameOf(p.code) : "")).toLowerCase().indexOf(kw) >= 0 || p.code.toLowerCase().indexOf(kw) >= 0;
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
      var noRotCol = isRebNow || activeView === "dca";   // 仅轮动列为轮动专属：再平衡/定投视图不渲染
      var dynNow = isRebNow && $("rebWeightMode") && $("rebWeightMode").value === "fixed" && $("rebStyleSel") && $("rebStyleSel").value === "custom";
      l.innerHTML = '<input type="checkbox" class="pick" data-c="' + p.code + '">' +
        '<span class="corr-nm">' + p.name + "</span><span class='corr-cd'>" + p.code + "</span>" +
        "<label class='rot' style='display:" + (noRotCol ? "none" : "") + "'><input type='checkbox' class='rotc'>仅轮动</label>" +
        "<label class='wlab' style='display:" + (dynNow ? "flex" : "none") + "'>比例<input type='number' class='wIn' data-code='" + p.code + "' min='0' max='100' step='0.1' style='width:52px;font-size:12px;padding:1px 3px;border:1px solid #3E4E63;border-radius:3px;text-align:right'>%</label>";
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
      var cmv = activeView === "rebalance" ? rebalanceChecked : (activeView === "dca" ? dcaChecked : poolChecked);
      POOL.forEach(function (p) { cmv[p.code] = true; });
      renderPool(); updatePoolCount();
      if (activeView === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    $("poolNone").addEventListener("click", function () {
      var cmv = activeView === "rebalance" ? rebalanceChecked : (activeView === "dca" ? dcaChecked : poolChecked);
      POOL.forEach(function (p) { cmv[p.code] = false; });
      renderPool(); updatePoolCount();
      if (activeView === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    applyModeUI();   // poolBox 重建后重应用视图显隐（.rot 隐藏 / .wlab 比例输入显示）
  }

  function updatePoolCount() {
    var n = 0;
    // 按当前视图计勾选数：再平衡读 rebalanceChecked，定投读 dcaChecked，轮动读 poolChecked
    var cmv = activeView === "rebalance" ? rebalanceChecked : (activeView === "dca" ? dcaChecked : poolChecked);
    POOL.forEach(function (p) { if (cmv[p.code]) n++; });
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
      var td1 = document.createElement("td"); td1.style.cssText = "padding:7px 8px;border-bottom:1px solid #243244;font-weight:600;color:#60A5FA"; td1.textContent = it.label;
      var td2 = document.createElement("td"); td2.style.cssText = "padding:7px 8px;border-bottom:1px solid #243244;color:#D8E2EF"; td2.textContent = it.mean;
      var td3 = document.createElement("td"); td3.style.cssText = "padding:7px 8px;border-bottom:1px solid #243244;color:#9FB0C3;font-family:ui-monospace,Consolas,monospace"; td3.textContent = it.formula;
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
      tag.style.cssText = "flex:0 0 auto;font-size:10px;color:#7C8DA1";
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
      inp.style.cssText = "flex:1;min-width:0;width:34px;font-size:12px;padding:2px 2px;border:1px solid #3E4E63;border-radius:4px";
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
    hint.style.cssText = "font-size:12px;color:#9FB0C3;padding:6px 2px;line-height:1.5";
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
    uSel.style.cssText = "flex:0 0 66px;font-size:11.5px;padding:2px 4px;border:1px solid #3E4E63;border-radius:4px;color:#D8E2EF;background:#202E3F;appearance:none;-webkit-appearance:none;text-align:center";
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
    hint.style.cssText = "font-size:12px;color:#9FB0C3;padding:6px 2px";
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
      ft2.style.cssText = "font-size:11px;color:#9FB0C3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      ft2.textContent = factorFormulaText(f);
      ft2.title = f.name + " = " + factorFormulaText(f);
      wg.appendChild(ft2);
    } else wg = windowGroupHtml(ki, f);
    var wIn = document.createElement("input");
    wIn.type = "number"; wIn.min = 0; wIn.max = 1; wIn.step = 0.05; wIn.value = f.weight !== undefined ? f.weight : 0.1;
    wIn.style.cssText = "flex:0 0 46px;font-size:12px;padding:2px 2px;border:1px solid #3E4E63;border-radius:4px";
    wIn.title = "排名权重";
    wIn.addEventListener("input", function () { f.weight = +this.value; renderMfList(); renderMfLib(); scheduleRun(); });
    var dSel = document.createElement("select");
    dSel.style.cssText = "flex:0 0 40px;font-size:11.5px;padding:2px 1px;border:1px solid #3E4E63;border-radius:4px;color:#D8E2EF;background:#202E3F";
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
    hint.style.cssText = "font-size:12px;color:#9FB0C3;padding:6px 2px";
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
      ft3.style.cssText = "font-size:11px;color:#9FB0C3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      ft3.textContent = factorFormulaText(f);
      ft3.title = f.name + " = " + factorFormulaText(f);
      wg.appendChild(ft3);
    } else wg = windowGroupHtml(ki, f);
    var opSel = document.createElement("select");
    opSel.style.cssText = "flex:0 0 40px;font-size:11.5px;padding:2px 1px;border:1px solid #3E4E63;border-radius:4px;color:#D8E2EF;background:#202E3F";
    opSel.innerHTML = '<option value="gte">\u2265</option><option value="lte">\u2264</option>';
    opSel.value = f.op || "gte";
    opSel.addEventListener("change", function () { f.op = this.value; scheduleRun(); });
    var thIn = document.createElement("input");
    thIn.type = "number"; thIn.min = 0; thIn.max = 1000; thIn.step = 1;
    thIn.value = Math.round((f.threshold !== undefined ? f.threshold : 0) * 100);
    thIn.style.cssText = "flex:0 0 46px;font-size:12px;padding:2px 2px;border:1px solid #3E4E63;border-radius:4px";
    thIn.title = "筛选阈值（%）";
    thIn.addEventListener("input", function () { f.threshold = Math.max(0, Math.min(1000, +this.value || 0)) / 100; scheduleRun(); });
    var pct = document.createElement("span");
    pct.style.cssText = "flex:0 0 14px;font-size:12px;color:#7C8DA1"; pct.textContent = "%";
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
  var opSel = '<select style="flex:0 0 34px;font-size:11.5px;padding:2px 1px;border:1px solid #3E4E63;border-radius:4px;color:#D8E2EF;background:#202E3F" title="与上一项的运算">' +
    CF_OPS.map(function (o) { return '<option value="' + o[0] + '">' + o[0] + '</option>'; }).join('') + '</select>';
  var wg = '';
  var nw = ki.nwin || 1;
  for (var j = 0; j < nw; j++) {
    wg += '<input type="number" min="' + (j === 0 ? ki.wMin : ki["wMin" + (j + 1)]) + '" max="' + (j === 0 ? ki.wMax : ki["wMax" + (j + 1)]) + '" step="' + (j === 0 ? ki.wStep : ki["wStep" + (j + 1)]) + '" value="' +
      (j === 0 ? (p.window || ki.def) : j === 1 ? (p.window2 || ki.def2 || 0) : (p.window3 || ki.def3 || 0)) + '" style="flex:1;min-width:0;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px" title="' + ((ki.winTitles && ki.winTitles[j]) || "") + '">';
  }
  return '<div class="cfrow" style="display:flex;align-items:center;gap:3px;margin:3px 0">' +
    (idx === 0 ? '<span style="flex:0 0 34px;font-size:12px;color:#9FB0C3;text-align:center">=</span>' : opSel) +
    '<select style="flex:1.2;min-width:0;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px">' +
    Object.keys(KIND_INFO).map(function (k) { return '<option value="' + k + '">' + KIND_INFO[k].label + '</option>'; }).join('') +
    '</select>' + wg +
    '<input type="number" step="0.1" value="' + (p.coef || 1) + '" style="flex:0 0 46px;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px" title="系数">' +
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
      hd.style.cssText = "font-size:12px;color:#9FB0C3;cursor:pointer;padding:4px 2px 2px;border-bottom:1px dashed #3E4E63;user-select:none;display:flex;gap:6px;align-items:center;margin-top:4px";
      var caret = document.createElement("span");
      caret.textContent = collapsed ? "▶" : "▼";
      caret.style.cssText = "font-size:9px;color:#7C8DA1";
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
          b.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #3E4E63;border-radius:12px;background:" + (mmIdxSel[it.code] ? "#3B82F6" : "#243244") + ";color:#F1F5F9";
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
      hd.style.cssText = "font-size:12px;color:#9FB0C3;cursor:pointer;padding:4px 2px 2px;border-bottom:1px dashed #3E4E63;user-select:none;display:flex;gap:6px;align-items:center;margin-top:4px";
      var caret = document.createElement("span");
      caret.textContent = collapsed ? "▶" : "▼";
      caret.style.cssText = "font-size:9px;color:#7C8DA1";
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
          b.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #3E4E63;border-radius:12px;background:" + (mmHedgeSel[it.code] ? "#10B981" : "#243244") + ";color:#F1F5F9";
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
  if ($("rebStyleSel")) $("rebStyleSel").addEventListener("change", function () { applyModeUI(); scheduleRun(); });

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
  // 定投止盈开关联动：勾选才显示阈值输入
  var dtpOn = $("dcaTpOn");
  if (dtpOn) dtpOn.addEventListener("change", function () {
    var r = $("dcaTpRow"); if (r) r.style.display = this.checked ? "flex" : "none";
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
    kSel.style.cssText = "flex:1;min-width:0;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px";
    Object.keys(KIND_INFO).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = KIND_INFO[k].label;
      kSel.appendChild(o);
    });
    var wIn = document.createElement("input");
    wIn.type = "number"; wIn.min = 1; wIn.max = 250; wIn.value = 20;
    wIn.style.cssText = "flex:0 0 52px;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px";
    wIn.title = "因子窗口";
    var opSel = document.createElement("select");
    opSel.style.cssText = "flex:0 0 46px;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px";
    opSel.innerHTML = '<option value="gte">\u2265</option><option value="lte">\u2264</option>';
    var thIn = document.createElement("input");
    thIn.type = "number"; thIn.step = 1; thIn.value = 0;
    thIn.style.cssText = "flex:0 0 56px;font-size:12px;padding:2px;border:1px solid #3E4E63;border-radius:4px";
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
        var wm = $("rebWeightMode") ? $("rebWeightMode").value : "fixed";
        var rst = $("rebStyleSel") ? $("rebStyleSel").value : "equal";
        checkedCodes().forEach(function (p) {
          if (wm === "fixed" && rst === "equal") { o[p.code] = n > 0 ? 1 / n : 0; }
          else { o[p.code] = Math.round(wFor(p.code, n) * 100) / 10000; }
        });
        // 自定义比例手填全 0 / 无比例数据：等权兜底
        if (wm === "fixed" && rst === "custom" && n > 0) {
          var anyW = false;
          for (var wk in o) if (o[wk] > 0) { anyW = true; break; }
          if (!anyW) checkedCodes().forEach(function (p) { o[p.code] = 1 / n; });
        }
        return o;
      })(),
      reb_codes: checkedCodes().map(function (p) { return p.code; }),
      reb_weight_mode: $("rebWeightMode") ? $("rebWeightMode").value : "fixed",
      reb_lookback: Math.max(5, Math.min(250, +($("rebLookbackIn") ? $("rebLookbackIn").value : 20) || 20)),
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
      fallback_when_no_signal: "cash",
      reb_style: $("rebStyleSel") ? $("rebStyleSel").value : "equal",
      reb_dev_pct: +($("rebDevIn") ? $("rebDevIn").value : 10) || 0,
      reb_period_on: !$("rebPeriodOn") || $("rebPeriodOn").checked,
      reb_band_on: !$("rebBandOn") || $("rebBandOn").checked,
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
    Object.keys(m).filter(function (k) { return !(m[k] && m[k].type === "grid"); }).forEach(function (k) {
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
    if ($("rebWeightMode")) {
      // 旧策略兼容：上轮 equal/custom（比例模式拆分前的字段）→ 映射回 fixed + reb_style
      var rwmOld = p.reb_weight_mode || "fixed";
      if (rwmOld === "equal" || rwmOld === "custom") {
        $("rebWeightMode").value = "fixed";
        if ($("rebStyleSel")) $("rebStyleSel").value = rwmOld;
      } else {
        $("rebWeightMode").value = rwmOld;
        if ($("rebStyleSel")) $("rebStyleSel").value = p.reb_style || "equal";
      }
      if ($("rebLookbackIn")) $("rebLookbackIn").value = p.reb_lookback || 20;
    }
    if ($("rebDevIn")) $("rebDevIn").value = +(p.reb_dev_pct) || 10;
    if ($("rebPeriodOn")) $("rebPeriodOn").checked = p.reb_period_on !== false;
    if ($("rebBandOn")) $("rebBandOn").checked = p.reb_band_on !== false;
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
  // ---------- 保存策略重名询问（轮动/再平衡/网格统一） ----------
  var dupPending = null;
  function showDupModal(name, doSave) {
    dupPending = { name: name, doSave: doSave };
    if (!window.__dupBound) {
      var oc = $("dupModalClose"); if (oc) oc.onclick = hideDupModal;
      var c = $("dupCancel"); if (c) c.onclick = hideDupModal;
      var ov = $("dupOverwrite"); if (ov) ov.onclick = function () { var d = dupPending; hideDupModal(); if (d && d.doSave) d.doSave(d.name); };
      var nw = $("dupNew"); if (nw) nw.onclick = function () { var d = dupPending; hideDupModal(); if (d && d.doSave) d.doSave(nextDupName(d.name)); };
      window.__dupBound = true;
    }
    var n = $("dupName"); if (n) n.textContent = name;
    var m = $("dupModal"); if (m) m.style.display = "block";
  }
  function hideDupModal() {
    dupPending = null;
    var m = $("dupModal"); if (m) m.style.display = "none";
  }
  function nextDupName(name) {
    var m = loadStored() || {};
    var base = name, k = 2;
    while (m[base + " (" + k + ")"]) k++;
    return base + " (" + k + ")";
  }
  function askOverwriteDup(name, doSave) {
    var m = loadStored();
    if (!m || !m[name]) { doSave(name); return; }
    showDupModal(name, doSave);
  }
  $("saveSt").addEventListener("click", function () {
    var name = $("stName").value.trim();
    if (!name) { showNotice("请先填写策略名"); return; }
    askOverwriteDup(name, function (n) {
      try {
        var m = loadStored();
        var p = getParams();
        p._saved_at = new Date().toISOString();
        p._warm_start = p.start_date;   // 固化预热起点 = 保存那一刻的起始日期（详情页改起始日期不影响预热段）
        m[n] = p;
        storeAll(m); refreshStList(); renderStrategyList();
        showNotice("策略已保存：" + n + "（本地存储按链接CDN域隔离，换链接/换设备请用「导出全部/导入全部」迁移）");
      } catch (e) {
        showNotice("保存失败：" + e.message);
      }
    });
  });
  $("loadSt").addEventListener("click", function () {
    var name = $("stList").value; if (!name) return;
    var m = loadStored();
    if (!m[name]) return;
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
    if (activeView === "dca") { runDCA(); return; }
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

  // ---------- 定投（DCA）：现金流引擎 + XIRR + 一次性买入对照 ----------
  function getISOWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }
  // XIRR：对现金流序列(日期 ms, 带符号金额)用二分法求年化 r，使 NPV=0
  function xirr(cfs, dts) {
    if (!cfs || cfs.length < 2) return null;
    var t0 = dts[0], MSPY = 365.25 * 86400000;
    function npv(r) {
      var s = 0, i;
      for (i = 0; i < cfs.length; i++) {
        if (!cfs[i]) continue;
        var y = (dts[i] - t0) / MSPY;
        s += cfs[i] / Math.pow(1 + r, y);
      }
      return s;
    }
    var hasNeg = false, hasPos = false, k;
    for (k = 0; k < cfs.length; k++) { if (cfs[k] < 0) hasNeg = true; else if (cfs[k] > 0) hasPos = true; }
    if (!hasNeg || !hasPos) return null;
    var lo = -0.9, hi = 5, flo = npv(lo), fhi = npv(hi), g = 0;
    while (((flo > 0) === (fhi > 0)) && g < 80) {
      if (fhi > 0) { hi = hi * 1.5 + 1; fhi = npv(hi); }
      else { lo = lo + (lo + 1) / 2; flo = npv(lo); }
      g++;
    }
    if (((flo > 0) === (fhi > 0))) return null;
    for (var it = 0; it < 200; it++) {
      var mid = (lo + hi) / 2, fm = npv(mid);
      if (Math.abs(fm) < 1e-10) return mid;
      if ((flo > 0) === (fm > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function runDCA() {
    if (!D || !D.calendar) { ensureData(function () { runDCA(); }); return; }
    var sel = checkedCodes();
    if (!sel.length) { showNotice("请至少勾选 1 只定投标的"); return; }
    var codes = sel.map(function (p) { return p.code; });
    var freq = $("dcaFreqSel").value;
    var amount = Math.max(1, +$("dcaAmountIn").value || 1000);
    var sd = $("dcaStartSel").value, ed = $("dcaEndSel").value || D.calendar[D.calendar.length - 1];
    var tpOn = $("dcaTpOn").checked;
    var tpPct = Math.max(1, (+$("dcaTpPctIn").value || 20)) / 100;
    var comm = (+$("dcaCmIn").value || 0) / 10000;
    var slip = (+$("dcaSlIn").value || 0) / 10000;
    var minComm = (+$("dcaMinCmIn").value || 0);
    if (!sd) { showNotice("请选择定投起始日期"); return; }
    var cal = D.calendar, n = cal.length;
    var si = 0; while (si < n && cal[si] < sd) si++;
    var ei = n - 1; while (ei >= 0 && cal[ei] > ed) ei--;
    if (si >= ei) { showNotice("定投区间无效（起始晚于结束或超出数据范围）"); return; }
    // 至少一只标的在区间内有行情
    var anyData = codes.some(function (c) { var s = D.series[c]; return s && s.close && s.close[si] > 0; });
    if (!anyData) { showNotice("所选标的在起始日附近尚无行情数据，请调整起始日期"); return; }

    // 生成定投日：按频率取每个周期桶的首个交易日
    var injSet = {}, injIdx = [], lastKey = null;
    for (var i = si; i <= ei; i++) {
      var d = cal[i], key;
      if (freq === "daily") key = "d" + i;
      else if (freq === "weekly") { var dt = new Date(d + "T00:00:00+08:00"); key = "w" + dt.getUTCFullYear() + "-" + getISOWeek(dt); }
      else if (freq === "monthly") key = "m" + d.slice(0, 7);
      else if (freq === "quarterly") key = "q" + d.slice(0, 4) + "-" + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
      else key = "y" + d.slice(0, 4);
      if (key !== lastKey) { injSet[i] = true; injIdx.push(i); lastKey = key; }
    }

    // 模拟
    var shares = {}, cost = {}; codes.forEach(function (c) { shares[c] = 0; cost[c] = 0; });
    var cash = 0, cum = 0;
    var buys = [], tps = [];
    var cfs = [], cfd = [];
    var pv = new Array(n).fill(0), cumInv = new Array(n).fill(0), lumpArr = new Array(n).fill(0);
    var firstBuyIdx = injIdx[0];
    var t0state = Date.now();
    for (var i = si; i <= ei; i++) {
      if (injSet[i]) {
        cash += amount; cum += amount;
        cfs.push(-amount); cfd.push(ts(cal[i]));
        var alloc = amount / codes.length;
        codes.forEach(function (c) {
          var s = D.series[c]; if (!s || !s.close || !s.close[i] || s.close[i] <= 0) return;
          var px = s.close[i] * (1 + slip);
          var sh = alloc / px;
          var fee = Math.max(minComm, alloc * comm);
          cash -= (alloc + fee);   // 部署本金+佣金：现金转为持仓（勿重复计入现金）
          shares[c] += sh; cost[c] += alloc + fee;
          buys.push({ date: cal[i], code: c, amount: alloc, price: s.close[i], shares: sh, fee: fee });
        });
      }
      // 收盘后逐标的止盈检查
      if (tpOn) {
        codes.forEach(function (c) {
          if (shares[c] <= 0) return;
          var s = D.series[c]; if (!s || !s.close || !s.close[i] || s.close[i] <= 0) return;
          var mv = shares[c] * s.close[i];
          if (cost[c] > 0 && (mv - cost[c]) / cost[c] >= tpPct) {
            var spx = s.close[i] * (1 - slip);
            var gross = shares[c] * spx;
            var fee = Math.max(minComm, gross * comm);
            var net = gross - fee;
            cash += net;
            tps.push({ date: cal[i], code: c, mv: mv, cost: cost[c], ret: (mv - cost[c]) / cost[c], sellAmt: net, fee: fee, shares: shares[c] });
            shares[c] = 0; cost[c] = 0;
          }
        });
      }
      // 每日盯市
      var eq = 0;
      codes.forEach(function (c) { var s = D.series[c]; if (s && s.close && s.close[i] > 0) eq += shares[c] * s.close[i]; });
      pv[i] = cash + eq; cumInv[i] = cum;
    }
    var endI = ei;
    var finalPV = pv[endI];
    cfs.push(finalPV); cfd.push(ts(cal[endI]));
    var xirrV = xirr(cfs, cfd);
    var cumRet = cum > 0 ? (finalPV - cum) / cum : 0;

    // 同期一次性买入：T=累计投入，在首个定投日等权买入持有到期末
    var T = cum, lShares = {}; codes.forEach(function (c) { lShares[c] = 0; });
    var lAlloc = T / codes.length;
    codes.forEach(function (c) {
      var s = D.series[c]; if (!s || !s.close || !s.close[firstBuyIdx] || s.close[firstBuyIdx] <= 0) return;
      lShares[c] = lAlloc / (s.close[firstBuyIdx] * (1 + slip));
    });
    var lumpEnd = 0;
    for (var i = si; i <= ei; i++) {
      var v = 0;
      codes.forEach(function (c) { var s = D.series[c]; if (s && s.close && s.close[i] > 0) v += lShares[c] * s.close[i]; });
      lumpArr[i] = v;
      if (i === endI) lumpEnd = v;
    }
    var lumpRet = T > 0 ? (lumpEnd - T) / T : 0;
    var lumpXirr = null;
    var yrs = (ts(cal[endI]) - ts(cal[firstBuyIdx])) / (365.25 * 86400000);
    if (yrs > 0 && T > 0 && lumpEnd > 0) lumpXirr = Math.pow(lumpEnd / T, 1 / yrs) - 1;

    // 最大回撤（收益率口径）：以「每元累计投入的成长倍数」V(t)=市值_t/累计投入_t=1+r(t) 为净值序列，
    // 取其运行峰值至其后谷值的归一化跌幅（跌幅=V/Vpeak−1）。该口径剔除每月新资金注入与止盈现金留存对市值的抬升，
    // 反映真实浮亏；且作为平滑策略，其回撤不超过标的本身峰谷跌幅。
    var pkV = -1e18, mdd = 0;
    for (var i = si; i <= ei; i++) {
      if (cumInv[i] <= 0) continue;
      var V = pv[i] / cumInv[i];          // = 1 + r(t)
      if (V > pkV) pkV = V;
      var ddV = V / pkV - 1;              // 归一化峰值跌幅（负值）
      if (ddV < mdd) mdd = ddV;
    }

    $("runState").textContent = "已更新 · " + (Date.now() - t0state) + "ms · " + injIdx.length + " 期";
    renderDCA({
      cal: cal, si: si, ei: ei, pv: pv, cumInv: cumInv, lumpArr: lumpArr,
      finalPV: finalPV, cum: cum, cumRet: cumRet, xirrV: xirrV, mdd: mdd,
      nPeriods: injIdx.length, lumpEnd: lumpEnd, lumpRet: lumpRet, lumpXirr: lumpXirr,
      tps: tps, buys: buys, tpOn: tpOn, codes: codes, freq: freq, amount: amount
    });
  }

  function renderDCA(R) {
    var dates = [];
    for (var i = R.si; i <= R.ei; i++) dates.push([ts(R.cal[i]), i]);
    // KPI 卡片
    function kcard(t, v, s, cls) {
      return '<div class="kpi"><div class="t">' + t + '</div><div class="v ' + (cls || "") + '">' + v + '</div><div class="s">' + s + '</div></div>';
    }
    function yuan(v) { return "¥" + v.toLocaleString("zh-CN", { maximumFractionDigits: 0 }); }
    var xStr = R.xirrV == null ? "—" : (R.xirrV * 100).toFixed(2) + "%";
    var lumpXStr = R.lumpXirr == null ? "—" : (R.lumpXirr * 100).toFixed(2) + "%";
    var excessAmt = R.finalPV - R.lumpEnd;
    var cards = "";
    cards += kcard("XIRR 年化", xStr, "资金加权（含现金流时点）", R.xirrV >= 0 ? "up" : "down");
    cards += kcard("累计收益率", (R.cumRet * 100).toFixed(2) + "%", "(期末−累计投入)/累计投入", R.cumRet >= 0 ? "up" : "down");
    cards += kcard("期末市值", yuan(R.finalPV), "含现金留存", "");
    cards += kcard("累计投入", yuan(R.cum), R.nPeriods + " 期 × " + R.amount + "元", "");
    cards += kcard("最大回撤", (R.mdd * 100).toFixed(2) + "%", "收益率口径回撤（每元投入成长倍数 峰值至谷值跌幅）", "down");
    cards += kcard("vs 一次性买入", (excessAmt >= 0 ? "+" : "") + yuan(excessAmt), "定投期末 − 一次性期末", excessAmt >= 0 ? "up" : "down");
    cards += kcard("一次性·XIRR", lumpXStr, "同期对照年化", R.lumpXirr >= 0 ? "up" : "down");
    cards += kcard("一次性·累计收益", (R.lumpRet * 100).toFixed(2) + "%", "期末 " + yuan(R.lumpEnd), R.lumpRet >= 0 ? "up" : "down");
    if (R.tpOn) cards += kcard("止盈次数", R.tps.length + " 次", "逐标的达阈值清仓", "up");
    $("kpis").innerHTML = cards;

    // 曲线：定投市值 / 累计投入 / 一次性买入市值
    var cNavEl = $("cNav"); if (cNavEl) cNavEl.style.height = "340px";   // 防止 ECharts 在容器未布局时 init 写入 0 高
    var cNavCard = document.querySelector("#cNav") ? document.getElementById("cNav").closest(".card") : null;
    if (cNavCard) cNavCard.querySelector("h2").innerHTML = "定投市值曲线 <span class='n'>定投市值 / 累计投入线 / 同期一次性买入</span>";
    initChart("cNav").setOption({
      tooltip: baseChart().tooltip,
      legend: { data: ["定投市值", "累计投入", "一次性买入"], top: 4, textStyle: { fontSize: 12 } },
      grid: { left: 64, right: 20, top: 36, bottom: 40, containLabel: true },
      xAxis: { type: "time", minInterval: 365 * 24 * 3600 * 1000, axisLabel: { fontSize: 11, formatter: function (v) { return "" + new Date(v).getFullYear(); } } },
      yAxis: { type: "value", scale: true, axisLabel: { fontSize: 11, formatter: function (v) { return (v / 10000).toFixed(1) + "万"; } } },
      dataZoom: [{ type: "inside", start: 0, end: 100 }, { type: "slider", start: 0, end: 100, height: 16, bottom: 6 }],
      series: [
        { name: "定投市值", type: "line", showSymbol: false, lineStyle: { width: 2.5, color: "#34D399" }, itemStyle: { color: "#34D399" }, data: dates.map(function (d) { return [d[0], +R.pv[d[1]].toFixed(0)]; }) },
        { name: "累计投入", type: "line", showSymbol: false, lineStyle: { width: 1.6, color: "#9FB0C3", type: "dashed" }, itemStyle: { color: "#9FB0C3" }, data: dates.map(function (d) { return [d[0], +R.cumInv[d[1]].toFixed(0)]; }) },
        { name: "一次性买入", type: "line", showSymbol: false, lineStyle: { width: 1.8, color: "#FBBF24" }, itemStyle: { color: "#FBBF24" }, data: dates.map(function (d) { return [d[0], +R.lumpArr[d[1]].toFixed(0)]; }) }
      ]
    });
    if (charts["cNav"]) charts["cNav"].resize();

    // 明细表：买入记录 + 止盈记录
    var names = {}; POOL.forEach(function (p) { names[p.code] = p.name; });
    var th = $("tradeTable").querySelector("thead"), tb = $("tradeTable").querySelector("tbody");
    var h2 = $("tradeTable").closest(".card").querySelector("h2");
    if (h2) h2.innerHTML = "定投明细 <span class='n'>买入 " + R.buys.length + " 笔" + (R.tpOn ? " · 止盈 " + R.tps.length + " 次" : "") + "</span>";
    th.innerHTML = "<tr><th style='width:14%'>日期</th><th class='fc' style='width:20%'>标的</th><th style='width:12%'>类型</th><th style='width:13%'>金额(元)</th><th style='width:11%'>价格</th><th style='width:14%'>份额</th><th style='width:9%'>费用</th><th style='width:7%'>收益</th></tr>";
    var rows = "";
    // 买入记录（倒序）
    R.buys.slice().reverse().forEach(function (b) {
      rows += "<tr><td>" + b.date + "</td><td class='fc'>" + (names[b.code] || b.code) + " <span style='color:#7C8DA1;font-size:10px'>" + b.code + "</span></td>" +
        "<td>买入</td><td>" + b.amount.toFixed(2) + "</td><td>" + b.price.toFixed(3) + "</td><td>" + b.shares.toFixed(2) + "</td><td>" + b.fee.toFixed(2) + "</td><td>—</td></tr>";
    });
    // 止盈记录（倒序）
    R.tps.slice().reverse().forEach(function (t) {
      rows += "<tr><td>" + t.date + "</td><td class='fc'>" + (names[t.code] || t.code) + " <span style='color:#7C8DA1;font-size:10px'>" + t.code + "</span></td>" +
        "<td style='color:#F87171'>止盈</td><td>" + t.sellAmt.toFixed(2) + "</td><td>—</td><td>" + t.shares.toFixed(2) + "</td><td>" + t.fee.toFixed(2) + "</td><td style='color:#34D399'>+" + (t.ret * 100).toFixed(1) + "%</td></tr>";
    });
    tb.innerHTML = rows || '<tr><td colspan="8" style="color:#7C8DA1">无交易记录</td></tr>';
    showNotice("口径说明：XIRR 为资金加权年化（每期投入为负、期末总市值为正，二分求解）；累计收益率=(期末市值−累计投入)/累计投入；最大回撤为收益率口径（每元累计投入的成长倍数=市值/累计投入，取其运行峰值至谷值的归一化跌幅，剔除新资金注入与止盈现金留存影响）。一次性买入对照=累计投入总额在首个定投日等权买入持有到期末。");
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
    function icolor(v) { return v > 0 ? "#34D399" : (v < 0 ? "#F87171" : "#F1F5F9"); }

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
      return '<div style="background:#202E3F;border:1px solid var(--line);border-radius:8px;padding:8px 10px">' +
        '<div style="font-size:11px;color:#9FB0C3">' + t + '</div>' +
        '<div style="font-size:16px;font-weight:600;color:' + (clr || "#F1F5F9") + '">' + v + '</div>' +
        '<div style="font-size:10px;color:#7C8DA1">' + s + '</div></div>';
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
        series: [{ name: "组合IC", type: "line", showSymbol: false, lineStyle: { width: 1.6, color: "#4FC3F7" }, itemStyle: { color: "#4FC3F7" }, data: main.ics.map(function (x) { return +x.toFixed(4); }) }]
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
      rows += '<tr><td>' + label + (f.kind === "custom" ? "" : ' <span style="color:#7C8DA1;font-size:10px">(' + key + ')</span>') + '</td>' +
        '<td style="color:' + icolor(fm) + '">' + fm.toFixed(3) + '</td>' +
        '<td>' + (fs > 0 ? (fm / fs).toFixed(2) : "—") + '</td>' +
        '<td style="color:' + icolor(fm) + '">' + (ics.length ? (fpos / ics.length * 100).toFixed(0) : "—") + '%</td>' +
        '<td>' + ics.length + '</td></tr>';
    });
    $("cICFacBody").innerHTML = rows || '<tr><td colspan="5" style="color:#7C8DA1">无排名因子</td></tr>';
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
  }

  function ts(d) { return new Date(d + "T00:00:00+08:00").getTime(); }

  function baseChart() {
    return {
      tooltip: { trigger: "axis", triggerOn: "click", renderMode: "richText", confine: true },
      grid: { left: 56, right: 20, top: 34, bottom: 26, containLabel: true },
      legend: { top: 4, textStyle: { fontSize: 12, color: "#D8E2EF" } }
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
        { name: "沪深300回撤", type: "line", showSymbol: false, lineStyle: { width: 1.5, color: "#3E4E63" }, itemStyle: { color: "#3E4E63" }, data: dates.map(function (t, i) { return [t, +r.bench_drawdown[i].toFixed(5)]; }) }
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
      series: [{ type: "heatmap", data: cells, label: { show: false }, emphasis: { itemStyle: { borderColor: "#3E4E63", borderWidth: 1 } } }]
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
      setFoldByMode();
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
    var keys = Object.keys(m).filter(function (k) { return !(m[k] && m[k].type === "grid"); });
    keys.sort(function (a, b) {
      var ta = (m[a]._saved_at || ""), tb = (m[b]._saved_at || "");
      if (ta && tb) return ta < tb ? -1 : 1;
      return ta ? -1 : (tb ? 1 : 0);
    });
    $("stTotal").textContent = keys.length + " 个策略";
    box.innerHTML = "";
    if (!keys.length) {
      box.innerHTML = '<div style="font-size:12px;color:#9FB0C3;padding:10px 2px">暂无已保存策略。<br>请在「回测」页调好参数后保存；若在其他链接/设备保存过，请用「导出全部/导入全部」迁移。</div>';
      return;
    }
    // 先立即渲染全部列表结构（名称/创建时间），持仓与收益逐个异步回测填充，避免阻塞
    var rows = {};
    keys.forEach(function (k) {
      var row = document.createElement("div");
      row.className = "srow";
      var tag = m[k].mode === "rebalance" ? '<span class="tag" style="color:#A78BFA;border:1px solid #A78BFA;border-radius:3px;font-size:10px;padding:0 3px;margin-left:4px">再平衡</span>' : '<span class="tag" style="color:#4FC3F7;border:1px solid #4FC3F7;border-radius:3px;font-size:10px;padding:0 3px;margin-left:4px">轮动</span>';
      row.innerHTML = '<div class="nm">' + k.replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }) + tag +
        '</div><div class="meta"><span>创建：' + fmtDate(m[k]._saved_at) + '</span><span class="ld">计算中…</span></div>' +
        '<div class="pos">回测中…</div>';
      row.addEventListener("click", function () { showStrategyDetail(k); });
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
          res = stRes[k2] || engine.backtest(D, m[k2]); stRes[k2] = res;
        } catch (e) { res = null; }
        var row = rows[k2];
        if (!row) { next(); return; }
        if (res) {
          var line;
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
    
        // ---- 新增3：当前持仓区块（轮动/再平衡：名称/代码 + 持仓数量 + 市值 + 持仓比例% + 细进度条；头部总持仓市值，最新未复权价估算）----
    var fh = res.final_hold || {};
    var fCodes = Object.keys(fh).filter(function (c) { return fh[c] > 0; });
    var cap = latestCap(name, res);
    var fb3 = (m[name] && m[name].fallback_when_no_signal) || "cash";
    var posHtml = "";
    if (!fCodes.length && fb3 === "money") {
      // 轮动无信号兜底=货币ETF：视为当前持仓（原「当前交易-货币ETF」行并入当前持仓区块）
      var cpx0m = lastRawClose("511990.SH");
      var csm0 = lotShares(cap, cpx0m);
      posHtml = '<div style="font-size:12px;color:#9FB0C3;margin:4px 0 8px">当前持仓 · 总持仓市值 <b style="color:#F1F5F9">' + fmtN(Math.round(cap)) + '</b> 元（货币ETF兜底）</div>'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid #3E4E63;border-radius:8px;margin-bottom:6px;background:#202E3F">'
        + '<span style="font-weight:600;color:#F1F5F9;flex:1;min-width:150px">货币ETF<span style="color:#9FB0C3;font-weight:400;margin-left:4px">511990.SH</span></span>'
        + '<span style="font-size:12px;color:#D8E2EF">持仓 <b style="color:#F1F5F9">' + (csm0 ? fmtN(csm0) : "—") + '</b> 份</span>'
        + '<span style="font-size:12px;color:#D8E2EF">现价 <b style="color:#F1F5F9">' + (cpx0m ? cpx0m.toFixed(4) : "—") + '</b></span>'
        + '<span style="font-size:12px;color:#D8E2EF">市值 <b style="color:#F1F5F9">' + fmtN(Math.round(cap)) + '</b> 元</span>'
        + '<span style="font-size:12px;color:#D8E2EF;white-space:nowrap">持仓比例 <b style="color:#4FC3F7">100.0%</b> <span style="display:inline-block;width:44px;height:5px;background:#1B2634;border-radius:3px;vertical-align:middle;margin-left:4px"><span style="display:block;width:100%;height:100%;background:#4FC3F7;border-radius:3px"></span></span></span></div>';
    } else if (fCodes.length) {
      var items = fCodes.map(function (c) {
        var cur = lastRawClose(c);
        var mv = fh[c] * cap;
        return { c: c, cur: cur, mv: mv };
      });
      var totVal = items.reduce(function (a, b) { return a + b.mv; }, 0);
      posHtml = '<div style="font-size:12px;color:#9FB0C3;margin:4px 0 8px">当前持仓 · 总持仓市值 <b style="color:#F1F5F9">' + fmtN(Math.round(totVal)) + '</b> 元（最新未复权价估算）</div>'
        + items.map(function (it) {
          var nm = gName(it.c);
          var sh = lotShares(it.mv, it.cur);
          var pct = totVal > 0 ? (it.mv / totVal) * 100 : 0;
          return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid #3E4E63;border-radius:8px;margin-bottom:6px;background:#202E3F">'
            + '<span style="font-weight:600;color:#F1F5F9;flex:1;min-width:150px">' + nm + '<span style="color:#9FB0C3;font-weight:400;margin-left:4px">' + it.c + '</span></span>'
            + '<span style="font-size:12px;color:#D8E2EF">持仓 <b style="color:#F1F5F9">' + (sh ? fmtN(sh) : "—") + '</b> 份</span>'
            + '<span style="font-size:12px;color:#D8E2EF">现价 <b style="color:#F1F5F9">' + (it.cur ? it.cur.toFixed(4) : "—") + '</b></span>'
            + '<span style="font-size:12px;color:#D8E2EF">市值 <b style="color:#F1F5F9">' + fmtN(Math.round(it.mv)) + '</b> 元</span>'
            + '<span style="font-size:12px;color:#D8E2EF;white-space:nowrap">持仓比例 <b style="color:#4FC3F7">' + pct.toFixed(1) + '%</b> <span style="display:inline-block;width:44px;height:5px;background:#1B2634;border-radius:3px;vertical-align:middle;margin-left:4px"><span style="display:block;width:' + Math.min(100, pct) + '%;height:100%;background:#4FC3F7;border-radius:3px"></span></span></span></div>';
        }).join("");
    } else {
      posHtml = '<div style="font-size:12px;color:#9FB0C3;margin:4px 0 8px">当前持仓 · 空仓（不持有标的）</div>';
    }
    // ---- 交易流水（次要区块，保留）----
    var tx = res.tx || [];
    var txHtml = "";
    if (tx.length) {
      var total = tx.length;
      var rows = tx.slice(-20).map(function (t) {
        var d = String(t.d || "").slice(0, 10);
        var buy = t.side === "BUY";
        var rp = t.raw_px && t.raw_px > 0 ? t.raw_px : null;
        var amt = +t.amt || 0;
        var sh = rp ? Math.floor(amt / rp / 100) * 100 : null;
        return "<tr><td>" + d + "</td><td class='fc'>" + gName(t.code) + "</td><td class='" + (buy ? "buy" : "sell") + "'>" + (buy ? "买" : "卖") + "</td><td>" + (rp ? rp.toFixed(4) : "—") + "</td><td>" + (sh ? sh.toLocaleString("zh-CN") : "—") + "</td><td>" + (buy ? "-" : "+") + Math.round(amt).toLocaleString("zh-CN") + "</td></tr>";
      }).join("");
      var moreTip = total > 20 ? '<div style="font-size:11.5px;color:#9FB0C3;margin-top:4px">共 ' + total + ' 笔成交，仅显示最近 20 笔（完整逐笔见回测成交表）</div>' : "";
      txHtml = '<div style="font-size:12px;color:#D8E2EF;margin:10px 0 4px;font-weight:600">交易记录（最近 ' + Math.min(20, total) + ' / ' + total + ' 笔）</div><div class="tblwrap"><table class="trades" style="margin-top:4px;table-layout:fixed;width:100%;min-width:560px"><colgroup><col style="width:15%"><col style="width:27%"><col style="width:8%"><col style="width:17%"><col style="width:17%"><col style="width:16%"></colgroup><thead><tr><th>日期</th><th class="fc">标的</th><th>方向</th><th>未复权价</th><th>数量（份）</th><th>金额</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + moreTip;
    }
    box.innerHTML = posHtml + txHtml;
  }
    // 网格详情视图（持有标的一行点击后渲染）：① 网格参数（按引擎实际参数逐行展示）② 网格表（中轴线红标注 / 最新收盘价蓝标注）
  
function showStrategyDetail(name) {
    var m = loadStored();
    if (!m[name]) return;
    if (!D) { $("stDetail").style.display = "block"; $("stName2").textContent = name; $("stKpis").innerHTML = '<div style="font-size:12px;color:#9FB0C3;padding:8px">正在加载行情数据并计算策略详情…</div>'; }
    ensureData(function () {
    stCurName = name;
    $("stDetail").style.display = "block";
    $("stDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    var res = null;
    try {
      res = stRes[name];
      if (!res) {
        res = engine.backtest(D, m[name]);
      }
      stRes[name] = res;
    } catch (e2) {
      // 回测异常兜底：页面内友好提示，不冒泡到全局 error 红条；保留用户已选日期
      var eMsg = ((e2 && e2.message) || "回测失败") + "";
      $("stDetail").style.display = "block";
      $("stName2").textContent = name;
      var kb2 = $("stKpis");
      if (kb2) kb2.innerHTML = '<div style="font-size:12px;color:#FBBF24;background:#3A2A12;border:1px dashed #F59E0B;border-radius:8px;padding:10px 12px;margin:8px 0;line-height:1.7">回测失败：' + eMsg + '。若是「回测区间过短/结束日期早于起始」，请选择更早的起始日期或更晚的结束日期后再试。</div>';
      ["stPosBuy", "stTx"].forEach(function (id) { var el2 = $(id); if (el2) el2.innerHTML = ""; });
      return;
    }
    $("stName2").textContent = name;
    var mt = res.metrics;
    var L = (res.calendar || res.dates || []).length;
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
      ["总收益", pct(mt.total_return, 0), mt.benchmark ? "基准 " + pct(mt.benchmark.total, 0) : ""],
      ["年化收益", pct(mt.cagr, 0), "总投入口径"],
      ["占用口径年化", mt.occ_cagr != null && !isNaN(mt.occ_cagr) ? pct(mt.occ_cagr, 0) : "—", "按平均占用资金折算；总投入口径偏低，占用口径反映资金效率"],
      ["平均资金占用率", mt.avg_exposure != null ? (mt.avg_exposure * 100).toFixed(1) + "%" : "—", "按日平均持仓市值÷总资金"],
      ["夏普比率", mt.sharpe.toFixed(2), "（无风险 2%）"],
      ["Sortino", mt.sortino != null && !isNaN(mt.sortino) ? mt.sortino.toFixed(2) : "—", "下行波动调整（仅负收益期，无风险 2%）"],
      ["信息比率", mt.ir != null && !isNaN(mt.ir) ? mt.ir.toFixed(2) : "—", "年化超额÷跟踪误差（基准=沪深300）"],
      ["Calmar", mt.calmar != null && !isNaN(mt.calmar) ? mt.calmar.toFixed(2) : "—", "年化收益÷最大回撤绝对值"],
      ["年均交易次数", (mt.n_trades / years).toFixed(0) + " 次/年", "共 " + mt.n_trades + " 笔"],
      ["触发买入", (res.metrics && res.metrics.sell_cond_times ? res.metrics.sell_cond_times : 0) + " 次", "排名区间内因条件卖出"],
      ["当前回撤", curDD.toFixed(2) + "%", ""],
      ["最大回撤", (mt.max_dd * 100).toFixed(2) + "%", ""],
      ["最长回撤天数", maxDDD + " 个交易日", ""],
      ["年化波动率", (mt.vol * 100).toFixed(2) + "%", ""],
      ["胜率", (mt.win_rate * 100).toFixed(1) + "%", ""],
      ["盈亏比", mt.profit_factor != null ? mt.profit_factor.toFixed(2) : "—", ""],
      ["超额收益", mt.benchmark ? pct(mt.total_return - mt.benchmark.total, 0) : "—", mt.benchmark ? "vs 沪深300" : "无基准设置"]
    ];
    var kb = $("stKpis"); kb.innerHTML = "";
    kpis.forEach(function (k) {
      var d = document.createElement("div");
      d.className = "kpi";
      var vCls = (k[1].indexOf("-") === 0 && (k[0].indexOf("收益") >= 0 || k[0].indexOf("回撤") >= 0)) ? "down" : "";
      d.innerHTML = '<div class="t">' + k[0] + '</div><div class="v ' + vCls + '">' + k[1] + '</div><div class="s">' + k[2] + '</div>';
      kb.appendChild(d);
    });
    // 收益归因（仅轮动：轮动显示因子分解；再平衡标注不适用）
    var atr = mt.attribution;
    var atrCard = $("attrCard");
    if (atrCard) {
      if (!atr || !atr.factors || !atr.factors.length) {
        atrCard.style.display = "block";
        $("attrTable").innerHTML = '<div style="font-size:12px;color:#9FB0C3;padding:6px 0">收益归因：不适用（该策略为再平衡模式或无排名因子，无因子选股维度可分解）</div>';
        $("attrChart").innerHTML = "";
        $("attrNote").textContent = "";
      } else {
        atrCard.style.display = "block";
        var rowsA = '<table class="syear" style="table-layout:fixed;width:100%;border-collapse:collapse;font-size:12px"><colgroup><col style="width:30%"><col style="width:26%"><col style="width:24%"><col style="width:20%"></colgroup><tr><th>来源</th><th>贡献金额</th><th>贡献占比</th><th>累计</th></tr>';
        var rows2 = atr.factors.concat([atr.market]);
        for (var ari = 0; ari < rows2.length; ari++) {
          var ro2 = rows2[ari];
          var vClsA = ro2.contrib < 0 ? "down" : "up";
          rowsA += '<tr><td>' + ro2.name + '</td><td class="' + vClsA + '">' + fmtN(ro2.contrib) + '</td><td class="' + vClsA + '">' + (ro2.pct * 100).toFixed(2) + '%</td><td></td></tr>';
        }
        rowsA += '<tr><td>合计</td><td>' + fmtN(atr.total) + '</td><td>100%</td><td></td></tr></table>';
        $("attrTable").innerHTML = rowsA;
        var chA = $("attrChart");
        if (chA && typeof echarts !== "undefined") {
          if (!charts["attrChart"]) { charts["attrChart"] = echarts.init(chA, "dark"); charts["attrChart"].setOption({ backgroundColor: "transparent" }); }
          var namesA = atr.factors.map(function (f) { return f.name; }).concat([atr.market.name]);
          var pctsA = atr.factors.map(function (f) { return +(f.pct * 100).toFixed(2); }).concat([+(atr.market.pct * 100).toFixed(2)]);
          charts["attrChart"].setOption({
            tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
            grid: { left: 92, right: 26, top: 12, bottom: 26 },
            xAxis: { type: "value", axisLabel: { fontSize: 10, formatter: function (v) { return v + "%"; } } },
            yAxis: { type: "category", data: namesA, axisLabel: { fontSize: 11 } },
            series: [{ name: "贡献占比", type: "bar", data: pctsA, barMaxWidth: 18, itemStyle: { color: function (p) { return p.dataIndex === pctsA.length - 1 ? "#9FB0C3" : "#4FC3F7"; } } }]
          });
        }
        $("attrNote").textContent = "口径：" + atr.method + "；贡献金额按起始资金 " + fmtN(atr.capital) + " 元折算，占比合计≈100%（" + atr.n_periods + " 个调仓期）。";
      }
    }
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
    var dats = (res.calendar || res.dates || []).map(function (t, i) { return t; });
    initChart("stChart").setOption({
      tooltip: { trigger: "axis", triggerOn: "mousemove|click", renderMode: "richText", confine: true },
      legend: { data: ["策略", "沪深300"], top: 4, textStyle: { fontSize: 12 } },
      grid: { left: 60, right: 20, top: 36, bottom: 26, containLabel: true },
      xAxis: { type: "time", axisLabel: { fontSize: 11 } },
      yAxis: { type: "value", axisLabel: { fontSize: 11, formatter: function (v) { return v.toFixed(2); } }, scale: true },
      series: [
        { name: "策略", type: "line", showSymbol: false, lineStyle: { width: 2, color: COLOR.str }, itemStyle: { color: COLOR.str }, data: dats.map(function (t, i) { return [t, +(res.nav[i]).toFixed(4)]; }) },
        { name: "沪深300", type: "line", showSymbol: false, lineStyle: { width: 1.5, color: "#9FB0C3" }, itemStyle: { color: "#9FB0C3" }, data: res.bench_nav ? dats.map(function (t, i) { return [t, +(res.bench_nav[i]).toFixed(4)]; }) : [] }
      ]
    });
    // 按年度收益表
    var yrs = mt.annual ? Object.keys(mt.annual).sort() : [];
    var yb = $("stYearly"); yb.innerHTML = '<tr><th>年份</th><th>策略</th><th>沪深300</th><th>超额</th></tr>';
    if (!yrs.length) { yb.innerHTML += '<tr><td colspan="4" style="color:#7C8DA1">该策略无年度基准数据</td></tr>'; }
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
    if (Object.keys(mon).length === 0) { $("stMonthly").innerHTML = '<div style="font-size:12px;color:#7C8DA1;padding:6px 0">该策略无月度收益数据</div>'; }
    Object.keys(mon).forEach(function (k) {
      var y = k.slice(0, 4), mIdx = +k.slice(5, 7);
      if (!monYrs[y]) monYrs[y] = {};
      monYrs[y][mIdx] = mon[k];
    });
    Object.keys(monYrs).sort().forEach(function (y) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "margin:6px 0";
      wrap.innerHTML = '<div style="font-size:11px;color:#7C8DA1;margin-bottom:3px">' + y + '</div>';
      var grid = document.createElement("div");
      grid.className = "mgrid";
      for (var mi = 1; mi <= 12; mi++) {
        var c = document.createElement("div");
        c.className = "mcell";
        var v = monYrs[y][mi];
        var bg = "#243244", fg = "#D8E2EF";
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
  function curChecked() { return activeView === "rebalance" ? rebalanceChecked : (activeView === "dca" ? dcaChecked : poolChecked); }
  function viewSlots() {
    if (activeView === "rebalance") return { s1: $("rebSh1Slot"), s2: $("rebSh2Slot") };
    if (activeView === "dca") return { s1: $("dcaSh1Slot"), s2: $("dcaSh2Slot") };
    return { s1: $("rotSh1Slot"), s2: $("rotSh2Slot") };
  }
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
    var target = (v === "rebalance" || v === "dca") ? v : "rotation";
    var changed = activeView !== target;
    activeView = target;
    var sh1 = $("sh1"), sh2 = $("sh2");
    var sl = viewSlots();
    if (sh1 && sl.s1 && sh1.parentNode !== sl.s1) sl.s1.appendChild(sh1);
    if (sh2 && sl.s2 && sh2.parentNode !== sl.s2) sl.s2.appendChild(sh2);
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
    var sl = viewSlots();
    var p1 = sl.s1 ? sl.s1.parentElement : null, p2 = sl.s2 ? sl.s2.parentElement : null;
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
    var dca = activeView === "dca";
    var hsEls = document.querySelectorAll(".sfold-h");
    for (var a = 0; a < hsEls.length; a++) {
      var g = hsEls[a].getAttribute("data-g");
      if (dca) { hsEls[a].style.display = (g === "dca") ? "" : "none"; continue; }
      if (g === "dca") { hsEls[a].style.display = "none"; continue; }   // 定投折叠头仅定投视图可见
      if (g === "rebwfo") { hsEls[a].style.display = reb ? "" : "none"; continue; }
      hsEls[a].style.display = reb ? "none" : "";
    }
    var togEl = document.getElementById("sfToggle");
    if (togEl) togEl.style.display = (reb || dca) ? "none" : "";
    var bs = document.querySelectorAll(".sfold-b");
    for (var c = 0; c < bs.length; c++) {
      if (dca) { bs[c].classList.toggle("hide", bs[c].id !== "sfg-dca"); continue; }
      if (bs[c].id === "sfg-dca") { bs[c].classList.add("hide"); continue; }
      if (bs[c].id === "sfg-rebwfo") {
        if (!reb) bs[c].classList.add("hide");
        else { var hh2 = localStorage.getItem("sf_grp"); if (hh2 && hh2.indexOf("rebwfo") >= 0) bs[c].classList.remove("hide"); else bs[c].classList.add("hide"); }
        continue;
      }
      bs[c].classList.remove("hide");
    }
    // 持有排名区间（实际交易参数）为轮动专属：再平衡/定投视图不展示
    var tp = document.getElementById("topnRow");
    if (tp) tp.style.display = (reb || dca) ? "none" : "";
    // 因子与选股、参数调优与策略验证为轮动专属折叠区：再平衡视图不展示（保持原行为）；再平衡 WFO 为独立模块（见参数面板）
    if (reb) { var fB = document.getElementById("sfg-fac"); if (fB) fB.classList.add("hide"); }
    if (reb) { var tB2 = document.getElementById("sfg-tune"); if (tB2) tB2.classList.add("hide"); }
    // 定投视图：dca 折叠组展开、文案「收起」
    if (dca) { var db = document.getElementById("sfg-dca"); if (db) db.classList.remove("hide"); var da = document.querySelector('.sfold-h[data-g="dca"] .sf-a'); if (da) da.textContent = "收起"; }
    if (!reb && !dca) {
      var hh = localStorage.getItem("sf_grp");
      var openGrps = (hh === null) ? "fac" : hh.split(",").filter(function (x) { return x !== "exe"; }).join(",");
      ["fac", "core", "exe", "mgmt", "tune"].forEach(function (g) {
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
    $("viewDCA").style.display = v === "dca" ? "" : "none";
    $("viewStrategies").style.display = v === "strategies" ? "" : "none";
    $("viewCorr").style.display = v === "correlation" ? "" : "none";
    $("viewCombo").style.display = v === "combo" ? "" : "none";
    $("viewIc").style.display = v === "ic" ? "" : "none";
    $("tabRotation").className = v === "rotation" ? "on" : "";
    $("tabRebalance").className = v === "rebalance" ? "on" : "";
    $("tabDCA").className = v === "dca" ? "on" : "";
    $("tabStrategies").className = v === "strategies" ? "on" : "";
    $("tabCorr").className = v === "correlation" ? "on" : "";
    $("tabCombo").className = v === "combo" ? "on" : "";
    $("tabIc").className = v === "ic" ? "on" : "";
    var svMap = { rotation: "tabRotation", rebalance: "tabRebalance", dca: "tabDCA", strategies: "tabStrategies", correlation: "tabCorr", combo: "tabCombo", ic: "tabIc" };
    var svTab = svMap[v] ? $(svMap[v]) : null;
    if (svTab && svTab.scrollIntoView) { try { svTab.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { svTab.scrollIntoView(); } }
    if (v === "rotation" || v === "rebalance" || v === "dca") switchView(v);
    if (v === "strategies") renderStrategyList();
    if (v === "correlation" && window.CorrView) CorrView.render();
    if (v === "combo") renderComboSetup();
    if (v === "ic" && window.ICView) ICView.render();
  }
  function hashView() {
    var h = location.hash || "";
    if (h.indexOf("dca") >= 0 || h.indexOf("定投") >= 0) return "dca";
    if (h.indexOf("rotation") >= 0) return "rotation";
    if (h.indexOf("rebalance") >= 0 || h.indexOf("backtest") >= 0) return "rebalance";
    if (h.indexOf("strategies") >= 0) return "strategies";
    if (h.indexOf("correlation") >= 0 || h.indexOf("corr") >= 0) return "correlation";
    if (h.indexOf("combo") >= 0) return "combo";
    if (h.indexOf("ic") >= 0 || h.indexOf("factor") >= 0) return "ic";
    return "rotation";
  }
  $("tabRotation").addEventListener("click", function () { location.hash = "#/rotation"; showView("rotation"); });
  $("tabRebalance").addEventListener("click", function () { location.hash = "#/rebalance"; showView("rebalance"); });
  $("tabDCA").addEventListener("click", function () { location.hash = "#/dca"; showView("dca"); });
  $("tabStrategies").addEventListener("click", function () { location.hash = "#/strategies"; showView("strategies"); });
  $("tabCorr").addEventListener("click", function () { location.hash = "#/correlation"; showView("correlation"); });
  $("tabCombo").addEventListener("click", function () { location.hash = "#/combo"; showView("combo"); });
  $("tabIc").addEventListener("click", function () { location.hash = "#/ic"; showView("ic"); });
  window.addEventListener("hashchange", function () { showView(hashView()); });
  window.addEventListener("load", function () { showView(hashView()); });   // 初始视图同步：浏览器/历史恢复 hash 晚于脚本执行时兜底（恢复不触发 hashchange）

  function gName(code) {
    var i2, arr = (typeof POOL !== "undefined" ? POOL : (D && D.pool) || []);
    for (i2 = 0; i2 < arr.length; i2++) { if (arr[i2].code === code) return arr[i2].name; }
    return code;
  }


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
      box.innerHTML = '<div style="font-size:12px;color:#9FB0C3;padding:10px 2px">暂无已保存策略。<br>请先在「回测」页调好参数并保存，再到此页组合多个策略。</div>';
      return;
    }
    var ds = $("comboStart"), de = $("comboEnd");
    if (D && D.calendar && D.calendar.length) { ds.value = D.calendar[0]; de.value = D.calendar[D.calendar.length - 1]; }
    keys.forEach(function (nm) {
      var row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;color:#F1F5F9;padding:4px 6px;cursor:pointer;background:#202E3F;border:1px solid #243244;border-radius:5px";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "comboCk"; cb.checked = true;
      cb.style.cssText = "flex:0 0 auto";
      var nmEl = document.createElement("span");
      nmEl.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      nmEl.textContent = nm;
      nmEl.title = nm + ((m[nm].mode === "rebalance") ? "（再平衡策略）" : "（动量策略）");
      var wt = document.createElement("input");
      wt.type = "number"; wt.min = 0; wt.max = 100; wt.step = 1; wt.className = "comboWt";
      wt.style.cssText = "flex:0 0 52px;text-align:right;font-size:12px;padding:2px 4px;border:1px solid #3E4E63;border-radius:4px;background:#1B2634;color:#F1F5F9";
      var wlab = document.createElement("span"); wlab.textContent = "%"; wlab.style.cssText = "color:#7C8DA1;font-size:11px";
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
      c.style.cssText = "background:#202E3F;border:1px solid #243244;border-radius:8px;padding:10px 12px;text-align:center";
      c.innerHTML = '<div style="font-size:11px;color:#7C8DA1">' + kv[0] + '</div><div style="font-size:17px;color:#4FC3F7;font-weight:600;margin-top:2px">' + kv[1] + '</div>';
      kpi.appendChild(c);
    });
    // 净值曲线
    _disposeCombo("comboChart");
    var palette = ["#4FC3F7", "#F59E0B", "#34D399", "#A78BFA", "#F472B6", "#FBBF24", "#60A5FA", "#4ADE80"];
    var series = [{ name: "组合", type: "line", showSymbol: false, lineStyle: { width: 3, color: "#4FC3F7" }, itemStyle: { color: "#4FC3F7" }, data: cal.map(function (t, i) { return [t, +(combo[i]).toFixed(5)]; }) }];
    resList.forEach(function (r, idx) {
      var col = palette[(idx + 1) % palette.length];
      series.push({ name: names[idx], type: "line", showSymbol: false, lineStyle: { width: 1.5, color: col }, itemStyle: { color: col }, data: r.nav.map(function (v, i) { return [cal[i], +v.toFixed(5)]; }) });
    });
    var ch = echarts.init($("comboChart"));
    _comboCharts["comboChart"] = ch;
    ch.setOption({
      backgroundColor: "transparent", tooltip: { trigger: "axis" },
      legend: { textStyle: { color: "#D8E2EF" }, top: 0 },
      grid: { left: 45, right: 20, top: 34, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: cal, axisLabel: { color: "#9FB0C3", hideOverlap: true } },
      yAxis: { type: "value", scale: true, axisLabel: { color: "#9FB0C3", formatter: function (v) { return v.toFixed(2); } }, splitLine: { lineStyle: { color: "#243244" } } },
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
      xAxis: { type: "category", data: names, axisLabel: { color: "#D8E2EF", rotate: 40 } },
      yAxis: { type: "category", data: names, axisLabel: { color: "#D8E2EF" } },
      visualMap: { min: -1, max: 1, calculable: true, orient: "horizontal", left: "center", bottom: 6, textStyle: { color: "#9FB0C3" }, inRange: { color: ["#7F1D1D", "#243244", "#14532D"] } },
      series: [{ type: "heatmap", data: cells, label: { show: true, color: "#F1F5F9", fontSize: 11 }, itemStyle: { borderColor: "#1B2634", borderWidth: 1 } }]
    });
    // 目标权重
    _disposeCombo("comboWeight");
    var pie = echarts.init($("comboWeight"));
    // 目标权重：策略名列表放上方，饼图放下方，错开展示
    var lg = $("comboWeightLegend"); lg.innerHTML = "";
    names.forEach(function (nm, i) {
      var it = document.createElement("span");
      it.style.cssText = "display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#F1F5F9";
      it.innerHTML = '<span style="width:10px;height:10px;border-radius:2px;background:' + palette[i % palette.length] + ';flex:0 0 auto"></span>' + nm + ' <span style="color:#9FB0C3">' + (w[i] * 100).toFixed(2) + '%</span>';
      lg.appendChild(it);
    });
    _disposeCombo("comboWeight");
    var pie = echarts.init($("comboWeight"));
    _comboCharts["comboWeight"] = pie;
    pie.setOption({
      backgroundColor: "transparent", tooltip: { trigger: "item", formatter: function (p) { return p.name + "<br>权重 " + p.percent + "%"; } },
      series: [{ type: "pie", radius: ["42%", "64%"], center: ["50%", "50%"], avoidLabelOverlap: true, label: { color: "#F1F5F9", formatter: "{d}%", fontSize: 11 }, data: names.map(function (nm, i) { return { name: nm, value: +(w[i] * 100).toFixed(2), itemStyle: { color: palette[i % palette.length] } }; }) }]
    });
  }
  $("comboRun").addEventListener("click", function () { runCombo(); });

  // ---------- 回测参数面板分区折叠（核心默认展开，其余折叠，状态记忆） ----------
  (function () {
    var grps = ["fac", "core", "exe", "mgmt", "tune", "rebwfo", "dca"];
    var H = localStorage.getItem("sf_grp");
    if (H === null) H = "fac"; // 默认只展开因子与选股
    else { var arrH = H.split(",").filter(function (x) { return x !== "exe"; }); H = arrH.join(",") || "fac"; } // ③择时管理默认收起（不记忆展开态）
    var tog = document.getElementById("sfToggle");
    function setTogText() {
      if (!tog) return;
      var allOpen = grps.every(function (g) { return H.indexOf(g) >= 0; });
      tog.textContent = allOpen ? "收起" : "展开";
    }
    function apply() {
      var isReb = typeof activeView !== "undefined" && activeView === "rebalance";
      var isDca = typeof activeView !== "undefined" && activeView === "dca";
      grps.forEach(function (g) {
        var b = document.getElementById("sfg-" + g);
        if (!b) return;
        // 定投视图：仅 dca 组可见且展开，其余强制隐藏
        if (isDca) { b.classList.toggle("hide", g !== "dca"); if (g === "dca") { var ad = document.querySelector('.sfold-h[data-g="dca"] .sf-a'); if (ad) ad.textContent = "收起"; } return; }
        // 再平衡视图：因子与选股、参数调优与策略验证为轮动专属，强制隐藏（折叠头已由 setFoldByMode 隐藏，此处防止 sf_grp 记忆将其内容重新展开）
        if (isReb && (g === "fac" || g === "tune")) { b.classList.add("hide"); return; }
        if (g === "dca") { b.classList.add("hide"); return; }   // 轮动/再平衡视图下定投组隐藏
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
  function updateDataBadge() {
    var el = document.getElementById("dbDate"); if (!el) return;
    var d = null;
    try { d = (typeof globalThis !== "undefined" && globalThis.D) || D; } catch (e) { }
    if (d && d.calendar && d.calendar.length) {
      var last = d.calendar[d.calendar.length - 1];
      el.textContent = "数据截至 " + String(last);
    } else {
      el.textContent = "数据截至 —";
    }
  }
  if (document.readyState !== "loading") updateDataBadge();
  else document.addEventListener("DOMContentLoaded", function () { updateDataBadge(); });
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
          updateDataBadge();
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
          (v.total < mn + span * 0.25 ? "#F87171" : (v.total > mx - span * 0.25 ? "#34D399" : "#D8E2EF")) + "\">" + FMT.pct(v.total, 1) + "</b></div>";
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

  // ===== 滚动样本外检验（WFO）：轮动=训练+验证滚动（复用 _warm_start 无前视预热），再平衡=纯分段 =====
  var wfoRunning = false;
  function wfoPct(v) { return (v * 100).toFixed(2) + "%"; }
  function runWFO() {
    var state = $("wfoState");
    if (wfoRunning) { if (state) state.textContent = "WFO 进行中…"; return; }
    var box = $("wfoBox");
    if (!D || !engine) { if (state) state.textContent = "请先进入回测"; return; }
    var isReb = activeView === "rebalance";
    var trainY = Math.max(0.25, +($("wfoTrainIn") ? $("wfoTrainIn").value : 3) || 3);
    var valY = Math.max(0.25, +($("wfoValIn") ? $("wfoValIn").value : 1) || 1);
    var ann = 252, cal = D.calendar, n = cal.length;
    var trainN = Math.round(trainY * ann), valN = Math.round(valY * ann);
    // 分段：轮动=每段验证区间前 trainN 日预热（warm_start=训练段起点）；再平衡=无训练段，从数据起点每 valN 日一段
    var segs = [];
    if (isReb) {
      var k0 = 0;
      while (k0 + valN <= n) { segs.push({ vs: k0, ve: k0 + valN, ws: k0 }); k0 += valN; }
    } else {
      var st0 = trainN;
      while (st0 + valN <= n) { segs.push({ vs: st0, ve: st0 + valN, ws: st0 - trainN }); st0 += valN; }
    }
    if (!segs.length) { if (state) state.textContent = "历史长度不足以完成分段（训练+验证需 ≤ 数据总长）"; return; }
    if (state) state.textContent = "运行中（" + segs.length + " 段）…";
    wfoRunning = true;
    var base = getParams();
    try {
      for (var gi = 0; gi < segs.length; gi++) {
        var sg = segs[gi];
        var p = JSON.parse(JSON.stringify(base));
        p.start_date = cal[sg.vs];
        p.end_date = cal[sg.ve - 1];
        p.warm_start = cal[sg.ws];
        var r = engine.backtest(D, p);
        var nav = r.nav, bench = r.bench_nav;
        var nn = nav.length;
        var tot = nn > 1 ? nav[nn - 1] / nav[0] - 1 : 0;
        var yrs = nn / ann;
        var cg = (yrs > 0 && nav[0] > 0) ? Math.pow(nav[nn - 1] / nav[0], 1 / yrs) - 1 : 0;
        var pk = nav[0], mdd = 0, si2;
        for (si2 = 1; si2 < nn; si2++) { if (nav[si2] > pk) pk = nav[si2]; var dd2 = 1 - nav[si2] / pk; if (dd2 > mdd) mdd = dd2; }
        var bTot = (bench && bench.length > 1) ? bench[bench.length - 1] / bench[0] - 1 : 0;
        sg.res = { start: r.calendar[0], end: r.calendar[nn - 1], cagr: cg, max_dd: mdd, excess: tot - bTot, total: tot };
        if (state) state.textContent = "运行中（" + (gi + 1) + "/" + segs.length + "）…";
      }
      renderWFO(segs, isReb, trainY, valY);
      if (state) state.textContent = segs.length + " 段完成";
    } catch (e) {
      if (state) state.textContent = "WFO 失败：" + String((e && e.message) || e);
    }
    wfoRunning = false;
  }
  function renderWFO(segs, isReb, trainY, valY) {
    var box = $("wfoBox"); if (!box) return;
    box.style.display = "block";
    var mt = $("wfoModeTag"); if (mt) mt.textContent = isReb ? "（再平衡：纯分段逐段独立回测，无训练段）" : "（轮动：训练 " + trainY + " 年预热 + 验证 " + valY + " 年滚动；每段 warm_start=训练段起点，参数用当前配置，不做段内调优）";
    var note = $("wfoNote");
    if (note) note.innerHTML = "无前视说明：每段回测 warm_start 置于验证段起点之前（轮动=前 " + trainY + " 年训练段，再平衡=段起点），该段只算指标/因子、不产生交易；验证段净值、回撤与超额全部基于段起点之后的数据，每段只依赖段前数据。年化按 252 交易日折算；超额 = 段内策略总收益 − 沪深300（H00300.CSI）总收益。";
    var th = '<tr><th style="width:9%">段</th><th style="width:27%">样本外区间</th><th style="width:16%">年化</th><th style="width:16%">最大回撤</th><th style="width:16%">vs 沪深300</th><th style="width:16%">区间收益</th></tr>';
    var rows = "";
    for (var ri = 0; ri < segs.length; ri++) {
      var s = segs[ri].res;
      rows += '<tr><td>段' + (ri + 1) + '</td><td>' + s.start + ' ~ ' + s.end + '</td><td class="' + (s.cagr < 0 ? "down" : "up") + '">' + wfoPct(s.cagr) + '</td><td class="down">' + wfoPct(s.max_dd) + '</td><td class="' + (s.excess < 0 ? "down" : "up") + '">' + wfoPct(s.excess) + '</td><td class="' + (s.total < 0 ? "down" : "up") + '">' + wfoPct(s.total) + '</td></tr>';
    }
    var tb = $("wfoTable"); if (tb) tb.innerHTML = th + rows;
    var cagrs = segs.map(function (s) { return s.res.cagr; });
    var avg = cagrs.reduce(function (a, b) { return a + b; }, 0) / cagrs.length;
    var wi = 0;
    for (var w2 = 1; w2 < cagrs.length; w2++) if (cagrs[w2] < cagrs[wi]) wi = w2;
    var worst = segs[wi].res;
    var downRun = false;
    for (var d2 = 1; d2 < cagrs.length - 1; d2++) { if (cagrs[d2] < cagrs[d2 - 1] && cagrs[d2 + 1] < cagrs[d2]) { downRun = true; break; } }
    var sm = $("wfoSummary");
    if (sm) sm.innerHTML = "<b>汇总：</b>平均年化 " + wfoPct(avg) + " · 最差段 段" + (wi + 1) + "（" + worst.start + " ~ " + worst.end + "，" + wfoPct(worst.cagr) + "）· " +
      (downRun ? '<span style="color:#F87171">存疑：存在连续两段收益转差，稳健性不足，建议检查参数或改权重新评估</span>' : '<span style="color:#34D399">稳健：无连续两段收益转差</span>');
    var ch = $("wfoChart");
    if (ch && typeof echarts !== "undefined") {
      if (!charts["wfoChart"]) { charts["wfoChart"] = echarts.init(ch, "dark"); charts["wfoChart"].setOption({ backgroundColor: "transparent" }); }
      charts["wfoChart"].setOption({
        tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
        legend: { data: ["年化"], top: 0, textStyle: { fontSize: 11 } },
        grid: { left: 58, right: 18, top: 30, bottom: 26 },
        xAxis: { type: "category", data: segs.map(function (s, i) { return "段" + (i + 1); }), axisLabel: { fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { fontSize: 10, formatter: function (v) { return v + "%"; } } },
        series: [{ name: "年化", type: "bar", barMaxWidth: 28, data: cagrs.map(function (v) { return +(v * 100).toFixed(2); }), itemStyle: { color: "#4FC3F7" }, markLine: { symbol: "none", data: [{ type: "average", name: "平均" }], lineStyle: { color: "#F59E0B", type: "dashed" }, label: { formatter: "平均 {c}%", fontSize: 10, color: "#F59E0B" } } }]
      });
    }
  }

  // ===== 再平衡独立「滚动样本外检验（WFO）」：纯分段滚动（无训练段），含相对买入持有超额对照 =====
  var rebWfoRunning = false;
  function rebRunWFO() {
    var state = $("rebWfoState");
    if (rebWfoRunning) { if (state) state.textContent = "WFO 进行中…"; return; }
    var box = $("rebWfoBox");
    if (!D || !engine) { if (state) state.textContent = "请先进入回测"; return; }
    var valY = Math.max(0.25, +($("rebWfoValIn") ? $("rebWfoValIn").value : 1) || 1);
    var ann = 252, cal = D.calendar, n = cal.length;
    var valN = Math.round(valY * ann);
    var segs = [];
    var k0 = 0;
    while (k0 + valN <= n) { segs.push({ vs: k0, ve: k0 + valN, ws: k0 }); k0 += valN; }
    if (!segs.length) { if (state) state.textContent = "历史长度不足以完成分段（每段 " + valY + " 年）"; return; }
    if (state) state.textContent = "运行中（" + segs.length + " 段）…";
    rebWfoRunning = true;
    var base = getParams();
    try {
      for (var gi = 0; gi < segs.length; gi++) {
        var sg = segs[gi];
        var p = JSON.parse(JSON.stringify(base));
        p.start_date = cal[sg.vs];
        p.end_date = cal[sg.ve - 1];
        p.warm_start = cal[sg.ws];
        var r = engine.backtest(D, p);
        var nav = r.nav, bench = r.bench_nav, bh = r.bh_nav;
        var nn = nav.length;
        var tot = nn > 1 ? nav[nn - 1] / nav[0] - 1 : 0;
        var yrs = nn / ann;
        var cg = (yrs > 0 && nav[0] > 0) ? Math.pow(nav[nn - 1] / nav[0], 1 / yrs) - 1 : 0;
        var pk = nav[0], mdd = 0, si2;
        for (si2 = 1; si2 < nn; si2++) { if (nav[si2] > pk) pk = nav[si2]; var dd2 = 1 - nav[si2] / pk; if (dd2 > mdd) mdd = dd2; }
        var bTot = (bench && bench.length > 1) ? bench[bench.length - 1] / bench[0] - 1 : 0;
        var bhTot = (bh && bh.length > 1) ? bh[bh.length - 1] / bh[0] - 1 : 0;
        sg.res = { start: r.calendar[0], end: r.calendar[nn - 1], cagr: cg, max_dd: mdd, excess: tot - bTot, bh_excess: tot - bhTot, total: tot };
        if (state) state.textContent = "运行中（" + (gi + 1) + "/" + segs.length + "）…";
      }
      renderRebWFO(segs, valY);
      if (state) state.textContent = segs.length + " 段完成";
    } catch (e) {
      if (state) state.textContent = "WFO 失败：" + String((e && e.message) || e);
    }
    rebWfoRunning = false;
  }
  function renderRebWFO(segs, valY) {
    var box = $("rebWfoBox"); if (!box) return;
    box.style.display = "block";
    var mt = $("rebWfoModeTag"); if (mt) mt.textContent = "（再平衡：纯分段滚动，无训练段，历史每 " + valY + " 年一段独立回测）";
    var note = $("rebWfoNote");
    if (note) note.innerHTML = "无前视说明：每段从段起点独立回测，只依赖段前及段内数据；年化按 252 交易日折算；超额 vs 沪深300（H00300.CSI）；相对买入持有 = 段内调仓组合收益 − 同期该配置标的等权买入持有（不调仓）组合收益，检验调仓动作是否创造正超额。";
    var th = '<tr><th>段</th><th>样本外区间</th><th>年化</th><th>最大回撤</th><th>vs 沪深300</th><th>相对买入持有</th></tr>';
    var rows = "";
    for (var ri = 0; ri < segs.length; ri++) {
      var s = segs[ri].res;
      rows += '<tr><td>段' + (ri + 1) + '</td><td>' + s.start + ' ~ ' + s.end + '</td><td class="' + (s.cagr < 0 ? "down" : "up") + '">' + wfoPct(s.cagr) + '</td><td class="down">' + wfoPct(s.max_dd) + '</td><td class="' + (s.excess < 0 ? "down" : "up") + '">' + wfoPct(s.excess) + '</td><td class="' + (s.bh_excess < 0 ? "down" : "up") + '">' + wfoPct(s.bh_excess) + '</td></tr>';
    }
    var tb = $("rebWfoTable");
    if (tb) {
      tb.innerHTML = th + rows;
      // 表头样式与行样式统一
      var ths = tb.querySelectorAll("th"); for (var ti2 = 0; ti2 < ths.length; ti2++) ths[ti2].style.cssText = "color:#7C8DA1;text-align:left;font-weight:600;padding:4px 6px;border-bottom:1px solid #3E4E63";
      var tds = tb.querySelectorAll("td"); for (var tj2 = 0; tj2 < tds.length; tj2++) tds[tj2].style.cssText = "padding:4px 6px;border-bottom:1px solid rgba(62,78,99,0.4)";
    }
    var cagrs = segs.map(function (s) { return s.res.cagr; });
    var avg = cagrs.reduce(function (a, b) { return a + b; }, 0) / cagrs.length;
    var wi = 0;
    for (var w2 = 1; w2 < cagrs.length; w2++) if (cagrs[w2] < cagrs[wi]) wi = w2;
    var worst = segs[wi].res;
    var downRun = false;
    for (var d2 = 1; d2 < cagrs.length - 1; d2++) { if (cagrs[d2] < cagrs[d2 - 1] && cagrs[d2 + 1] < cagrs[d2]) { downRun = true; break; } }
    var posBH = segs.filter(function (s) { return s.res.bh_excess > 0; }).length;
    var sm = $("rebWfoSummary");
    if (sm) sm.innerHTML = "<b>汇总：</b>平均年化 " + wfoPct(avg) + " · 最差段 段" + (wi + 1) + "（" + worst.start + " ~ " + worst.end + "，" + wfoPct(worst.cagr) + "）· 调仓相对买入持有超额为正 " + posBH + "/" + segs.length + " 段（" + Math.round(posBH / segs.length * 100) + "%）· " +
      (downRun ? '<span style="color:#F87171">存疑：存在连续两段收益转差，稳健性不足</span>' : '<span style="color:#34D399">稳健：无连续两段收益转差</span>');
    var ch = $("rebWfoChart");
    if (ch && typeof echarts !== "undefined") {
      if (!charts["rebWfoChart"]) { charts["rebWfoChart"] = echarts.init(ch, "dark"); charts["rebWfoChart"].setOption({ backgroundColor: "transparent" }); }
      charts["rebWfoChart"].setOption({
        tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
        legend: { data: ["年化", "相对买入持有超额"], top: 0, textStyle: { fontSize: 11 } },
        grid: { left: 58, right: 18, top: 30, bottom: 26 },
        xAxis: { type: "category", data: segs.map(function (s, i) { return "段" + (i + 1); }), axisLabel: { fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { fontSize: 10, formatter: function (v) { return v + "%"; } } },
        series: [
          { name: "年化", type: "bar", barMaxWidth: 16, data: segs.map(function (s) { return +(s.res.cagr * 100).toFixed(2); }), itemStyle: { color: "#4FC3F7" } },
          { name: "相对买入持有超额", type: "bar", barMaxWidth: 16, data: segs.map(function (s) { return +(s.res.bh_excess * 100).toFixed(2); }), itemStyle: { color: "#A78BFA" } }
        ]
      });
    }
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
    // 定投结束日期默认=数据末尾（仅首次未设置时）
    var dEnd = $("dcaEndSel");
    if (dEnd && !dEnd.value && D && D.calendar && D.calendar.length) dEnd.value = D.calendar[D.calendar.length - 1];
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
    var wb = $("wfoBtn");
    if (wb) wb.addEventListener("click", runWFO);
    var rbw = $("rebWfoBtn");
    if (rbw) rbw.addEventListener("click", rebRunWFO);
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
