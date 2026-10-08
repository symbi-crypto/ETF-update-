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
  var poolChecked = {}, onlyRot = {};      // 全局勾选状态（跨步骤/跨重建保留）
  POOL.forEach(function (p) { poolChecked[p.code] = false; onlyRot[p.code] = false; });   // 初始全不勾选：由用户按需选择
  var stMode = "rotation";                 // rotation | rebalance
  var rebW = {};                           // 再平衡模式：code -> 用户手填比例（%），未手填用等权
  function checkedCodes() { return POOL.filter(function (p) { return poolChecked[p.code]; }); }
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
    var isReb = stMode === "rebalance";
    ["psecFactor", "psecFilter", "psecRank", "topnRow", "psecBuyAdd", "psecSell", "psecHold", "psecRegime", "psecTiming", "psecRebW", "psecTune"].forEach(function (id) {
      var el = $(id); if (el) el.style.display = isReb ? (id === "psecRebW" ? "" : "none") : (id === "psecRebW" ? "none" : "");
    });
    // 参数稳健性检查仅对排名因子有意义：再平衡模式隐藏
    var robw = $("robwrap"); if (robw) robw.style.display = isReb ? "none" : "";
    if (isReb) { var rb = $("robBox"); if (rb) rb.style.display = "none"; }
    var dyn = isReb && $("rebWeightMode") && $("rebWeightMode").value !== "fixed";
    Array.prototype.forEach.call(poolBox.querySelectorAll(".wlab"), function (el) { el.style.display = (isReb && !dyn) ? "flex" : "none"; });
    Array.prototype.forEach.call(poolBox.querySelectorAll(".rot"), function (el) { el.style.display = isReb ? "none" : ""; });
    var ws = $("wSum"); if (ws) ws.style.display = (isReb && !dyn) ? "" : "none";
    if (isReb && !dyn) { syncWIn(); updateWSum(); }
  }

  var poolBox = $("poolBox");
  function renderPool() {
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
      return p.name.toLowerCase().indexOf(kw) >= 0 || p.code.toLowerCase().indexOf(kw) >= 0;
    });
    if (!items.length) return;
    var head = document.createElement("div");
    head.className = "corr-grp";
    head.innerHTML = '<input type="checkbox" style="margin:0;accent-color:var(--acc);cursor:pointer">' + g + " (" + items.length + "只)";
    var allOn = true, anyOn = false;
    for (var ai1 = 0; ai1 < allItems.length; ai1++) { if (!poolChecked[allItems[ai1].code]) allOn = false; else anyOn = true; }
    head.querySelector("input").checked = allOn;
    head.querySelector("input").indeterminate = anyOn && !allOn;
    head.querySelector("input").addEventListener("change", function () {
      var on = this.checked;
      allItems.forEach(function (p) { poolChecked[p.code] = on; });
      // 同步本组已渲染子项的勾选状态（大类级联）
      Array.prototype.forEach.call(poolBox.querySelectorAll(".pick"), function (cb) {
        var c = cb.getAttribute("data-c");
        var hit = false;
        for (var ai2 = 0; ai2 < allItems.length; ai2++) { if (allItems[ai2].code === c) { hit = true; break; } }
        if (hit) cb.checked = on;
      });
      updatePoolCount();
      if (stMode === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    frag.appendChild(head);
    items.forEach(function (p) {
      var l = document.createElement("div");
      l.className = "corr-item";
      l.style.flexWrap = "wrap";
      l.innerHTML = '<input type="checkbox" class="pick" data-c="' + p.code + '">' +
        '<span class="corr-nm">' + p.name + "</span><span class='corr-cd'>" + p.code + "</span>" +
        "<label class='rot'><input type='checkbox' class='rotc'>仅轮动</label>" +
        "<label class='wlab'>比例<input type='number' class='wIn' data-code='" + p.code + "' min='0' max='100' step='0.1' style='width:52px;font-size:12px;padding:1px 3px;border:1px solid #334155;border-radius:3px;text-align:right'>%</label>";
      if (poolChecked[p.code]) l.querySelector(".pick").checked = true;
      if (onlyRot[p.code]) l.querySelector(".rotc").checked = true;
      var wv0 = rebW[p.code];
      if (wv0 !== undefined && wv0 >= 0) l.querySelector(".wIn").value = wv0;
      l.querySelector(".pick").addEventListener("change", function () {
        poolChecked[p.code] = this.checked;
        updatePoolCount();
        if (stMode === "rebalance") { updateWSum(); }
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
  if (stMode === "rebalance") { syncWIn(); updateWSum(); }
  }
  if ($("poolSearch")) {
    $("poolSearch").addEventListener("input", function () { renderPool(); });
    $("poolAll").addEventListener("click", function () {
      POOL.forEach(function (p) { poolChecked[p.code] = true; });
      renderPool(); updatePoolCount();
      if (stMode === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
    $("poolNone").addEventListener("click", function () {
      POOL.forEach(function (p) { poolChecked[p.code] = false; });
      renderPool(); updatePoolCount();
      if (stMode === "rebalance") { updateWSum(); }
      if (D) scheduleRun();
    });
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
  var rebSel = REB[1], rebInterval = 1, rebAnchor = "mon", startDate = "2017-01-01", endDate = "2026-09-30";
  // ---------- 因子列表（可增删；kind: roc/slope_r2/vol/risk_adj/amount/volume/rsrs/c_vs_ma/c_vs_ma_lag/ma_vs_ma/ma_vs_ma_lag） ----------
  // nwin=窗口数；多窗口时窗口2/3 用 wMin2/wMax2/wStep2/def2、wMin3/...（窗口A/B/C 语义见 title）
  // cat=因子分类：price=行情因子 / tech=技术因子 / custom=自定义因子
  var KIND_INFO = {
    roc:       { label: "涨幅",        wMin: 5,   wMax: 250, wStep: 5,  def: 20,  nwin: 1, cat: "price" },
    r2:        { label: "R²阈值",      wMin: 20,  wMax: 120, wStep: 5,  def: 25,  nwin: 1, title: "对数收盘价线性回归的R²（0~1）", cat: "tech" },
    slope_r2:  { label: "斜率动量",    wMin: 20,  wMax: 120, wStep: 5,  def: 25,  nwin: 1, cat: "tech" },
    wslope_r2: { label: "加权斜率动量", wMin: 20,  wMax: 120, wStep: 5,  def: 25,  nwin: 1, cat: "tech" },
    vol:       { label: "波动率", wMin: 20, wMax: 120, wStep: 5, def: 60, nwin: 1, cat: "tech" },
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
  $("regSw").addEventListener("change", scheduleRun);
  if ($("idleSel")) $("idleSel").addEventListener("change", scheduleRun);
  if ($("stdSel")) $("stdSel").addEventListener("change", function () { updateStdSel(); scheduleRun(); });
  $("maIn").addEventListener("input", function () { $("maV").textContent = this.value; scheduleRun(); });
  $("weakMode").addEventListener("change", scheduleRun);
  $("weakMa").addEventListener("change", scheduleRun);
  // ---------- 走弱期指数选择（可多选，默认全选 4 宽基） ----------
  var regIdxSel = {}, tmIdxSel = {}, tmUse = false, tmN = 200;
  function chipToggle(box, sel, code) {
    return function () {
      sel[code] = !sel[code];
      renderIdxChips(box, sel, box.dataset.kind);
      scheduleRun();
    };
  }
  function renderIdxChips(box, sel, kind) {
    if (!box) return;
    box.innerHTML = "";
    (D && D.indexNames ? D.indexNames : []).forEach(function (it) {
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
    D.indexNames.forEach(function (it) { regIdxSel[it.code] = true; });
    D.indexNames.forEach(function (it) { tmIdxSel[it.code] = it.code === "index_000300.SH"; });
    renderIdxChips($("regIdxChips"), regIdxSel, "reg");
    renderIdxChips($("tmIdxChips"), tmIdxSel, "timing");
  }
  $("tmSw").addEventListener("change", function () { tmUse = this.checked; scheduleRun(); });
  $("tmNIn").addEventListener("input", function () { tmN = +this.value || 200; $("tmV").textContent = tmN; scheduleRun(); });
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

  var startOptions = ["2017-01-01", "2018-01-01", "2019-01-01", "2020-01-01", "2021-01-01", "2022-01-01", "2023-01-01", "2024-01-01"];
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
    (D ? D.pool : POOL).forEach(function (p) {   // D 未解析（第一步）时用全局池元信息
      if (poolChecked[p.code]) codes.push(p.code);
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
      mode: $("modeSel") ? $("modeSel").value : "rotation",
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
      use_regime_filter: $("regSw").checked,
      regime_ma_window: +$("maIn").value,
      regime_indices: (D ? D.indexNames : []).filter(function (it) { return regIdxSel[it.code]; }).map(function (it) { return it.code; }),
      use_timing: tmUse,
      timing_ma_window: tmN,
      timing_indices: (D ? D.indexNames : []).filter(function (it) { return tmIdxSel[it.code]; }).map(function (it) { return it.code; }),
      regime_require_below: 3,
      regime_require_above: 3,
      weak_period_mode: $("weakMode").value,
      weak_period_use_ma_filter: $("weakMa").checked,
      fallback_when_no_signal: $("idleSel") ? $("idleSel").value : "cash",
      commission_rate: (+$("cmIn").value) / 10000,
      slippage_rate: (+$("slIn").value) / 10000,
      tiered_slippage: $("tierSw") ? $("tierSw").checked : false,
      holding_weight: $("hwSel") ? $("hwSel").value : "equal",
      start_date: startDate,
      end_date: endDate,
      initial_capital: Math.max(1000, +$("stInvIn").value || 1000000),
      risk_free_rate: 0.02,
      overseas_codes: D ? D.overseas : []
    };
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
    (D ? D.pool : POOL).forEach(function (it) {
      poolChecked[it.code] = want.indexOf(it.code) >= 0;
      onlyRot[it.code] = wantRot.indexOf(it.code) >= 0;
    });
    // 策略模式 + 再平衡权重回填
    if ($("modeSel")) { stMode = $("modeSel").value = p.mode || "rotation"; }
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
    renderMfLib();
    renderMfList();
    renderFltList();
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
    if ($("hwSel")) $("hwSel").value = p.holding_weight || "equal";
    if ($("rebWeightMode")) $("rebWeightMode").value = p.reb_weight_mode || "fixed";
    // 走弱期
    $("regSw").checked = !!p.use_regime_filter;
    var ma = $("maIn"); if (ma) { ma.value = +(p.regime_ma_window) || 10; $("maV").textContent = ma.value; }
    // 走弱期指数选择
    var regIdxWant = p.regime_indices || [];
    (D ? D.indexNames : []).forEach(function (it) { regIdxSel[it.code] = regIdxWant.indexOf(it.code) >= 0; });
    renderIdxChips($("regIdxChips"), regIdxSel, "reg");
    // 大盘择时
    tmUse = !!p.use_timing;
    if ($("tmSw")) $("tmSw").checked = tmUse;
    tmN = +(p.timing_ma_window) || 200;
    var tmIn = $("tmNIn");
    if (tmIn) { tmIn.value = tmN; $("tmV").textContent = tmN; }
    var tmWant = p.timing_indices || ["index_000300.SH"];
    (D ? D.indexNames : []).forEach(function (it) { tmIdxSel[it.code] = tmWant.indexOf(it.code) >= 0; });
    renderIdxChips($("tmIdxChips"), tmIdxSel, "timing");
    $("weakMode").value = p.weak_period_mode || "overseas_pool";
    if ($("idleSel")) $("idleSel").value = p.fallback_when_no_signal || "cash";
    $("weakMa").checked = !!p.weak_period_use_ma_filter;
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
    var res;
    try {
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
  }

  function renderCompositeIC(res, params, D) {
    var card = $("cICCard");
    if (!card) return;
    var snaps = res.ic_snapshots;
    if (!snaps || !snaps.length) { card.style.display = "none"; return; }
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
      var a = series[c]; if (!a) return null;
      var cl = a.close; if (!cl) return null;
      var p0 = cl[i], p1 = cl[i + fut];
      if (miss(p0) || miss(p1) || p0 <= 0) return null;
      return p1 / p0 - 1;
    }
    function compIC(fut) {
      var ics = [], dates = [], k, j, c;
      for (k = 0; k < snaps.length; k++) {
        var sn = snaps[k];
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
      kpi("平均 IC", mIC.toFixed(3), "主窗口 " + baseFut + " 日", icolor(mIC)) +
      kpi("ICIR", icir.toFixed(2), "均值/标准差", icolor(icir)) +
      kpi("有效占比", (posRate * 100).toFixed(0) + "%", "IC>0 截面占比", icolor(mIC)) +
      kpi("截面数", String(main.ics.length), "有效调仓截面", "");

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
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  function renderKpis(r) {
    var m = r.metrics;
    var excess = m.total_return - m.benchmark.total;
    var cards = [
      { t: "累计收益", v: FMT.pct(m.total_return), s: "超额 " + (excess * 100 >= 0 ? "+" : "") + (excess * 100).toFixed(1) + "pp", cls: m.total_return >= 0 ? "up" : "down" },
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
      $("step1").style.display = "none";
      $("step2").style.display = "";
      scheduleRun();
      $("stDetail").style.display = "none";
      showNotice("已应用策略参数并回测：" + stCurName);
      location.hash = "#/backtest";
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
      row.innerHTML = '<div class="nm">' + k.replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }) +
        '</div><div class="meta"><span>创建：' + fmtDate(m[k]._saved_at) + '</span><span class="ld">计算中…</span></div>' +
        '<div class="pos">持仓回测中…</div>';
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
        try { res = stRes[k2] || engine.backtest(D, m[k2]); stRes[k2] = res; } catch (e) { res = null; }
        var row = rows[k2];
        if (!row) { next(); return; }
        if (res) {
          var lt = lastTradeLine(res);
          var line;
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
    var base = latestCap(name, res);          // 按最新投资额分配
    var isReb = m[name].mode === "rebalance";
    var rwM = isReb ? (m[name].reb_weights || {}) : null;
    var t = res.trades[res.trades.length - 1];
    var holds = (t && t.to) || [];
    var html = '<table class="trades" style="margin-top:4px;table-layout:fixed;width:100%"><colgroup><col style="width:36%"><col style="width:21%"><col style="width:21%"><col style="width:22%"></colgroup><thead><tr><th class="fc">买入标的</th><th>买入金额</th><th>最新未复权价</th><th>买入份额</th></tr></thead><tbody>';
    if (!holds.length) {
      var cashAll = base;
      var cpx0 = lastRawClose("511990.SH");
      var cs0 = lotShares(cashAll, cpx0);
      html += "<tr><td class='fc'>货币ETF</td><td>" + fmtN(cashAll) + "</td><td>" + (cpx0 ? cpx0.toFixed(4) : "—") + "</td><td>" + (cs0 ? fmtN(cs0) : "—") + "</td></tr>";
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
        var cpx = lastRawClose("511990.SH");
        var cs = lotShares(cashAmt, cpx);
        html += "<tr><td class='fc'>货币ETF</td><td>" + fmtN(cashAmt) + "</td><td>" + (cpx ? cpx.toFixed(4) : "—") + "</td><td>" + (cs ? fmtN(cs) : "—") + "</td></tr>";
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
      stStart.value = (m[name].start_date) || "2017-01-01";
      stStart.onchange = function () {
        var v = stStart.value || "2017-01-01";
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

  // ---------- 启动：第一步（仅标的池元信息，秒开） ----------
  renderPool();
  applyModeUI();
  updatePoolCount();
  var ms = $("modeSel");
  if (ms) ms.addEventListener("change", function () {
    stMode = this.value;
    applyModeUI();
    if (D) scheduleRun();
  });
  $("nextBtn").addEventListener("click", function () {
    var nb = $("nextBtn");
    nb.disabled = true; nb.textContent = "正在加载行情数据并回测…";
    setTimeout(function () {
      ensureData(function () {
        $("step1").style.display = "none";
        $("step2").style.display = "";
        renderSelSummary();
        window.scrollTo(0, 0);
        boot();
      });
      nb.disabled = false; nb.textContent = "下一步 · 开始回测";
    }, 30);
  });
  $("backBtn").addEventListener("click", function () {
    var nb2 = $("nextBtn");
    nb2.disabled = false; nb2.textContent = "下一步 · 开始回测";
    $("step2").style.display = "none";
    $("step1").style.display = "";
    renderPool();
    applyModeUI();
    updatePoolCount();
  });

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
    $("viewBacktest").style.display = v === "backtest" ? "" : "none";
    $("viewStrategies").style.display = v === "strategies" ? "" : "none";
    $("viewCorr").style.display = v === "correlation" ? "" : "none";
    $("viewCombo").style.display = v === "combo" ? "" : "none";
    $("viewIc").style.display = v === "ic" ? "" : "none";
    $("tabBacktest").className = v === "backtest" ? "on" : "";
    $("tabStrategies").className = v === "strategies" ? "on" : "";
    $("tabCorr").className = v === "correlation" ? "on" : "";
    $("tabCombo").className = v === "combo" ? "on" : "";
    $("tabIc").className = v === "ic" ? "on" : "";
    if (v === "strategies") renderStrategyList();
    if (v === "correlation" && window.CorrView) CorrView.render();
    if (v === "combo") renderComboSetup();
    if (v === "ic" && window.ICView) ICView.render();
  }
  function hashView() {
    var h = location.hash || "";
    if (h.indexOf("strategies") >= 0) return "strategies";
    if (h.indexOf("correlation") >= 0 || h.indexOf("corr") >= 0) return "correlation";
    if (h.indexOf("combo") >= 0) return "combo";
    if (h.indexOf("ic") >= 0 || h.indexOf("factor") >= 0) return "ic";
    return "backtest";
  }
  $("tabBacktest").addEventListener("click", function () { location.hash = "#/backtest"; });
  $("tabStrategies").addEventListener("click", function () { location.hash = "#/strategies"; });
  $("tabCorr").addEventListener("click", function () { location.hash = "#/correlation"; });
  $("tabCombo").addEventListener("click", function () { location.hash = "#/combo"; });
  $("tabIc").addEventListener("click", function () { location.hash = "#/ic"; });
  window.addEventListener("hashchange", function () { showView(hashView()); });

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
      var comboRes = buildCombo(resList, w, intervalDays);
      renderComboResult(names, resList, comboRes, w);
    });
  }
  function buildCombo(resList, w, intervalDays) {
    var L = resList[0].nav.length;
    var navs = resList.map(function (r) { return r.nav; });
    var ww = w.slice();
    var combo = new Array(L); combo[0] = 1;
    for (var t = 1; t < L; t++) {
      var ri = navs.map(function (nav) { var p0 = nav[t - 1]; return (p0 > 0) ? (nav[t] / p0 - 1) : 0; });
      var cr = 0; for (var k = 0; k < navs.length; k++) cr += ww[k] * ri[k];
      combo[t] = combo[t - 1] * (1 + cr);
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
    // 再平衡模式参数少、无需折叠：隐藏折叠标题、全部展开（还原平铺效果）
    var msEl = document.getElementById("modeSel");
    function setFoldByMode() {
      var reb = msEl && msEl.value === "rebalance";
      var hsEls = document.querySelectorAll(".sfold-h");
      for (var a = 0; a < hsEls.length; a++) hsEls[a].style.display = reb ? "none" : "";
      if (tog) tog.style.display = reb ? "none" : "";
      var bs = document.querySelectorAll(".sfold-b");
      for (var c = 0; c < bs.length; c++) bs[c].classList.remove("hide");
      if (!reb) apply();
    }
    if (msEl) { msEl.addEventListener("change", setFoldByMode); setFoldByMode(); }
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
    var n = 0;
    POOL.forEach(function (p) {
      var fd = FIRSTDATE[p.code];
      if (fd && fd <= base) n++;
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

  // ---------- 参数稳健性检查：排名因子窗口±5日扰动回测 ----------
  function robustnessCheck() {
    var box = $("robBox"), state = $("robState");
    if (!D || !engine) { if (state) state.textContent = "请先进入回测"; return; }
    var params = getParams();
    var facs = params.factors || [];
    var rankFacs = facs.filter(function (f) { return (f.usage || "rank") !== "filter"; });
    if (!rankFacs.length) rankFacs = facs;
    if (!rankFacs.length) { if (box) { box.style.display = ""; box.innerHTML = "当前没有排名因子，无法进行稳健性检查。"; } return; }
    if (state) state.textContent = "检查中（" + rankFacs.length * 2 + " 次回测）…";
    try {
      var base = engine.backtest(D, JSON.parse(JSON.stringify(params))).metrics.total_return;
      var variants = [];
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
          var r = engine.backtest(D, pf);
          variants.push({ label: f.kind + " 窗口 " + f.window + "→" + w, total: r.metrics.total_return });
        });
      });
      if (!variants.length) { if (box) { box.style.display = ""; box.innerHTML = "无可用扰动变体（窗口边界）。"; } if (state) state.textContent = ""; return; }
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
    } catch (e) {
      if (state) state.textContent = "";
      showNotice("稳健性检查失败：" + String((e && e.message) || e));
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
    var robBtn = $("robBtn");
    if (robBtn) robBtn.onclick = robustnessCheck;
    showView(hashView());
    $("runBtn").addEventListener("click", run);
    setTimeout(run, 60);          // 显示后执行默认回测
  }

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
