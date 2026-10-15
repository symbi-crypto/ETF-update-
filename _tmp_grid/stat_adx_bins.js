// ADX 分布统计 + 波动分箱回测（当前引擎）
const fs = require("fs");
eval(fs.readFileSync("_tmp_grid/engine_now.js", "utf-8"));
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
const POOL = D.pool || [];
const i = D.calendar.length - 1;
// 1) ADX 分布（通过当前硬门槛的标的）
const pass = [], adx25 = [], adx40 = [];
POOL.forEach(p => {
  const s = E.gridScore(p.code, i);
  if (!s || s.gate.length) return;
  pass.push({ code: p.code, name: p.name, adx: s.adx, vol: (s.vol * 100).toFixed(1) });
  if (s.adx > 25) adx25.push(p.code + (s.adx > 40 ? "*" : ""));
  if (s.adx > 40) adx40.push(p.code);
});
console.log("=== ADX 分布（通过硬门槛标的）===");
console.log("通过标的:", pass.length, " ADX>25:", adx25.length, " ADX>40:", adx40.length);
console.log("ADX>25 清单:", adx25.join(", ") || "无");
console.log("ADX>40 清单:", adx40.join(", ") || "无");
const av = pass.filter(x => x.adx && !isNaN(x.adx)).map(x => x.adx);
console.log("ADX 均值:", (av.reduce((a,b)=>a+b,0)/av.length).toFixed(1), " 范围:", Math.min(...av).toFixed(1), "-", Math.max(...av).toFixed(1));
// 2) 波动分箱回测（统一网格参数，单标的 B 模式）
const paramsBase = { initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周", commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 5, vol_win: 60, top_n: 10, idle_buy: "cash", gridOverrides: {} };
const bins = { "<15%": [], "15-20%": [], "20-30%": [], "30-40%": [], "40-50%": [], ">50%": [] };
pass.forEach(x => {
  const v = x.vol;
  const key = v < 15 ? "<15%" : v < 20 ? "15-20%" : v < 30 ? "20-30%" : v < 40 ? "30-40%" : v < 50 ? "40-50%" : ">50%";
  bins[key].push(x.code);
});
const binStats = {};
Object.keys(bins).forEach(k => {
  const codes = bins[k];
  if (!codes.length) { binStats[k] = { n: 0 }; return; }
  let cagr = [], dd = [], tr = [], breach = 0;
  codes.forEach(c => {
    try {
      const r = E.backtestGrid(D, Object.assign({ codes: [c] }, paramsBase));
      if (!r) return;
      cagr.push(r.metrics.cagr);
      dd.push(r.metrics.max_dd);
      tr.push(r.metrics.n_trades);
      if (r.health) { /* health 含撤换记录 */ }
    } catch (e) { console.log("ERR", c, String(e).slice(0, 60)); }
  });
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : NaN;
  binStats[k] = { n: codes.length, cagr_avg: (avg(cagr) * 100).toFixed(1) + "%", dd_avg: (avg(dd) * 100).toFixed(1) + "%", trades_avg: avg(tr).toFixed(0) };
});
console.log("\n=== 波动分箱网格回测（统一参数：12周体检、100万、佣金0.025%滑点0.05%）===");
console.log("箱\t标的数\t平均年化\t平均最大回撤\t平均成交笔数");
Object.keys(bins).forEach(k => {
  const b = binStats[k];
  if (b.n === 0) console.log(k + "\t0\t-\t-\t-");
  else console.log(k + "\t" + b.n + "\t" + b.cagr_avg + "\t" + b.dd_avg + "\t" + b.trades_avg);
});
