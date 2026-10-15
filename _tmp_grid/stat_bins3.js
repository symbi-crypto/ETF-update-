// 波动分箱回测 v3：B 模式组合回测（每箱标的作为组合，真实体检+撤换+补位路径）
const fs = require("fs");
eval(fs.readFileSync("_tmp_grid/engine_now.js", "utf-8"));
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
const POOL = D.pool || [];
const i = D.calendar.length - 1;
const invest = 1000000;
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
console.log("=== 波动分箱组合网格回测（B模式·12周体检·100万·Top10·佣金0.025%滑点0.05%）===");
console.log("箱\t标的数\t组合年化\t组合回撤\t成交笔数\t撤换记录");
Object.keys(bins).forEach(k => {
  const arr = bins[k];
  if (!arr.length) { console.log(k + "\t0\t-\t-\t-\t-"); return; }
  const codes = arr.map(x => x.code);
  try {
    const r = E.backtestGrid(D, { codes: codes, initial_capital: invest, mgmt: "B", period_n: 12, period_unit: "周",
      commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 5, vol_win: 60, top_n: Math.min(10, codes.length), idle_buy: "cash", gridOverrides: {} });
    if (!r) { console.log(k + "\t" + codes.length + "\t(null)"); return; }
    const h = r.health || [];
    const act = h.filter(x => x.action.indexOf("撤换") >= 0).length;
    console.log(k + "\t" + codes.length + "\t" + (r.metrics.cagr * 100).toFixed(1) + "%\t" + (r.metrics.max_dd * 100).toFixed(1) + "%\t" + r.metrics.n_trades + "\t" + act);
  } catch (e) { console.log(k + "\t" + codes.length + "\tERR " + String(e).slice(0, 50)); }
});
