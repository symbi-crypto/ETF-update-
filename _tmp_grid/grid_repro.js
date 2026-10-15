const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
const params = {
  codes: ["510300.SH"], initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周",
  commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0, vol_win: 120,
  gridOverrides: { "510300.SH": { lower: 5.7303, upper: 6.2184, step: 0.09762, nLevels: 5, perLevelAmt: 60000, baseAmt: 300000, triggerBase: 5.8 } }
};
const r = W.backtestGrid(D, params);
console.log("node 复现 UI(1只): total=", r.metrics.total_return, "trades=", r.metrics.n_trades, "cagr=", r.metrics.cagr, "dd=", r.metrics.max_dd, "shp=", r.metrics.sharpe);
// 对比：同参数但 2 只（159915 推荐参数）
const p2 = W.gridParams("159915.SZ", D.calendar.length-1, 500000, 0.00075, 120);
const params2 = JSON.parse(JSON.stringify(params));
params2.codes = ["510300.SH","159915.SZ"];
params2.gridOverrides["159915.SZ"] = { lower: p2.lower, upper: p2.upper, step: p2.step, nLevels: p2.nLevels, perLevelAmt: p2.baseAmt/p2.nLevels, baseAmt: p2.baseAmt, triggerBase: p2.cur };
const r2 = W.backtestGrid(D, params2);
console.log("node 同配置2只: total=", r2.metrics.total_return, "trades=", r2.metrics.n_trades);
