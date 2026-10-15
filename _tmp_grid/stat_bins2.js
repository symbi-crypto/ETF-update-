// 波动分箱回测 v2：A 模式长持 + 当前区间参数固定回放（评估用，非真实收益）
const fs = require("fs");
eval(fs.readFileSync("_tmp_grid/engine_now.js", "utf-8"));
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
const POOL = D.pool || [];
const i = D.calendar.length - 1;
const invest = 1000000, costRt = 0.00025 + 0.0005;
// 收集通过波动门槛的标的（vol 8%-55%）+ 当前 vol
const items = [];
POOL.forEach(p => {
  const s = E.gridScore(p.code, i);
  if (!s || s.gate.length) return;
  items.push({ code: p.code, name: p.name, vol: s.vol * 100 });
});
const bins = { "<15%": [], "15-20%": [], "20-30%": [], "30-40%": [], "40-50%": [], ">50%": [] };
items.forEach(x => {
  const v = x.vol;
  const key = v < 15 ? "<15%" : v < 20 ? "15-20%" : v < 30 ? "20-30%" : v < 40 ? "30-40%" : v < 50 ? "40-50%" : ">50%";
  bins[key].push(x);
});
const stats = {};
Object.keys(bins).forEach(k => {
  const arr = bins[k];
  if (!arr.length) { stats[k] = { n: 0 }; return; }
  let cagr = [], dd = [], tr = [], loDays = [];
  arr.forEach(x => {
    try {
      const g = E.gridParams(x.code, i, invest, costRt, 60);
      if (!g) return;
      const ov = { [x.code]: { lower: g.lower, upper: g.upper, step: g.step, nLevels: g.nLevels, perLevelAmt: g.perLevelAmt, baseAmt: invest, triggerBase: g.cur } };
      const r = E.backtestGrid(D, { codes: [x.code], initial_capital: invest, mgmt: "A", period_n: 12, period_unit: "周",
        commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 5, vol_win: 60, top_n: 10, idle_buy: "cash", gridOverrides: ov });
      if (!r) return;
      cagr.push(r.metrics.cagr);
      dd.push(r.metrics.max_dd);
      tr.push(r.metrics.n_trades);
      // 破网近似：价格低于区间下沿的天数占比（用 close）
      const sArr = D.series[x.code];
      const c = sArr.close, cal = D.calendar;
      let lo = 0, tot = 0;
      for (let t = 310; t < c.length; t++) { if (!(c[t] > 0) || c[t] !== c[t]) continue; tot++; if (c[t] < g.lower) lo++; }
      loDays.push(lo / tot);
    } catch (e) { /* skip */ }
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  stats[k] = { n: arr.length, ok: cagr.length,
    cagr_avg: (avg(cagr) * 100).toFixed(1) + "%",
    dd_avg: (avg(dd) * 100).toFixed(1) + "%",
    trades_avg: avg(tr).toFixed(0),
    below_lower: (avg(loDays) * 100).toFixed(1) + "%" };
});
console.log("=== 波动分箱网格回测（A模式·当前区间固定回放，评估用）===");
console.log("箱\t样本\t年化均值\t回撤均值\t成交均值\t价格低于区间下沿占比");
Object.keys(bins).forEach(k => {
  const s = stats[k];
  if (!s.n) console.log(k + "\t0\t-\t-\t-\t-");
  else console.log(k + "\t" + s.n + "(" + s.ok + ")\t" + s.cagr_avg + "\t" + s.dd_avg + "\t" + s.trades_avg + "\t" + s.below_lower);
});
